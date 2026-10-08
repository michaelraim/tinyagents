import { readFile, mkdir, writeFile, rename, unlink, link } from 'node:fs/promises';
import { hostname } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { configPath, stateHome, readConfig, validateConfig, probe } from './transport.mjs';

const defaultOrigin = 'https://tinyagents.michael-325.workers.dev';
const stateFile = () => path.join(stateHome(), 'pairing.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fingerprint = config => createHash('sha256').update(JSON.stringify(config)).digest('hex');
async function state() { try { return JSON.parse(await readFile(stateFile(), 'utf8')); } catch { return null; } }
async function save(value) {
  const temporary = stateFile() + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, stateFile());
}
function origin() {
  const url = new URL(process.env.TINYAGENTS_URL || defaultOrigin);
  validateConfig({ endpoint: url.origin + '/api/events', officeId: '00000000-0000-4000-8000-000000000000', ingestKey: 'a'.repeat(64) });
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('TINYAGENTS_URL must be the website origin.');
  return url.origin;
}
async function api(base, route, body) {
  const response = await fetch(base + '/api/pairing/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) { const error = new Error(`Connection request failed (${response.status}). Run connect again to retry.`); error.status = response.status; throw error; }
  return response.json();
}
export function openBrowser(url) {
  if (process.env.TINYAGENTS_NO_BROWSER === '1' || process.env.SSH_CONNECTION || process.env.SSH_TTY) return;
  // The URL is a validated origin and server-issued hex code, never a command.
  const windows = process.platform === 'win32' || !!process.env.WSL_DISTRO_NAME;
  const command = windows ? 'powershell.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = windows ? ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:TINYAGENTS_PAIR_URL'] : [url];
  const child = spawn(command, args, { env: { ...process.env, TINYAGENTS_PAIR_URL: url }, detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref();
}
// All hooks and both harnesses share one exclusive launch marker. No network
// requests or browser waits happen in the coding client's hook process.
export async function startPairing({ manual = false, provider = 'both', switchOffice = false } = {}) {
  if (switchOffice && !manual) throw Error('Switching offices requires an explicit connect request.');
  let existing;
  try { existing = await readConfig(); }
  catch (error) { if (error.code !== 'ENOENT') throw Error('Your saved connection needs attention. Run doctor; it has not been replaced.'); }
  const savedOrigin = existing && new URL(existing.endpoint).origin;
  let revokedFile;
  if (existing) {
    if (manual && !switchOffice) {
      try { await probe(existing); }
      catch (error) {
        if (![401, 404].includes(error.status)) throw error;
        // An explicit reconnect can repair revoked/deleted credentials, keeping
        // the old file privately for recovery. Network errors never replace it.
        revokedFile = configPath() + '.revoked-' + randomUUID();
        await rename(configPath(), revokedFile);
        existing = null;
      }
    }
    if (existing && !switchOffice) return { status: 'connected', officeId: existing.officeId, officeUrl: new URL('/office', existing.endpoint).href };
  }
  const base = process.env.TINYAGENTS_URL ? origin() : savedOrigin || origin();
  await mkdir(stateHome(), { recursive: true, mode: 0o700 });
  const active = value => {
    if (!value || value.expiresAt <= Date.now() || !['starting', 'pending', 'saving'].includes(value.status)) return false;
    if (manual && value.pid) { try { process.kill(value.pid, 0); } catch { return false; } }
    return true;
  };
  const previous = await state();
  if (active(previous)) {
    if (manual && previous.verificationUrl) openBrowser(previous.verificationUrl);
    return previous;
  }
  // Automatic retries must not repeatedly open a browser after cancellation or
  // a network outage. An explicit connect request can always retry immediately.
  if (!manual && previous && Date.now() - previous.startedAt < 86400_000) return previous;
  // Use a separate exclusive lock for launchers. The worker updates pairing.json
  // atomically; launchers must not unlink each other's live marker.
  const lock = stateFile() + '.lock';
  try { await writeFile(lock, String(Date.now()), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const at = Number(await readFile(lock, 'utf8').catch(() => Date.now()));
    if (Date.now() - at > 30_000) await unlink(lock).catch(() => {});
    return await state() || { status: 'starting' };
  }
  try {
    const current = await state();
    if (active(current)) return current;
    const next = { status: 'starting', startedAt: Date.now(), expiresAt: Date.now() + 30_000, base, provider, revokedFile,
      ...(existing && switchOffice ? { expectedConfig: fingerprint(existing), backupFile: configPath() + '.previous-' + randomUUID() } : {}) };
    await save(next);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--run'], { detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
    child.on('error', () => {}); child.unref();
    return next;
  } finally { await unlink(lock).catch(() => {}); }
}
async function run() {
  let current = await state();
  if (!current || current.status !== 'starting') return;
  current = { ...current, pid: process.pid };
  await save(current);
  try {
    // Exit if another setup method already connected this computer.
    try {
      const existing = await readConfig();
      if (current.expectedConfig) { if (fingerprint(existing) !== current.expectedConfig) throw Error('Saved connection changed.'); }
      else { await save({ status: 'connected', startedAt: current.startedAt, officeId: existing.officeId, officeUrl: new URL('/office', existing.endpoint).href }); return; }
    } catch (e) { if (e.code !== 'ENOENT' || current.expectedConfig) throw e; }
    const request = await api(current.base, 'start', { name: hostname().slice(0, 60) || 'My computer', provider: current.provider, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
    if (!/^[a-f0-9]{64}$/.test(request.deviceSecret) || !/^[A-F0-9]{12}$/.test(request.code) || !Number.isFinite(request.expiresAt)) throw Error('Invalid connection response.');
    const verificationUrl = current.base + '/connect?code=' + request.code;
    current = { ...current, ...request, verificationUrl, status: 'pending', expiresAt: Math.min(request.expiresAt, Date.now() + 15 * 60_000) };
    await save(current); openBrowser(verificationUrl);
    while (Date.now() < current.expiresAt) {
      await sleep(5000);
      let result;
      try { result = await api(current.base, 'poll', { deviceSecret: current.deviceSecret }); }
      catch (error) { if ([400, 401, 403, 410].includes(error.status)) throw error; continue; }
      if (result.status !== 'approved') continue;
      let config = validateConfig(result.config);
      if (new URL(config.endpoint).origin !== current.base) throw Error('The office address changed unexpectedly.');
      if (current.revokedFile) {
        const previous = await readConfig(current.revokedFile);
        if (previous.officeId === config.officeId) config = { ...previous, ...config };
      }
      if (current.expectedConfig) {
        const previous = await readConfig();
        if (fingerprint(previous) !== current.expectedConfig) throw Error('Saved connection changed.');
        if (previous.officeId === config.officeId && previous.endpoint === config.endpoint) config = { ...previous, ...config };
      }
      await probe(config);
      await mkdir(path.dirname(configPath()), { recursive: true, mode: 0o700 });
      const temporary = configPath() + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temporary, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
        // Hard-link an already complete private file. Never replace a connection
        // created by another setup process, even between the earlier checks.
        if (current.expectedConfig) {
          const previous = await readFile(configPath(), 'utf8');
          if (fingerprint(validateConfig(JSON.parse(previous))) !== current.expectedConfig) throw Error('Saved connection changed.');
          await writeFile(current.backupFile, previous, { flag: 'wx', mode: 0o600 });
          await rename(temporary, configPath());
        } else await link(temporary, configPath());
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existing = await readConfig();
        if (existing.officeId !== config.officeId || existing.ingestKey !== config.ingestKey || existing.endpoint !== config.endpoint) throw Error('Another office is already connected. Your saved connection was kept.');
      } finally { await unlink(temporary).catch(() => {}); }
      // Finish is retryable: the website only celebrates after local storage succeeds.
      while (Date.now() < current.expiresAt) {
        try { await api(current.base, 'finish', { deviceSecret: current.deviceSecret }); break; }
        catch (error) { if ([400, 401, 403, 410].includes(error.status)) break; await sleep(5000); }
      }
      await save({ status: 'connected', startedAt: current.startedAt, officeId: config.officeId, officeUrl: current.base + '/office' });
      return;
    }
    await save({ status: 'expired', startedAt: current.startedAt });
  } catch { await save({ status: 'failed', startedAt: current.startedAt }); }
}
export async function connect({ switchOffice = false } = {}) {
  let current = await startPairing({ manual: true, switchOffice });
  for (let attempt = 0; current.status === 'starting' && attempt < 40; attempt++) { await sleep(250); current = await state() || current; }
  if (current.status === 'connected') return `Connection saved for office ${current.officeId}. Website: ${current.officeUrl}\nThis checks credentials, not hook execution. Run doctor for reporting status. If your signed-in website shows a different office ID, use connect --switch-office.`;
  if (current.status === 'pending') return `Finish connecting in your browser: ${current.verificationUrl}\nApprove only if the computer name matches. Both Codex and Claude Code will use this office automatically.`;
  return 'Connection could not start. Check your network, then ask to connect tinyAGENTS again.';
}
if (process.argv[2] === '--run') run().catch(() => {});
