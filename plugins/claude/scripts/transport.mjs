import { readFile, mkdir, writeFile, readdir, unlink, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const stateHome = () => process.env.SIDEQUEST_HOME || path.join(homedir(), '.sidequest');
export const configPath = () => process.env.SIDEQUEST_CONFIG || path.join(stateHome(), 'config.json');
export function validateConfig(config) {
  const url = new URL(config.endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Remote offices require HTTPS.');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/api/events') throw new Error('Endpoint must be your office URL followed by /api/events.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(config.officeId) || !/^[a-f0-9]{64}$/i.test(config.ingestKey)) throw new Error('Invalid connection file. Download a new one from your office.');
  return config;
}
export async function readConfig(file = configPath()) { return validateConfig(JSON.parse(await readFile(file, 'utf8'))); }
export const outboxPath = config => path.join(stateHome(), 'outbox', config.officeId);
export async function queuedFiles(config) {
  await mkdir(outboxPath(config), { recursive: true });
  return (await readdir(outboxPath(config))).filter(f => /^\d+-[a-f0-9-]+\.json$/.test(f)).sort();
}
export async function enqueue(config, event) {
  const directory = outboxPath(config);
  await mkdir(directory, { recursive: true });
  const destination = path.join(directory, `${event.at}-${randomUUID()}.json`);
  // Concurrent readers only see complete files.
  await writeFile(`${destination}.tmp`, JSON.stringify(event), { mode: 0o600 });
  await rename(`${destination}.tmp`, destination);
  const files = await queuedFiles(config);
  await Promise.all(files.slice(0, Math.max(0, files.length - 256)).map(file => unlink(path.join(directory, file)).catch(() => {})));
}
export async function probe(config) {
  const response = await fetch(new URL('/api/connection', config.endpoint), {
    method: 'POST', headers: { Authorization: `Bearer ${config.ingestKey}`, 'X-Office-Id': config.officeId },
    redirect: 'error', signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`Connection check failed (HTTP ${response.status}). Check the deployment, office ID and ingest key.`);
  return response.json();
}
export async function flush(config, timeout = 1400) {
  const entries = [];
  for (const file of (await queuedFiles(config)).slice(0, 20)) {
    try {
      const event = JSON.parse(await readFile(path.join(outboxPath(config), file), 'utf8'));
      if (event.at < Date.now() - 7 * 86400_000) { await unlink(path.join(outboxPath(config), file)).catch(() => {}); continue; }
      entries.push({ file, event });
    } catch { /* Another emitter may have already flushed this file. */ }
  }
  if (!entries.length) return 0;
  const response = await fetch(config.endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ingestKey}`, 'X-Office-Id': config.officeId },
    body: JSON.stringify({ events: entries.map(entry => entry.event) }), redirect: 'error', signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Delivery failed (HTTP ${response.status}). Events remain queued; run doctor to check the connection.`);
  await Promise.all(entries.map(entry => unlink(path.join(outboxPath(config), entry.file)).catch(() => {})));
  return entries.length;
}
