import { DurableObject } from 'cloudflare:workers';
import { applyEvent, emptyOffice, type OfficeState } from '../shared/protocol';
import { batchSchema, digest, matches, canView, token, viewerCookie, viewerFromCookie, validEventTime, officeIdPattern } from '../shared/security';
import { shareSchema, privateSharing, publicOffice, type ShareSettings } from '../shared/public-office';
import { clockSettingsSchema, timeZoneSchema } from '../shared/clock';
interface Env { OFFICES: DurableObjectNamespace<Office>; ASSETS: Fetcher; REGISTRATION_KEY?: string; PUBLIC_SIGNUP?: string; BUILD_SHA?: string; SIGNUP_LIMITER: RateLimit; AUTH_LIMITER: RateLimit }
type RecordData = { office: OfficeState; ingestHash: string; viewerHash: string; ownerHash?: string; sharing?: ShareSettings };
const json = (data: unknown, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
async function readBytes(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body');
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new Error('Body too large'); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}
async function readBody(request: Request) {
  const parsed = JSON.parse(new TextDecoder().decode(await readBytes(request)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
  return parsed;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      // Finish the bounded incoming upload before a Durable Object can answer.
      // Forwarding a live body to a route that doesn't read it races workerd's
      // stream cleanup, especially for slow uploads or early auth rejection.
      if (request.body) request = new Request(request, { body: await readBytes(request) });
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
      const publicSignup = env.PUBLIC_SIGNUP === 'true';
      if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, storage: 'cloudflare', registration: publicSignup || !!env.REGISTRATION_KEY, publicSignup, build: env.BUILD_SHA ?? 'local' });
      if (request.method === 'POST' && url.pathname === '/api/offices') {
        // Signup has no user identity yet. This short IP limit reduces automated creation;
        // it is intentionally modest protection, not a global billing/quota guarantee.
        if (!(await env.SIGNUP_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' })).success) return json({ error: 'Please wait a minute before creating another office.' }, 429, { 'Retry-After': '60' });
        const { invite, timeZone } = await readBody(request);
        const zone = timeZone === undefined ? undefined : timeZoneSchema.safeParse(timeZone);
        if (zone && !zone.success) return json({ error: 'Invalid time zone' }, 400);
        if (!publicSignup) {
          if (!env.REGISTRATION_KEY) return json({ error: 'Registration is temporarily unavailable.' }, 503);
          if (!await matches(String(invite ?? ''), await digest(env.REGISTRATION_KEY))) return json({ error: 'An invite code is needed for this office.' }, 403);
        }
        const officeId = crypto.randomUUID(), ingestKey = token(), viewerKey = token(), ownerKey = token();
        const stub = env.OFFICES.get(env.OFFICES.idFromName(officeId));
        await stub.initialize(await digest(ingestKey), await digest(viewerKey), await digest(ownerKey), zone?.data);
        return json({ officeId, ingestKey, viewerKey, ownerKey }, 201, { 'Set-Cookie': viewerCookie(officeId, viewerKey, true) });
      }
      if (['/api/session', '/api/keys', '/api/office', '/api/share', '/api/clock'].includes(url.pathname) && !(await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' })).success) return json({ error: 'Too many attempts. Try again in a minute.' }, 429, { 'Retry-After': '60' });
      if (request.method === 'POST' && url.pathname === '/api/session') {
        const { officeId, viewerKey } = await readBody(request);
        if (!officeIdPattern.test(String(officeId))) return json({ error: 'Invalid office credentials' }, 401);
        const stub = env.OFFICES.get(env.OFFICES.idFromName(officeId));
        if (!await stub.login(String(viewerKey ?? ''))) return json({ error: 'Invalid office credentials or too many attempts' }, 401);
        return json({ ok: true }, 200, { 'Set-Cookie': viewerCookie(officeId, viewerKey, true) });
      }
      if (!['/api/connection', '/api/events', '/api/snapshot', '/api/stream', '/api/keys', '/api/office', '/api/share', '/api/public', '/api/public/stream', '/api/clock'].includes(url.pathname)) return json({ error: 'Not found' }, 404);
      const officeId = request.headers.get('X-Office-Id') || url.searchParams.get('office') || '';
      if (request.headers.has('X-Office-Id') && url.searchParams.has('office') && request.headers.get('X-Office-Id') !== url.searchParams.get('office')) return json({ error: 'Office IDs must match' }, 400);
      if (!officeIdPattern.test(officeId)) return json({ error: 'Invalid office ID' }, 400);
      return await env.OFFICES.get(env.OFFICES.idFromName(officeId)).fetch(request);
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && /body/i.test(error.message))) return json({ error: 'Invalid or oversized request' }, 400);
      return json({ error: 'The office is temporarily unavailable' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

export class Office extends DurableObject<Env> {
  private record: RecordData | undefined;
  private rate = { at: 0, events: 0, logins: 0 };
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.record = await ctx.storage.get<RecordData>('state'); });
  }
  async initialize(ingestHash: string, viewerHash: string, ownerHash: string, timeZone?: string) {
    if (this.record) throw new Error('Office already exists');
    this.record = { office: { ...emptyOffice(), timeZone }, ingestHash, viewerHash, ownerHash };
    await this.ctx.storage.put('state', this.record);
  }
  private limited(kind: 'events' | 'logins', max: number) {
    if (Date.now() - this.rate.at > 60_000) this.rate = { at: Date.now(), events: 0, logins: 0 };
    return ++this.rate[kind] > max;
  }
  async login(key: string) { return !this.limited('logins', 30) && !!this.record && await canView(key, this.record); }
  async fetch(request: Request): Promise<Response> {
    if (!this.record) return json({ error: 'Office not found' }, 404);
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/clock') {
      if (this.limited('logins', 30) || !await matches((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), this.record.ownerHash ?? '')) return json({ error: 'The recovery key is required to set the office clock.' }, 401);
      const parsed = clockSettingsSchema.safeParse(await readBody(request));
      if (!parsed.success) return json({ error: 'Choose a valid IANA time zone.' }, 400);
      this.record.office = { ...this.record.office, timeZone: parsed.data.timeZone, revision: this.record.office.revision + 1 };
      await this.ctx.storage.put('state', this.record);
      this.broadcast(); return json(parsed.data);
    }
    if (url.pathname === '/api/share' && ['GET', 'POST'].includes(request.method)) {
      if (this.limited('logins', 30) || !await matches((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), this.record.ownerHash ?? '')) return json({ error: 'The recovery key is required to change sharing.' }, 401);
      if (request.method === 'GET') return json(this.record.sharing ?? privateSharing());
      const parsed = shareSchema.safeParse(await readBody(request));
      if (!parsed.success) return json({ error: 'Check the office name and sharing settings.' }, 400);
      this.record.sharing = parsed.data;
      await this.ctx.storage.put('state', this.record);
      for (const ws of this.ctx.getWebSockets('public')) { ws.send(JSON.stringify({ type: 'sharing_changed' })); ws.close(1000, 'Sharing changed'); }
      return json(parsed.data);
    }
    if (request.method === 'GET' && ['/api/public', '/api/public/stream'].includes(url.pathname)) {
      if (!this.record.sharing?.enabled) return json({ error: 'This office is private or the visitor link is closed.' }, 404);
      const view = publicOffice(this.record.office, this.record.sharing);
      if (url.pathname === '/api/public') return json(view);
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required' }, 400);
      if (this.ctx.getWebSockets('public').length >= 20) return json({ error: 'The visitor lounge is full. Try again shortly.' }, 429);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ['public']); server.send(JSON.stringify({ type: 'snapshot', ...view }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if ((request.method === 'POST' && url.pathname === '/api/keys') || (request.method === 'DELETE' && url.pathname === '/api/office')) {
      if (this.limited('logins', 30) || !await matches((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), this.record.ownerHash ?? '')) return json({ error: 'The recovery key is required.' }, 401);
      const officeId = url.searchParams.get('office') || '';
      if (!officeIdPattern.test(officeId)) return json({ error: 'Invalid office ID' }, 400);
      if (request.method === 'DELETE') {
        await this.ctx.storage.deleteAll();
        this.record = undefined;
        for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Office deleted');
        return json({ ok: true }, 200, { 'Set-Cookie': 'sidequest=; HttpOnly; SameSite=Strict; Secure; Path=/api; Max-Age=0' });
      }
      const ingestKey = token(), viewerKey = token(), ownerKey = token();
      this.record.ingestHash = await digest(ingestKey); this.record.viewerHash = await digest(viewerKey); this.record.ownerHash = await digest(ownerKey);
      await this.ctx.storage.put('state', this.record);
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Keys replaced');
      return json({ officeId, ingestKey, viewerKey, ownerKey }, 200, { 'Set-Cookie': viewerCookie(officeId, viewerKey, true) });
    }
    if (request.method === 'POST' && url.pathname === '/api/connection') {
      if (!await matches((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), this.record.ingestHash)) return json({ error: 'Invalid ingest credentials' }, 401);
      return json({ ok: true, storage: 'cloudflare' });
    }
    if (request.method === 'POST' && url.pathname === '/api/events') {
      if (!await matches((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), this.record.ingestHash)) return json({ error: 'Invalid ingest credentials' }, 401);
      if (this.limited('events', 600)) return json({ error: 'Event rate limit reached' }, 429);
      let input; try { input = batchSchema.safeParse(await readBody(request)); } catch { return json({ error: 'Invalid body' }, 400); }
      if (!input.success || input.data.events.some(e => !validEventTime(e.at))) return json({ error: 'Invalid event batch' }, 400);
      for (const event of input.data.events) this.record.office = applyEvent(this.record.office, event);
      await this.ctx.storage.put('state', this.record);
      this.broadcast();
      return json({ accepted: input.data.events.length, revision: this.record.office.revision });
    }
    const officeId = url.searchParams.get('office') || '';
    if (!await canView(viewerFromCookie(request.headers.get('Cookie') || '', officeId), this.record)) return json({ error: 'Viewer authentication required' }, 401);
    if (request.method === 'GET' && url.pathname === '/api/snapshot') return json(this.record.office);
    if (request.method === 'GET' && url.pathname === '/api/stream' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (this.ctx.getWebSockets('private').length >= 10) return json({ error: 'Too many office viewers' }, 429);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ['private']);
      server.send(JSON.stringify({ type: 'snapshot', office: this.record.office }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'Not found' }, 404);
  }
  private broadcast() {
    if (!this.record) return;
      const message = JSON.stringify({ type: 'snapshot', office: this.record.office });
      for (const ws of this.ctx.getWebSockets()) { try {
        if (this.ctx.getTags(ws).includes('public')) {
          if (this.record.sharing?.enabled) ws.send(JSON.stringify({ type: 'snapshot', ...publicOffice(this.record.office, this.record.sharing) }));
        } else if (this.ctx.getTags(ws).includes('private')) ws.send(message);
        else ws.close(1000, 'Reconnect');
      } catch { ws.close(1011, 'Reconnect'); } }
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) { if (message === 'ping') ws.send('pong'); }
  webSocketClose(ws: WebSocket) { ws.close(1000, 'Closed'); }
  webSocketError(ws: WebSocket) { ws.close(1011, 'Reconnect'); }
}
