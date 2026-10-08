import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | undefined>, timeout = 13000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await fn().catch(() => undefined); if (result) return result; await delay(100); }
  throw Error('Timed out waiting for connection');
}
describe('automatic plugin connection', () => {
  it('coordinates both harnesses, saves privately only after approval and immediately reports later activity', async () => {
    await mkdir('.local', { recursive: true });
    const directory = await mkdtemp(resolve('.local/pairing-test-'));
    const configFile = resolve(directory, 'config.json'), stateFile = resolve(directory, 'pairing.json');
    const deviceSecret = randomBytes(32).toString('hex'), ingestKey = randomBytes(32).toString('hex'), officeId = randomUUID();
    let activeKey = ingestKey;
    let starts = 0, finishes = 0, approved = false, origin = '', workerPid: number | undefined;
    const events: {provider: string}[] = [];
    const server = createServer(async (request, response) => {
      let input = ''; for await (const chunk of request) input += chunk;
      const body = input ? JSON.parse(input) : {};
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/pairing/start') {
        starts++; expect(['codex', 'claude', 'both']).toContain(body.provider); expect(body.timeZone).toBeTruthy(); expect(body.cwd).toBeUndefined();
        response.writeHead(201).end(JSON.stringify({ deviceSecret, code: 'ABCDEF123456', expiresAt: Date.now() + 60_000 }));
      } else if (request.url === '/api/pairing/poll') {
        expect(body.deviceSecret).toBe(deviceSecret);
        response.end(JSON.stringify(approved ? { status: 'approved', config: { endpoint: origin + '/api/events', officeId, ingestKey: activeKey } } : { status: 'pending' }));
      } else if (request.url === '/api/pairing/finish') {
        expect(body.deviceSecret).toBe(deviceSecret); expect(JSON.parse(await readFile(configFile, 'utf8')).ingestKey).toBe(activeKey); finishes++; response.end('{}');
      } else if (request.url === '/api/connection' || request.url === '/api/events') {
        if (request.headers.authorization !== 'Bearer ' + activeKey) { response.writeHead(401).end('{}'); return; }
        if (body.events) events.push(...body.events);
        response.end(JSON.stringify({ ok: true, storage: 'test' }));
      } else response.writeHead(404).end('{}');
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const address = server.address(); if (!address || typeof address === 'string') throw Error();
    origin = 'http://127.0.0.1:' + address.port;
    const env = { ...process.env, SIDEQUEST_HOME: directory, SIDEQUEST_CONFIG: configFile, TINYAGENTS_URL: origin, TINYAGENTS_NO_BROWSER: '1' };
    function hook(provider: string, event = 'SessionStart') {
      return new Promise<string>((accept, reject) => {
        const child = spawn(process.execPath, ['bridge/emit.mjs', provider], { env, stdio: 'pipe', windowsHide: true });
        let output = '';
        const timeout = setTimeout(() => { child.kill(); reject(Error('Hook blocked on browser approval')); }, 2800);
        child.stdout.on('data', value => { output += value; }); child.on('error', reject);
        child.on('exit', code => { clearTimeout(timeout); code === 0 ? accept(output) : reject(Error('Hook failed')); });
        child.stdin.end(JSON.stringify({ hook_event_name: event, cwd: directory, session_id: 'pairing-test-session' }));
      });
    }
    try {
      expect(await Promise.all([hook('codex'), hook('claude')])).toEqual(['{}', '{}']);
      const pending = await until(async () => { const value = JSON.parse(await readFile(stateFile, 'utf8')); return value.status === 'pending' ? value : undefined; });
      workerPid = pending.pid;
      expect(pending.verificationUrl).toBe(origin + '/connect?code=ABCDEF123456');
      expect(starts).toBe(1);
      await expect(readFile(configFile)).rejects.toThrow();
      await Promise.all([hook('codex', 'UserPromptSubmit'), hook('claude', 'UserPromptSubmit')]);
      expect(starts).toBe(1);
      approved = true;
      await until(async () => finishes ? true : undefined);
      const config = JSON.parse(await readFile(configFile, 'utf8'));
      expect(config).toEqual({ endpoint: origin + '/api/events', officeId, ingestKey });
      await hook('codex'); await hook('claude');
      expect(events.map(e => e.provider).sort()).toEqual(['claude', 'codex']);
      expect(starts).toBe(1);
      await until(async () => JSON.parse(await readFile(stateFile, 'utf8')).status === 'connected' || undefined);
      expect(await readFile(stateFile, 'utf8')).not.toContain(deviceSecret);
      // Explicit reconnect repairs a revoked key, retaining room customizations.
      await writeFile(configFile, JSON.stringify({ ...config, projectName: 'Keep my room' }));
      activeKey = randomBytes(32).toString('hex'); approved = false;
      const output = await new Promise<string>((accept, reject) => {
        const child = spawn(process.execPath, ['bridge/office.mjs', 'connect'], { env, stdio: 'pipe', windowsHide: true });
        let result = ''; child.stdout.on('data', value => { result += value; }); child.on('error', reject); child.on('exit', code => code === 0 ? accept(result) : reject(Error('Reconnect failed')));
      });
      expect(output).toContain('/connect?code=ABCDEF123456'); expect(output).not.toContain(deviceSecret);
      workerPid = JSON.parse(await readFile(stateFile, 'utf8')).pid;
      expect(starts).toBe(2); approved = true;
      await until(async () => finishes === 2 || undefined);
      expect(JSON.parse(await readFile(configFile, 'utf8'))).toMatchObject({ ingestKey: activeKey, projectName: 'Keep my room', officeId });
      await until(async () => JSON.parse(await readFile(stateFile, 'utf8')).status === 'connected' || undefined);
      // Malformed saved configurations are preserved, never silently replaced.
      await writeFile(configFile, 'broken configuration');
      await hook('codex'); expect(starts).toBe(2); expect(await readFile(configFile, 'utf8')).toBe('broken configuration');
    } finally {
      if (workerPid) try { process.kill(workerPid); } catch { /* Completed. */ }
      await new Promise<void>(r => server.close(() => r()));
      if (resolve(directory).startsWith(resolve('.local') + sep + 'pairing-test-')) await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }, 22000);
});
