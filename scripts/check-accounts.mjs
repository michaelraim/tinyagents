// Runs the shipped Worker, D1 and Durable Objects in workerd. Only the external
// OAuth providers are replaced; no fake-login route exists in the application.
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base = 'https://office.example';
let identity = 101, email = 'owner@example.com', ip = 1;
const secret = randomBytes(48).toString('hex');
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, scriptPath: '.local/worker-check-bundle/index.js', compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], log: new Log(LogLevel.ERROR),
  bindings: { PUBLIC_SIGNUP: 'true', AUTH_BASE_URL: base, BETTER_AUTH_SECRET: secret, GITHUB_CLIENT_ID: 'test-github', GITHUB_CLIENT_SECRET: 'test-github-secret', GITLAB_CLIENT_ID: 'test-gitlab', GITLAB_CLIENT_SECRET: 'test-gitlab-secret' },
  d1Databases: ['AUTH_DB'], durableObjects: { OFFICES: { className: 'Office', useSQLite: true } },
  ratelimits: { SIGNUP_LIMITER: { namespace_id: '1', simple: { limit: 5, period: 60 } }, AUTH_LIMITER: { namespace_id: '2', simple: { limit: 30, period: 60 } } },
  serviceBindings: { ASSETS: () => new Response('Asset not needed in this test', { status: 404 }) },
  outboundService: async request => {
    const url = request.url;
    if (url === 'https://github.com/login/oauth/access_token' || url === 'https://gitlab.com/oauth/token') return Response.json({ access_token: 'provider-test-token', token_type: 'Bearer', scope: url.includes('github') ? 'read:user,user:email' : 'read_user' });
    if (url === 'https://api.github.com/user') return Response.json({ id: identity, login: 'tiny-owner', name: 'Tiny Owner', email: null });
    if (url === 'https://api.github.com/user/emails') return Response.json([{ email, primary: true, verified: true }]);
    if (url === 'https://gitlab.com/api/v4/user') return Response.json({ id: identity, name: 'Tiny GitLab', username: 'tiny-owner', email, email_verified: true, state: 'active', locked: false });
    throw Error('Unexpected outgoing request: ' + new URL(url).origin);
  },
}));
const cookies = response => response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
async function call(path, { method = 'GET', cookie = '', body, headers = {}, status = 200 } = {}) {
  const response = await mf.dispatchFetch(base + path, { method, redirect: 'manual', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.0.0.${ip++}`, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, `${method} ${path.split('?')[0]}`);
  return response;
}
async function login(provider = 'github', cookie = '', link = false, pairingCode) {
  const started = await call('/api/auth/' + (link ? 'link-social' : 'sign-in/social'), { method: 'POST', cookie, body: { provider, scopes: ['repo'], callbackURL: 'https://attacker.example/', pairingCode } });
  const url = new URL((await started.json()).url);
  assert.equal(url.searchParams.get('redirect_uri'), base + '/api/auth/callback/' + provider);
  assert.ok(!url.searchParams.get('scope').includes('repo'));
  const callback = await call(`/api/auth/callback/${provider}?code=fixture&state=${url.searchParams.get('state')}`, { cookie: cookies(started) + '; ' + cookie, status: 302 });
  assert.equal(callback.headers.get('location'), pairingCode ? '/connect?code=' + pairingCode : '/office?welcome=1');
  return link ? cookie : cookies(callback);
}
try {
  const db = await mf.getD1Database('AUTH_DB');
  for (const file of ['migrations/0001_auth.sql', 'migrations/0002_office_owners.sql', 'migrations/0003_device_pairing.sql']) {
    for (const sql of (await readFile(file, 'utf8')).replace(/--[^\n]*/g, '').split(';').filter(s => s.trim())) await db.prepare(sql).run();
  }
  await call('/api/auth/sign-in/social', { method: 'POST', body: { provider: 'google' }, status: 400 });
  await call('/api/auth/sign-in/social', { method: 'POST', body: { provider: 'github' }, headers: { Origin: 'https://attacker.example' }, status: 403 });
  await call('/api/account/office', { method: 'POST', body: { timeZone: 'UTC' }, status: 401 });
  await call('/api/offices', { method: 'POST', body: {}, status: 403 });
  const device = await (await call('/api/pairing/start', { method: 'POST', body: { name: 'Test desktop', provider: 'codex', timeZone: 'Asia/Jerusalem' }, status: 201 })).json();
  assert.equal(device.verificationUrl, base + '/connect?code=' + device.code);
  assert.equal((await (await call('/api/pairing/poll', { method: 'POST', body: { deviceSecret: device.deviceSecret } })).json()).status, 'pending');
  await call('/api/pairing/poll', { method: 'POST', body: { deviceSecret: 'a'.repeat(64) }, status: 410 });
  await call('/api/pairing/approve', { method: 'POST', body: { code: device.code }, status: 401 });
  const owner = await login('github', '', false, device.code);
  await call('/api/pairing/approve', { method: 'POST', cookie: owner, body: { code: device.code }, headers: { Origin: '' }, status: 403 });
  await Promise.all([1, 2].map(() => call('/api/pairing/approve', { method: 'POST', cookie: owner, body: { code: device.code } })));
  const deviceResult = await (await call('/api/pairing/poll', { method: 'POST', body: { deviceSecret: device.deviceSecret } })).json();
  assert.equal(deviceResult.status, 'approved');
  const deviceConfig = deviceResult.config;
  assert.equal((await (await call('/api/pairing/poll', { method: 'POST', body: { deviceSecret: device.deviceSecret } })).json()).config.ingestKey, deviceConfig.ingestKey, 'poll retries deliver the same credential');
  await call(`/api/connection?office=${deviceConfig.officeId}`, { method: 'POST', headers: { Authorization: 'Bearer ' + deviceConfig.ingestKey } });
  const deviceView = await (await call('/api/pairing?code=' + device.code, { cookie: owner })).json();
  assert.equal(deviceView.status, 'approved'); assert.equal(deviceView.deviceSecret, undefined); assert.equal(deviceView.config, undefined);
  await call('/api/pairing/finish', { method: 'POST', body: { deviceSecret: device.deviceSecret } });
  assert.equal((await (await call('/api/pairing?code=' + device.code, { cookie: owner })).json()).status, 'connected');
  const creates = await Promise.all([1, 2].map(() => call('/api/account/office', { method: 'POST', cookie: owner, body: { timeZone: 'Asia/Jerusalem' } }).then(r => r.json())));
  const id = creates[0].officeId; assert.equal(creates[1].officeId, id);
  assert.equal(id, deviceConfig.officeId, 'device approval creates the office automatically');
  const deviceConnections = await (await call(`/api/connections?office=${id}`, { cookie: owner })).json();
  assert.equal(deviceConnections.length, 1, 'simultaneous approvals issue only one connection');
  await call(`/api/connections?office=${id}&id=${deviceConnections[0].id}`, { method: 'DELETE', cookie: owner });
  await call('/api/pairing/poll', { method: 'POST', body: { deviceSecret: device.deviceSecret }, status: 410 });
  await call('/api/pairing/approve', { method: 'POST', cookie: owner, body: { code: device.code } });
  await call('/api/pairing/poll', { method: 'POST', body: { deviceSecret: device.deviceSecret }, status: 410 });
  assert.equal((await (await call(`/api/connections?office=${id}`, { cookie: owner })).json()).length, 0, 'approval replay never restores a revoked key');
  assert.equal((await (await call('/api/account', { cookie: owner })).json()).officeId, id);
  const secondBrowser = await login();
  assert.equal((await (await call('/api/account', { cookie: secondBrowser })).json()).officeId, id);
  assert.equal((await (await call(`/api/snapshot?office=${id}`, { cookie: owner })).json()).timeZone, 'Asia/Jerusalem');
  await call(`/api/snapshot?office=${id}`, { headers: { 'X-Tinyagents-Account': 'forged-owner', 'X-Tinyagents-Session': 'fake' }, status: 401 });
  await call(`/api/clock?office=${id}`, { method: 'POST', cookie: owner, body: { timeZone: 'UTC' }, headers: { Origin: '' }, status: 403 });
  await call(`/api/clock?office=${id}`, { method: 'POST', cookie: owner, body: { timeZone: 'Europe/London' } });
  const [pair, pair2] = await Promise.all(['Laptop', 'Desktop'].map(name => call(`/api/connections?office=${id}`, { method: 'POST', cookie: owner, body: { name }, status: 201 }).then(r => r.json())));
  for (const key of [pair.ingestKey, pair2.ingestKey]) await call(`/api/connection?office=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + key } });
  const probe = key => call(`/api/connection?office=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + key } }).then(r => r.json());
  assert.equal((await probe(pair.ingestKey)).reporting, null, 'a successful credential probe is not agent activity');
  await call(`/api/events?office=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + pair.ingestKey }, body: { events: [{ version: 1, id: 'receipt-test', at: Date.now(), provider: 'codex', sessionId: 'receipt-session', agentId: 'main', name: 'Observer', project: { id: 'receipt-project', name: 'Receipt test' }, state: 'thinking', activity: 'Planning' }] } });
  const receipt = await probe(pair.ingestKey);
  assert.ok(receipt.reporting.lastReceivedAt > 0); assert.ok(receipt.reporting.providers.codex > 0);
  assert.equal((await probe(pair2.ingestKey)).reporting, null, 'another computer must not borrow this receipt');
  const reported = await (await call(`/api/connections?office=${id}`, { cookie: owner })).json();
  assert.ok(reported.find(c => c.id === pair.id).reporting.lastReceivedAt > 0);
  assert.equal(reported.find(c => c.id === pair.id).hash, undefined);
  await call(`/api/share?office=${id}`, { headers: { Authorization: 'Bearer ' + pair.ingestKey }, status: 401 });
  await call(`/api/connections?office=${id}&id=${pair.id}`, { method: 'DELETE', cookie: owner });
  await call(`/api/connection?office=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + pair.ingestKey }, status: 401 });
  await call(`/api/connection?office=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + pair2.ingestKey } });
  const wsResponse = await call(`/api/stream?office=${id}`, { cookie: owner, headers: { Upgrade: 'websocket' }, status: 101 });
  const ws = wsResponse.webSocket; ws.accept();
  const pong = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Session socket did not answer ping')), 3000); ws.addEventListener('message', e => { if (e.data === 'pong') { clearTimeout(timer); resolve(); } }); });
  ws.send('ping'); await pong;
  await login('gitlab', owner, true);
  const linkedCookie = await login('gitlab');
  assert.equal((await (await call('/api/account', { cookie: linkedCookie })).json()).officeId, id);
  identity = 202; email = 'other@example.com';
  const other = await login('gitlab');
  await call('/api/pairing/approve', { method: 'POST', cookie: other, body: { code: device.code }, status: 409 });
  await call('/api/pairing?code=' + device.code, { cookie: other, status: 409 });
  await db.prepare('UPDATE device_pairing SET expiresAt = 0 WHERE code = ?').bind(device.code).run();
  await call('/api/pairing/approve', { method: 'POST', cookie: owner, body: { code: device.code }, status: 410 });
  await call('/api/pairing/poll', { method: 'POST', body: { deviceSecret: device.deviceSecret }, status: 410 });
  await call(`/api/snapshot?office=${id}`, { cookie: other, status: 403 });
  await call(`/api/clock?office=${id}`, { method: 'POST', cookie: other, body: { timeZone: 'UTC' }, status: 403 });
  await call(`/api/connections?office=${id}`, { method: 'POST', cookie: other, body: { name: 'Attacker' }, status: 403 });
  await call(`/api/office?office=${id}`, { method: 'DELETE', cookie: other, status: 403 });
  // Remove only the mapping to model an existing office from before SSO.
  // Keep its actual state and owner/viewer/ingest credentials intact.
  const keys = await (await call(`/api/keys?office=${id}`, { method: 'POST', cookie: owner })).json();
  await db.prepare('DELETE FROM office_owner WHERE officeId = ?').bind(id).run();
  await call('/api/account/office', { method: 'POST', cookie: owner, body: { officeId: id, ownerKey: keys.viewerKey }, status: 403 });
  await call('/api/account/office', { method: 'POST', cookie: owner, body: { officeId: id, ownerKey: keys.ownerKey } });
  await call('/api/account/office', { method: 'POST', cookie: other, body: { officeId: id, ownerKey: keys.ownerKey }, status: 409 });
  await call(`/api/connection?office=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + keys.ingestKey } });
  await call(`/api/snapshot?office=${id}`, { cookie: owner });
  const logoutSocketResponse = await call(`/api/stream?office=${id}`, { cookie: owner, headers: { Upgrade: 'websocket' }, status: 101 });
  const logoutSocket = logoutSocketResponse.webSocket; logoutSocket.accept();
  const closed = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Logout did not invalidate private socket')), 3000); logoutSocket.addEventListener('message', e => { if (e.data.includes('session_ended')) { clearTimeout(timer); logoutSocket.close(); resolve(); } }); });
  logoutSocket.send('ping');
  await call('/api/auth/sign-out', { method: 'POST', cookie: owner }); await closed;
  await call(`/api/snapshot?office=${id}`, { cookie: owner, status: 401 });
  await call(`/api/snapshot?office=${id}`, { cookie: secondBrowser });
  await call('/api/account', { method: 'DELETE', cookie: secondBrowser });
  assert.equal((await (await call('/api/account', { cookie: secondBrowser })).json()).user, null);
  await call(`/api/connection?office=${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + keys.ingestKey }, status: 404 });
  assert.equal((await db.prepare('SELECT count(*) AS n FROM office_owner').first()).n, 0);
  console.log('Account acceptance passed: browser device pairing, OAuth return, automatic office creation, concurrent approval, expiry, secret separation, revoked-key replay, both OAuth flows, account linking, ownership isolation, legacy claim, WebSocket logout and deletion.');
} finally { await mf.dispose(); }
