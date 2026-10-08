// Exercise host discovery, not just our JSON shape. A valid install previously
// exposed its skill while silently omitting every hook from the runtime.
import { mkdir, mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = process.env.TINYAGENTS_CODEX_BIN;
const command = executable || process.execPath;
const prefix = executable ? [] : [path.resolve('.local/codex-host/node_modules/@openai/codex/bin/codex.js')];
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(path.resolve('.local/codex-discovery-'));
const env = { ...process.env, CODEX_HOME: path.join(directory, 'home') };
try {
  await mkdir(env.CODEX_HOME, { recursive: true });
  const marketplace = path.join(directory, 'marketplace');
  await mkdir(path.join(marketplace, '.agents/plugins'), { recursive: true });
  await cp('plugins/codex', path.join(marketplace, 'plugin'), { recursive: true });
  await writeFile(path.join(marketplace, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'tinyagents-test', plugins: [{ name: 'sidequest-office', source: { source: 'local', path: './plugin' } }] }));
  for (const args of [['plugin', 'marketplace', 'add', marketplace], ['plugin', 'add', 'sidequest-office@tinyagents-test']]) {
    const result = spawnSync(command, [...prefix, ...args], { env, encoding: 'utf8', windowsHide: true, timeout: 20000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  }
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, 'app-server', '--stdio'], { env, windowsHide: true, stdio: 'pipe' });
    const lines = createInterface({ input: child.stdout });
    let value, failure;
    const timer = setTimeout(() => { failure = Error('Codex hook discovery timed out'); child.kill(); }, 20000);
    child.stderr.resume();
    const send = (id, method, params) => child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', () => { clearTimeout(timer); lines.close(); failure ? reject(failure) : value ? resolve(value) : reject(Error('Codex exited before hook discovery')); });
    lines.on('line', line => {
      try {
        const message = JSON.parse(line);
        if (message.error) { failure = Error(message.error.message); child.kill(); return; }
        if (message.id === 1) {
          child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
          send(2, 'hooks/list', { cwds: [marketplace] });
        }
        if (message.id === 2) { value = message.result; child.kill(); }
      } catch (error) { failure = error; child.kill(); }
    });
    send(1, 'initialize', { clientInfo: { name: 'tinyagents_package_check', version: '1.0' }, capabilities: { experimentalApi: true } });
  });
  const entry = result.data[0], hooks = entry.hooks.filter(h => h.pluginId === 'sidequest-office@tinyagents-test');
  assert.deepEqual(entry.errors, []);
  assert.deepEqual(hooks.map(h => h.eventName).sort(), ['preToolUse','postToolUse','permissionRequest','sessionStart','sessionEnd','userPromptSubmit','subagentStart','subagentStop','preCompact','postCompact','stop','interrupt'].sort());
  assert.ok(hooks.every(h => h.enabled && h.trustStatus === 'untrusted'), 'hooks must be discoverable and still require human review');
  console.log('Codex runtime discovers all 12 packaged hooks; human trust remains required.');
} finally {
  if (directory.startsWith(path.resolve('.local') + path.sep + 'codex-discovery-')) await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
