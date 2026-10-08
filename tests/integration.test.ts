import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { once } from 'node:events';
import WebSocket from 'ws';
import { normalizeHook } from '../bridge/normalize.mjs';
const base = 'http://127.0.0.1:8793';
let server: ChildProcess, directory: string;
let first: { officeId: string; ingestKey: string; viewerKey: string }, second: typeof first;
let cookie = '';
async function create() {
  const r = await fetch(`${base}/api/offices`, { method: 'POST', body: '{}' });
  expect(r.status).toBe(201); return { keys: await r.json(), cookie: r.headers.get('set-cookie')!.split(';')[0] };
}
async function post(events: unknown[], key = first.ingestKey) {
  return fetch(`${base}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Office-Id': first.officeId }, body: JSON.stringify({ events }) });
}
beforeAll(async () => {
  await mkdir('.local', { recursive: true }); directory = await mkdtemp(resolve('.local/integration-'));
  server = spawn(process.execPath, ['server/local.mjs'], { env: { ...process.env, PORT: '8793', SIDEQUEST_DATA_DIR: directory }, stdio: 'pipe', windowsHide: true });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* Wait for process readiness. */ }
    if (i === 79) throw new Error('Bridge did not start'); await new Promise(r => setTimeout(r, 100));
  }
  const a = await create(), b = await create(); first = a.keys; second = b.keys; cookie = a.cookie;
}, 15000);
afterAll(async () => {
  if (server && server.exitCode === null) { const closed = once(server, 'exit'); server.kill(); await closed; }
  if (directory && resolve(directory).startsWith(`${resolve('.local')}${sep}integration-`)) await rm(directory, { recursive: true, force: true });
});

describe('live office boundary', () => {
  it('rejects unauthenticated writes, viewer keys used to write, and foreign origins', async () => {
    expect((await post([], 'invalid')).status).toBe(401);
    expect((await post([], first.viewerKey)).status).toBe(401);
    expect((await fetch(`${base}/api/offices`, { method: 'POST', body: '{}', headers: { Origin: 'https://untrusted.example' } })).status).toBe(403);
  });
  it('isolates offices and does not let an ingest key become a viewer', async () => {
    expect((await fetch(`${base}/api/snapshot?office=${second.officeId}`, { headers: { Cookie: cookie } })).status).toBe(401);
    expect((await fetch(`${base}/api/session`, { method: 'POST', body: JSON.stringify({ officeId: first.officeId, viewerKey: first.ingestKey }) })).status).toBe(401);
  });
  it('delivers real normalized hook events over a socket and replays a persisted snapshot', async () => {
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/api/stream?office=${first.officeId}`, { headers: { Cookie: cookie } });
    const initial = once(ws, 'message'); await once(ws, 'open'); expect(JSON.parse(String((await initial)[0])).office.agents).toHaveLength(0);
    const stamp = Date.now();
    const root = normalizeHook({ session_id: 'integration-session', cwd: '/fixtures/product', hook_event_name: 'UserPromptSubmit' }, 'codex', { projectName: 'Integration room' }, stamp)!;
    const child = normalizeHook({ session_id: 'integration-session', cwd: '/fixtures/product', hook_event_name: 'SubagentStart', agent_id: 'child' }, 'codex', {}, stamp + 1)!;
    const waiting = normalizeHook({ session_id: 'integration-session', cwd: '/fixtures/product', hook_event_name: 'PermissionRequest', agent_id: 'child' }, 'codex', {}, stamp + 2)!;
    const update = once(ws, 'message'); expect((await post([root, child, waiting])).status).toBe(200);
    const snapshot = JSON.parse(String((await update)[0])).office;
    expect(snapshot.agents).toHaveLength(2); expect(snapshot.agents[1].state).toBe('waiting'); expect(snapshot.agents[1].parentAgentId).toBe(snapshot.agents[0].agentId);
    expect((await (await post([waiting])).json()).revision).toBe(3);
    const r = await fetch(`${base}/api/snapshot?office=${first.officeId}`, { headers: { Cookie: cookie } });
    expect((await r.json()).revision).toBe(3); ws.close();
  });
  it('rejects raw payloads and future events atomically', async () => {
    const e = normalizeHook({ session_id: 's', cwd: '/test', hook_event_name: 'Stop' }, 'claude')!;
    expect((await post([{ ...e, prompt: 'Never store this' }])).status).toBe(400);
    expect((await post([{ ...e, at: Date.now() + 120000 }])).status).toBe(400);
    const r = await fetch(`${base}/api/snapshot?office=${first.officeId}`, { headers: { Cookie: cookie } });
    expect((await r.json()).revision).toBe(3);
  });
  it('lets an owner replace keys and delete an office without granting those powers to viewers', async () => {
    const { keys, cookie: oldCookie } = await create();
    const manage = (route: string, key: string, method = 'POST') => fetch(`${base}/api/${route}?office=${keys.officeId}`, { method, headers: { Authorization: `Bearer ${key}` } });
    expect((await manage('keys', keys.viewerKey)).status).toBe(401);
    expect((await manage('office', keys.ingestKey, 'DELETE')).status).toBe(401);
    const rotated = await manage('keys', keys.ownerKey); expect(rotated.status).toBe(200);
    const next = await rotated.json();
    expect((await fetch(`${base}/api/connection`, { method: 'POST', headers: { 'X-Office-Id': keys.officeId, Authorization: `Bearer ${keys.ingestKey}` } })).status).toBe(401);
    expect((await fetch(`${base}/api/snapshot?office=${keys.officeId}`, { headers: { Cookie: oldCookie } })).status).toBe(401);
    expect((await manage('keys', keys.ownerKey)).status).toBe(401);
    const recovered = await fetch(`${base}/api/session`, { method: 'POST', body: JSON.stringify({ officeId: keys.officeId, viewerKey: next.ownerKey }) });
    expect(recovered.status).toBe(200);
    expect((await manage('office', next.ownerKey, 'DELETE')).status).toBe(200);
    expect((await fetch(`${base}/api/snapshot?office=${keys.officeId}`, { headers: { Cookie: recovered.headers.get('set-cookie')!.split(';')[0] } })).status).toBe(401);
  });
  it('rejects a malformed registration body', async () => {
    expect((await fetch(`${base}/api/offices`, { method: 'POST', body: 'null' })).status).toBe(400);
  });
});
