import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { emptyOffice, applyEvent } from '../shared/protocol.ts';
import { batchSchema, digest, matches, canView, token, viewerCookie, viewerFromCookie, validEventTime, officeIdPattern } from '../shared/security.ts';

const port = Number(process.env.PORT || 8787);
const dataDir = process.env.SIDEQUEST_DATA_DIR || '.local';
await mkdir(dataDir, { recursive: true });
const dbPath = `${dataDir}/offices.json`;
let offices = {};
try { offices = JSON.parse(await readFile(dbPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let persist = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(offices);
  persist = persist.catch(() => {}).then(async () => { await writeFile(`${dbPath}.tmp`, snapshot, { mode: 0o600 }); await rename(`${dbPath}.tmp`, dbPath); });
  return persist;
}
const origins = new Set(['http://127.0.0.1:5187', 'http://localhost:5187', `http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:4173']);
function allowed(req) { return !req.headers.origin || origins.has(req.headers.origin); }
function json(res, status, payload, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(payload)); }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('Body too large'); chunks.push(chunk); }
  const parsed = JSON.parse(Buffer.concat(chunks).toString());
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('Invalid body');
  return parsed;
}
function officeFrom(req, url) {
  const id = String(req.headers['x-office-id'] || url.searchParams.get('office') || '');
  return officeIdPattern.test(id) ? { id, record: offices[id] } : { id: '', record: null };
}
const limits = new Map();
function limited(key, max = 120) {
  const now = Date.now(), current = limits.get(key);
  const entry = current && current.until > now ? current : { count: 0, until: now + 60_000 };
  limits.set(key, entry); return ++entry.count > max;
}
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
function broadcast(id, office) { for (const socket of sockets.clients) if (socket.officeId === id && socket.readyState === 1) socket.send(JSON.stringify({ type: 'snapshot', office })); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (!allowed(req)) return json(res, 403, { error: 'Origin not allowed' });
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, storage: 'local', registration: true, publicSignup: true });
    if (req.method === 'POST' && url.pathname === '/api/connection') {
      const { record } = officeFrom(req, url);
      if (!record || !await matches(String(req.headers.authorization ?? '').replace(/^Bearer /, ''), record.ingestHash)) return json(res, 401, { error: 'Invalid ingest credentials' });
      return json(res, 200, { ok: true, storage: 'local' });
    }
    if (req.method === 'POST' && url.pathname === '/api/offices') {
      if (limited('create', 10)) return json(res, 429, { error: 'Please wait before creating another office.' });
      await body(req);
      const officeId = crypto.randomUUID(), ingestKey = token(), viewerKey = token(), ownerKey = token();
      offices[officeId] = { ingestHash: await digest(ingestKey), viewerHash: await digest(viewerKey), ownerHash: await digest(ownerKey), office: emptyOffice() };
      await save();
      return json(res, 201, { officeId, ingestKey, viewerKey, ownerKey }, { 'Set-Cookie': viewerCookie(officeId, viewerKey, false) });
    }
    if (req.method === 'POST' && url.pathname === '/api/session') {
      if (limited('login', 30)) return json(res, 429, { error: 'Too many attempts. Try again in a minute.' });
      const input = await body(req), officeId = String(input.officeId ?? '');
      const record = officeIdPattern.test(officeId) ? offices[officeId] : null;
      if (!record || !await canView(String(input.viewerKey ?? ''), record)) return json(res, 401, { error: 'Office ID or viewer key is incorrect.' });
      return json(res, 200, { ok: true }, { 'Set-Cookie': viewerCookie(officeId, input.viewerKey, false) });
    }
    if ((req.method === 'POST' && url.pathname === '/api/keys') || (req.method === 'DELETE' && url.pathname === '/api/office')) {
      const id = url.searchParams.get('office') || '', record = officeIdPattern.test(id) ? offices[id] : null;
      if (limited('manage', 30) || !record || !await matches(String(req.headers.authorization ?? '').replace(/^Bearer /, ''), record.ownerHash ?? '')) return json(res, 401, { error: 'The recovery key is required.' });
      if (req.method === 'DELETE') {
        delete offices[id]; await save();
        for (const ws of sockets.clients) if (ws.officeId === id) ws.close(1000, 'Office deleted');
        return json(res, 200, { ok: true }, { 'Set-Cookie': 'sidequest=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0' });
      }
      const ingestKey = token(), viewerKey = token(), ownerKey = token();
      record.ingestHash = await digest(ingestKey); record.viewerHash = await digest(viewerKey); record.ownerHash = await digest(ownerKey);
      await save();
      for (const ws of sockets.clients) if (ws.officeId === id) ws.close(1000, 'Keys replaced');
      return json(res, 200, { officeId: id, ingestKey, viewerKey, ownerKey }, { 'Set-Cookie': viewerCookie(id, viewerKey, false) });
    }
    if (req.method === 'POST' && url.pathname === '/api/events') {
      const { id, record } = officeFrom(req, url);
      if (!record || !await matches(String(req.headers.authorization ?? '').replace(/^Bearer /, ''), record.ingestHash)) return json(res, 401, { error: 'Invalid ingest credentials' });
      if (limited(id, 600)) return json(res, 429, { error: 'Event rate limit reached' });
      const input = batchSchema.safeParse(await body(req));
      if (!input.success || input.data.events.some(e => !validEventTime(e.at))) return json(res, 400, { error: 'Invalid event batch' });
      for (const event of input.data.events) record.office = applyEvent(record.office, event);
      await save(); broadcast(id, record.office);
      return json(res, 200, { accepted: input.data.events.length, revision: record.office.revision });
    }
    if (req.method === 'GET' && url.pathname === '/api/snapshot') {
      const { id, record } = officeFrom(req, url);
      if (!record || !await canView(viewerFromCookie(req.headers.cookie ?? '', id), record)) return json(res, 401, { error: 'Viewer authentication required' });
      return json(res, 200, record.office);
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof SyntaxError || error.message === 'Body too large') return json(res, 400, { error: 'Invalid or oversized JSON body' });
    console.error('Bridge request failed:', error.message); return json(res, 500, { error: 'Office storage unavailable' });
  }
});
server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`), { id, record } = officeFrom(req, url);
  if (!allowed(req) || url.pathname !== '/api/stream' || !record || !await canView(viewerFromCookie(req.headers.cookie ?? '', id), record)) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
  sockets.handleUpgrade(req, socket, head, ws => { ws.officeId = id; ws.send(JSON.stringify({ type: 'snapshot', office: record.office })); ws.on('message', message => { if (String(message) === 'ping') ws.send('pong'); }); ws.on('error', () => {}); });
});
server.listen(port, '127.0.0.1', () => console.log(`Sidequest bridge ready at http://127.0.0.1:${port} (loopback only)`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { for (const ws of sockets.clients) ws.close(); server.close(() => process.exit(0)); });
