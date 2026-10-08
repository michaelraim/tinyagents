import { DurableObject } from 'cloudflare:workers';
import { applyEvent, emptyOffice, type OfficeState } from '../shared/protocol';
import { batchSchema, digest, matches, canView, token, viewerCookie, viewerFromCookie, validEventTime, officeIdPattern } from '../shared/security';
import { shareSchema, privateSharing, publicOffice, type ShareSettings } from '../shared/public-office';
import { clockSettingsSchema, timeZoneSchema } from '../shared/clock';
import { createAuth, providers, type AuthEnv } from './auth';
import { accountHeader, sessionHeader, accountRoute, ownedOffice, newOfficeSecrets } from './accounts';
interface Env extends AuthEnv { OFFICES: DurableObjectNamespace<Office>; ASSETS: Fetcher; REGISTRATION_KEY?: string; PUBLIC_SIGNUP?: string; BUILD_SHA?: string; SIGNUP_LIMITER: RateLimit; AUTH_LIMITER: RateLimit }
type RecordData = { office: OfficeState; ingestHash: string; viewerHash: string; ownerHash?: string; sharing?: ShareSettings; connections?: { id: string; name: string; hash: string; createdAt: number }[] };
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
      // Never forward a caller-supplied assertion of account ownership.
      const cleanHeaders = new Headers(request.headers);
      cleanHeaders.delete(accountHeader); cleanHeaders.delete(sessionHeader);
      request = new Request(request, { headers: cleanHeaders });
      const enabled = providers(env), socialLogin = enabled.github || enabled.gitlab;
      const publicSignup = env.PUBLIC_SIGNUP === 'true' && !socialLogin;
      if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, storage: 'cloudflare', registration: socialLogin || publicSignup || !!env.REGISTRATION_KEY, publicSignup, providers: enabled, build: env.BUILD_SHA ?? 'local' });
      const auth = env.AUTH_DB && env.BETTER_AUTH_SECRET && env.AUTH_BASE_URL ? createAuth(env) : null;
      if (url.pathname.startsWith('/api/auth/')) {
        const route = url.pathname.slice('/api/auth/'.length);
        if (request.method === 'GET' && route === 'error') return new Response(null, { status: 302, headers: { Location: '/office?auth_error=1', 'Cache-Control': 'no-store' } });
        const allowed = request.method === 'GET' ? ['callback/github', 'callback/gitlab', 'get-session', 'list-accounts'] : request.method === 'POST' ? ['sign-in/social', 'link-social', 'sign-out'] : [];
        if (!allowed.includes(route)) return json({ error: 'Not found' }, 404);
        if (!auth) return json({ error: 'Social sign-in is being set up. Please try again soon.' }, 503);
        if (route === 'sign-in/social' || route === 'link-social') {
          if (origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
          const body = await readBody(request);
          if (body.provider !== 'github' && body.provider !== 'gitlab') return json({ error: 'Choose GitHub or GitLab.' }, 400);
          if (!enabled[body.provider as 'github' | 'gitlab']) return json({ error: 'This sign-in provider is being set up. Please try again soon.' }, 503);
          // Provider permissions are fixed here, never expanded by client input.
          request = new Request(request, { body: JSON.stringify({ provider: body.provider, callbackURL: '/office?welcome=1', errorCallbackURL: '/office?auth_error=1' }) });
        }
        if (route !== 'get-session' && !(await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' })).success) return json({ error: 'Too many attempts. Try again in a minute.' }, 429);
        if (route === 'sign-out') {
          if (origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
          const current = await auth.api.getSession({ headers: request.headers });
          const id = current && await ownedOffice(env, current.user.id);
          if (id && current) await env.OFFICES.get(env.OFFICES.idFromName(id)).closeSession(current.session.id);
          const headers = new Headers(request.headers); headers.set('Content-Type', 'application/json');
          request = new Request(request, { headers, body: '{}' });
        }
        const response = await auth.handler(request);
        if (route === 'sign-out') {
          const headers = new Headers(response.headers);
          headers.append('Set-Cookie', 'sidequest=; HttpOnly; SameSite=Strict; Secure; Path=/api; Max-Age=0');
          return new Response(response.body, { status: response.status, headers });
        }
        return response;
      }
      if (url.pathname === '/api/account' || url.pathname === '/api/account/office') {
        if (request.method !== 'GET' && !(await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' })).success) return json({ error: 'Please try again in a minute.' }, 429);
        return await accountRoute(request, env, auth ? await auth.api.getSession({ headers: request.headers }) : null);
      }
      if (request.method === 'POST' && url.pathname === '/api/offices') {
        if (socialLogin) return json({ error: 'Sign in with GitHub or GitLab to create your office.' }, 403);
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
      if (['/api/session', '/api/keys', '/api/office', '/api/share', '/api/clock', '/api/connections'].includes(url.pathname) && !(await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' })).success) return json({ error: 'Too many attempts. Try again in a minute.' }, 429, { 'Retry-After': '60' });
      if (request.method === 'POST' && url.pathname === '/api/session') {
        const { officeId, viewerKey } = await readBody(request);
        if (!officeIdPattern.test(String(officeId))) return json({ error: 'Invalid office credentials' }, 401);
        const stub = env.OFFICES.get(env.OFFICES.idFromName(officeId));
        if (!await stub.login(String(viewerKey ?? ''))) return json({ error: 'Invalid office credentials or too many attempts' }, 401);
        return json({ ok: true }, 200, { 'Set-Cookie': viewerCookie(officeId, viewerKey, true) });
      }
      if (!['/api/connection', '/api/events', '/api/snapshot', '/api/stream', '/api/keys', '/api/office', '/api/share', '/api/public', '/api/public/stream', '/api/clock', '/api/connections'].includes(url.pathname)) return json({ error: 'Not found' }, 404);
      const officeId = request.headers.get('X-Office-Id') || url.searchParams.get('office') || '';
      if (request.headers.has('X-Office-Id') && url.searchParams.has('office') && request.headers.get('X-Office-Id') !== url.searchParams.get('office')) return json({ error: 'Office IDs must match' }, 400);
      if (!officeIdPattern.test(officeId)) return json({ error: 'Invalid office ID' }, 400);
      if (auth && !['/api/events', '/api/connection', '/api/public', '/api/public/stream'].includes(url.pathname)) {
        const session = await auth.api.getSession({ headers: request.headers });
        if (session) {
          // A signed-in account never inherits a different office's legacy cookie.
          if (await ownedOffice(env, session.user.id) !== officeId) return json({ error: 'This office belongs to another account.' }, 403);
          if (request.method !== 'GET' && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
          const headers = new Headers(request.headers);
          headers.set(accountHeader, session.user.id); headers.set(sessionHeader, session.session.id);
          request = new Request(request, { headers });
        }
      }
      const response = await env.OFFICES.get(env.OFFICES.idFromName(officeId)).fetch(request);
      if (request.method === 'DELETE' && url.pathname === '/api/office' && response.ok && env.AUTH_DB) await env.AUTH_DB.prepare('DELETE FROM office_owner WHERE officeId = ?').bind(officeId).run();
      return response;
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
  async ensureAccountOffice(timeZone: string) {
    if (!this.record) { const [ingest, viewer, owner] = await newOfficeSecrets(); if (!this.record) await this.initialize(ingest, viewer, owner, timeZone); }
  }
  async proveOwner(key: string) { return !this.limited('logins', 30) && !!this.record && await matches(key, this.record.ownerHash ?? ''); }
  async closeSession(id: string) { for (const ws of this.ctx.getWebSockets('session:' + id)) { ws.send(JSON.stringify({ type: 'session_ended' })); ws.close(1000, 'Signed out'); } }
  async deleteOwnedOffice() {
    await this.ctx.storage.deleteAll(); this.record = undefined;
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Office deleted');
  }
  private owner(request: Request) { return request.headers.has(accountHeader) || matches((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), this.record?.ownerHash ?? ''); }
  private async ingest(request: Request) {
    const key = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    return !!this.record && (await matches(key, this.record.ingestHash) || (await Promise.all((this.record.connections ?? []).map(c => matches(key, c.hash)))).some(Boolean));
  }
  private limited(kind: 'events' | 'logins', max: number) {
    if (Date.now() - this.rate.at > 60_000) this.rate = { at: Date.now(), events: 0, logins: 0 };
    return ++this.rate[kind] > max;
  }
  async login(key: string) { return !this.limited('logins', 30) && !!this.record && await canView(key, this.record); }
  async fetch(request: Request): Promise<Response> {
    if (!this.record) return json({ error: 'Office not found' }, 404);
    const url = new URL(request.url);
    if (url.pathname === '/api/connections') {
      if (!await this.owner(request)) return json({ error: 'Owner sign-in required.' }, 401);
      const connections = this.record.connections ?? [];
      if (request.method === 'GET') return json(connections.map(({ id, name, createdAt }) => ({ id, name, createdAt })));
      if (request.method === 'DELETE') {
        this.record.connections = connections.filter(c => c.id !== url.searchParams.get('id'));
        await this.ctx.storage.put('state', this.record); return json({ ok: true });
      }
      if (request.method === 'POST') {
        const body = await readBody(request);
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60) return json({ error: 'Name this computer (up to 60 characters).' }, 400);
        const ingestKey = token(), id = crypto.randomUUID();
        const hash = await digest(ingestKey);
        // Re-read after asynchronous parsing/hashing so simultaneous pairings
        // cannot replace one another's connection or bypass the limit.
        const current = this.record.connections ?? [];
        if (current.length >= 20) return json({ error: 'Remove an old connection before adding another (20 maximum).' }, 409);
        this.record.connections = [...current, { id, name: body.name.trim(), hash, createdAt: Date.now() }];
        await this.ctx.storage.put('state', this.record);
        return json({ id, officeId: url.searchParams.get('office'), ingestKey }, 201);
      }
      return json({ error: 'Method not allowed' }, 405);
    }
    if (request.method === 'POST' && url.pathname === '/api/clock') {
      if (this.limited('logins', 30) || !await this.owner(request)) return json({ error: 'Owner sign-in or the recovery key is required to set the office clock.' }, 401);
      const parsed = clockSettingsSchema.safeParse(await readBody(request));
      if (!parsed.success) return json({ error: 'Choose a valid IANA time zone.' }, 400);
      this.record.office = { ...this.record.office, timeZone: parsed.data.timeZone, revision: this.record.office.revision + 1 };
      await this.ctx.storage.put('state', this.record);
      await this.broadcast(); return json(parsed.data);
    }
    if (url.pathname === '/api/share' && ['GET', 'POST'].includes(request.method)) {
      if (this.limited('logins', 30) || !await this.owner(request)) return json({ error: 'Owner sign-in or the recovery key is required to change sharing.' }, 401);
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
      if (this.limited('logins', 30) || !await this.owner(request)) return json({ error: 'Owner sign-in or the recovery key is required.' }, 401);
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
      this.record.connections = [];
      await this.ctx.storage.put('state', this.record);
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Keys replaced');
      return json({ officeId, ingestKey, viewerKey, ownerKey }, 200, { 'Set-Cookie': viewerCookie(officeId, viewerKey, true) });
    }
    if (request.method === 'POST' && url.pathname === '/api/connection') {
      if (!await this.ingest(request)) return json({ error: 'Invalid ingest credentials' }, 401);
      return json({ ok: true, storage: 'cloudflare' });
    }
    if (request.method === 'POST' && url.pathname === '/api/events') {
      if (!await this.ingest(request)) return json({ error: 'Invalid ingest credentials' }, 401);
      if (this.limited('events', 600)) return json({ error: 'Event rate limit reached' }, 429);
      let input; try { input = batchSchema.safeParse(await readBody(request)); } catch { return json({ error: 'Invalid body' }, 400); }
      if (!input.success || input.data.events.some(e => !validEventTime(e.at))) return json({ error: 'Invalid event batch' }, 400);
      for (const event of input.data.events) this.record.office = applyEvent(this.record.office, event);
      await this.ctx.storage.put('state', this.record);
      await this.broadcast();
      return json({ accepted: input.data.events.length, revision: this.record.office.revision });
    }
    const officeId = url.searchParams.get('office') || '';
    if (!request.headers.has(accountHeader) && !await canView(viewerFromCookie(request.headers.get('Cookie') || '', officeId), this.record)) return json({ error: 'Viewer authentication required' }, 401);
    if (request.method === 'GET' && url.pathname === '/api/snapshot') return json(this.record.office);
    if (request.method === 'GET' && url.pathname === '/api/stream' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (this.ctx.getWebSockets('private').length >= 10) return json({ error: 'Too many office viewers' }, 429);
      const [client, server] = Object.values(new WebSocketPair());
      const sessionId = request.headers.get(sessionHeader);
      this.ctx.acceptWebSocket(server, ['private', ...(sessionId ? ['session:' + sessionId] : [])]);
      if (sessionId) server.serializeAttachment({ sessionId });
      server.send(JSON.stringify({ type: 'snapshot', office: this.record.office }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'Not found' }, 404);
  }
  private async sessionActive(ws: WebSocket) {
    const id = ws.deserializeAttachment()?.sessionId;
    if (!id) return true;
    const record = await this.env.AUTH_DB.prepare('SELECT expiresAt FROM session WHERE id = ?').bind(id).first<{expiresAt: string | number}>();
    if (record && new Date(record.expiresAt).getTime() > Date.now()) return true;
    ws.send(JSON.stringify({ type: 'session_ended' })); ws.close(1000, 'Session expired'); return false;
  }
  private async broadcast() {
    if (!this.record) return;
      const message = JSON.stringify({ type: 'snapshot', office: this.record.office });
      for (const ws of this.ctx.getWebSockets()) { try {
        if (this.ctx.getTags(ws).includes('public')) {
          if (this.record.sharing?.enabled) ws.send(JSON.stringify({ type: 'snapshot', ...publicOffice(this.record.office, this.record.sharing) }));
        } else if (this.ctx.getTags(ws).includes('private')) { if (await this.sessionActive(ws)) ws.send(message); }
        else ws.close(1000, 'Reconnect');
      } catch { ws.close(1011, 'Reconnect'); } }
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) { if (message === 'ping' && await this.sessionActive(ws)) ws.send('pong'); }
  webSocketClose(ws: WebSocket) { ws.close(1000, 'Closed'); }
  webSocketError(ws: WebSocket) { ws.close(1011, 'Reconnect'); }
}
