import { DurableObject } from 'cloudflare:workers';
import { applyEvent, emptyOffice, type OfficeState } from '../shared/protocol';
import { batchSchema, digest, matches, token, viewerCookie, viewerFromCookie, validEventTime, officeIdPattern } from '../shared/security';
interface Env { OFFICES: DurableObjectNamespace<Office>; ASSETS: Fetcher; REGISTRATION_KEY: string }
type RecordData = { office: OfficeState; ingestHash: string; viewerHash: string };
const json = (data: unknown, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
async function readBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body');
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new Error('Body too large'); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(all));
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, storage: 'cloudflare', registration: !!env.REGISTRATION_KEY });
      if (request.method === 'POST' && url.pathname === '/api/offices') {
        const { invite } = await readBody(request);
        if (!env.REGISTRATION_KEY) return json({ error: 'Hosted registration is not configured yet.' }, 503);
        if (!await matches(String(invite ?? ''), await digest(env.REGISTRATION_KEY))) return json({ error: 'An invite code is needed for this office.' }, 403);
        const officeId = crypto.randomUUID(), ingestKey = token(), viewerKey = token();
        const stub = env.OFFICES.get(env.OFFICES.idFromName(officeId));
        await stub.initialize(await digest(ingestKey), await digest(viewerKey));
        return json({ officeId, ingestKey, viewerKey }, 201, { 'Set-Cookie': viewerCookie(officeId, viewerKey, true) });
      }
      if (request.method === 'POST' && url.pathname === '/api/session') {
        const { officeId, viewerKey } = await readBody(request);
        if (!officeIdPattern.test(String(officeId))) return json({ error: 'Invalid office credentials' }, 401);
        const stub = env.OFFICES.get(env.OFFICES.idFromName(officeId));
        if (!await stub.login(String(viewerKey ?? ''))) return json({ error: 'Invalid office credentials or too many attempts' }, 401);
        return json({ ok: true }, 200, { 'Set-Cookie': viewerCookie(officeId, viewerKey, true) });
      }
      const officeId = request.headers.get('X-Office-Id') || url.searchParams.get('office') || '';
      if (!officeIdPattern.test(officeId)) return json({ error: 'Invalid office ID' }, 400);
      return env.OFFICES.get(env.OFFICES.idFromName(officeId)).fetch(request);
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
  async initialize(ingestHash: string, viewerHash: string) {
    if (this.record) throw new Error('Office already exists');
    this.record = { office: emptyOffice(), ingestHash, viewerHash };
    await this.ctx.storage.put('state', this.record);
  }
  private limited(kind: 'events' | 'logins', max: number) {
    if (Date.now() - this.rate.at > 60_000) this.rate = { at: Date.now(), events: 0, logins: 0 };
    return ++this.rate[kind] > max;
  }
  async login(key: string) { return !this.limited('logins', 30) && !!this.record && await matches(key, this.record.viewerHash); }
  async fetch(request: Request): Promise<Response> {
    if (!this.record) return json({ error: 'Office not found' }, 404);
    const url = new URL(request.url);
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
      const message = JSON.stringify({ type: 'snapshot', office: this.record.office });
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(message); } catch { ws.close(1011, 'Reconnect'); } }
      return json({ accepted: input.data.events.length, revision: this.record.office.revision });
    }
    const officeId = url.searchParams.get('office') || '';
    if (!await matches(viewerFromCookie(request.headers.get('Cookie') || '', officeId), this.record.viewerHash)) return json({ error: 'Viewer authentication required' }, 401);
    if (request.method === 'GET' && url.pathname === '/api/snapshot') return json(this.record.office);
    if (request.method === 'GET' && url.pathname === '/api/stream' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (this.ctx.getWebSockets().length >= 10) return json({ error: 'Too many office viewers' }, 429);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: 'snapshot', office: this.record.office }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'Not found' }, 404);
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) { if (message === 'ping') ws.send('pong'); }
  webSocketClose(ws: WebSocket) { ws.close(1000, 'Closed'); }
  webSocketError(ws: WebSocket) { ws.close(1011, 'Reconnect'); }
}
