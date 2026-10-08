import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import WebSocket from 'ws';
import { normalizeHook } from '../bridge/normalize.mjs';

const base = process.env.TEST_WORKER_URL || 'http://127.0.0.1:8788';
const invite = process.env.TEST_WORKER_INVITE || 'local-test-invite';
const request = (route, options = {}) => fetch(base + route, { ...options, signal: AbortSignal.timeout(10000) });
const post = (route, body, headers = {}) => request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local/cloud-observer-'));
let ws;
function run(file, args, input, env) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [file, ...args], { env: { ...process.env, SIDEQUEST_HOME: directory, SIDEQUEST_CONFIG: resolve(directory, 'config.json'), ...env }, stdio: 'pipe', windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Observer process timed out')); }, 15000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); code === 0 ? accept(stdout) : reject(new Error(stderr || 'Observer failed')); });
    child.stdin.end(input);
  });
}
try {
  const health = await (await request('/api/health')).json();
  assert.equal(health.storage, 'cloudflare'); assert.equal(health.registration, true);
  assert.equal((await post('/api/offices', { invite: 'wrong' })).status, 403);
  assert.equal((await post('/api/offices', { invite }, { Origin: 'https://foreign.example' })).status, 403);
  const created = await post('/api/offices', { invite }); assert.equal(created.status, 201);
  const { officeId, ingestKey, viewerKey } = await created.json();
  const cookie = created.headers.get('set-cookie').split(';')[0];
  const headers = { Authorization: `Bearer ${ingestKey}`, 'X-Office-Id': officeId };
  assert.equal((await post('/api/connection', {}, { ...headers, Authorization: `Bearer ${viewerKey}` })).status, 401);
  assert.equal((await post('/api/connection', {}, headers)).status, 200);
  assert.equal((await post('/api/session', { officeId, viewerKey: ingestKey })).status, 401);
  assert.equal((await post('/api/session', { officeId, viewerKey })).status, 200);
  const second = await post('/api/offices', { invite });
  const secondId = (await second.json()).officeId;
  assert.equal((await request(`/api/snapshot?office=${secondId}`, { headers: { Cookie: cookie } })).status, 401);
  ws = new WebSocket(`${base.replace('http', 'ws')}/api/stream?office=${officeId}`, { headers: { Cookie: cookie }, handshakeTimeout: 5000 });
  const message = () => once(ws, 'message', { signal: AbortSignal.timeout(10000) });
  const initial = message(); await once(ws, 'open', { signal: AbortSignal.timeout(10000) });
  assert.equal(JSON.parse(String((await initial)[0])).office.agents.length, 0);
  const pong = message(); ws.send('ping'); assert.equal(String((await pong)[0]), 'pong');

  const config = { endpoint: `${base}/api/events`, officeId, ingestKey, projectName: 'Cloudflare acceptance' };
  const file = resolve(directory, 'config.json');
  await writeFile(file, JSON.stringify(config), { mode: 0o600 });
  await run('bridge/setup.mjs', [file], '');
  assert.match(await run('bridge/office.mjs', ['doctor'], ''), /credentials accepted/);
  for (const provider of ['codex', 'claude']) {
    const update = message();
    const raw = { session_id: `acceptance-${provider}`, cwd: '/fixture/private-repo', hook_event_name: 'PreToolUse', tool_name: provider === 'codex' ? 'exec_command' : 'Bash', tool_input: { command: 'npm test -- NEVER_UPLOAD_THIS' }, tool_use_id: 'one', prompt: 'PRIVATE_PROMPT' };
    assert.equal(await run(`plugins/${provider}/scripts/emit.mjs`, [provider], JSON.stringify(raw)), '{}');
    const state = JSON.parse(String((await update)[0])).office;
    assert.equal(state.agents.find(agent => agent.provider === provider).state, 'testing');
    assert.ok(!JSON.stringify(state).includes('NEVER_UPLOAD_THIS'));
    assert.ok(!JSON.stringify(state).includes('PRIVATE_PROMPT'));
  }
  const child = normalizeHook({ session_id: 'acceptance-codex', cwd: '/fixture/private-repo', hook_event_name: 'SubagentStart', agent_id: 'helper' }, 'codex');
  let update = message(); assert.equal((await post('/api/events', { events: [child] }, headers)).status, 200);
  let snapshot = JSON.parse(String((await update)[0])).office;
  assert.equal(snapshot.agents.length, 3);
  const parent = snapshot.agents.find(agent => agent.provider === 'codex' && !agent.parentAgentId);
  assert.equal(snapshot.agents.find(agent => agent.parentAgentId).parentAgentId, parent.agentId);
  update = message();
  assert.equal((await (await post('/api/events', { events: [child] }, headers)).json()).revision, 3);
  await update;
  assert.equal((await post('/api/events', { events: [{ ...child, id: 'invalid', prompt: 'secret' }] }, headers)).status, 400);
  assert.equal((await post('/api/events', { events: [{ ...child, id: 'future', at: Date.now() + 120000 }] }, headers)).status, 400);
  assert.equal((await request(`/api/snapshot?office=${officeId}`)).status, 401);

  // An unavailable endpoint must queue metadata and return empty JSON without failing the host.
  await writeFile(file, JSON.stringify({ ...config, endpoint: 'http://127.0.0.1:1/api/events' }));
  assert.equal(await run('plugins/claude/scripts/emit.mjs', ['claude'], JSON.stringify({ session_id: 'acceptance-claude', cwd: '/fixture/private-repo', hook_event_name: 'Stop' })), '{}');
  assert.equal((await readdir(resolve(directory, 'outbox', officeId))).filter(file => file.endsWith('.json')).length, 1);
  await writeFile(file, JSON.stringify(config));
  update = message(); assert.match(await run('bridge/office.mjs', ['flush'], ''), /Delivered 1 events/); await update;
  snapshot = await (await request(`/api/snapshot?office=${officeId}`, { headers: { Cookie: cookie } })).json();
  assert.equal(snapshot.agents.find(agent => agent.provider === 'claude').state, 'done');
  assert.equal(snapshot.revision, 4);
  console.log('Worker acceptance passed: both packaged observers, pairing, auth isolation, hierarchy, privacy, deduplication, WebSockets, heartbeat, offline queue and retry.');
} finally {
  ws?.terminate();
  if (resolve(directory).startsWith(resolve('.local') + sep + 'cloud-observer-')) await rm(directory, { recursive: true, force: true });
}
