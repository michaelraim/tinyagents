import { normalizeHook } from './normalize.mjs';
import { readConfig, enqueue, flush } from './transport.mjs';
import { resolveProject } from './project.mjs';
import { startPairing } from './pairing.mjs';

// Fail-open observer: no decisions, permission responses or model context.
async function main() {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 2_000_000) return; }
  const raw = JSON.parse(input);
  let config;
  try { config = await readConfig(); }
  catch (error) {
    if (error.code === 'ENOENT' && ['SessionStart', 'UserPromptSubmit'].includes(raw.hook_event_name) && ['codex', 'claude'].includes(process.argv[2])) await startPairing({ provider: process.argv[2] });
    return;
  }
  const cwd = String(raw.cwd ?? '').replace(/\\/g, '/');
  const event = normalizeHook(raw, process.argv[2], resolveProject(cwd, config));
  if (!event) return;
  await enqueue(config, event);
  await flush(config);
}
main().catch(() => {}).finally(() => { process.stdout.write('{}'); });
