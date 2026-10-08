import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { once } from 'node:events';
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local/worker-check-'));
const migration = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'AUTH_DB', '--local', '--persist-to', directory], { encoding: 'utf8', windowsHide: true, env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
if (migration.status !== 0) throw Error('Could not initialize test account database: ' + migration.stdout + migration.stderr);
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', directory, '--var', 'REGISTRATION_KEY:local-test-invite', '--var', 'PUBLIC_SIGNUP:true'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
let log = '';
worker.stdout.on('data', chunk => { log = (log + chunk).slice(-10000); });
worker.stderr.on('data', chunk => { log = (log + chunk).slice(-10000); });
const url = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (worker.exitCode !== null) throw new Error('Local Worker exited. ' + log);
    try { if ((await fetch(url + '/api/health', { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* Wait for workerd. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Local Worker did not start. ' + log);
  const smoke = spawn(process.execPath, ['scripts/smoke-worker.mjs'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, TEST_WORKER_URL: url, TEST_WORKER_INVITE: 'local-test-invite', TEST_RATE_LIMIT: 'true' } });
  const [code] = await once(smoke, 'exit');
  if (code !== 0) {
    // Let Wrangler's buffered diagnostics reach the parent before stopping it.
    await new Promise(resolve => setTimeout(resolve, 500));
    throw new Error('Cloudflare acceptance failed. Worker output:\n' + log);
  }
} finally {
  if (worker.exitCode === null) {
    const closed = once(worker, 'exit');
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(worker.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else worker.kill('SIGTERM');
    await closed;
  }
  if (resolve(directory).startsWith(resolve('.local') + sep + 'worker-check-')) await rm(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 500 });
}
