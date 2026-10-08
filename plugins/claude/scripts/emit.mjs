import { normalizeHook } from './normalize.mjs';
import { readConfig, enqueue } from './transport.mjs';
import { diagnostic, errorCode } from './diagnostics.mjs';
import { scheduleDelivery } from './delivery.mjs';
import { resolveProject } from './project.mjs';
import { startPairing } from './pairing.mjs';

// Fail-open observer: no decisions, permission responses or model context.
async function main() {
  const started=Date.now();
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 2_000_000) return; }
  const raw = JSON.parse(input);
  await diagnostic('hook.received',{provider:process.argv[2],hook:raw?.hook_event_name});
  let config;
  try { config = await readConfig(); }
  catch (error) {
    await diagnostic('hook.failed',{provider:process.argv[2],error:errorCode(error)});
    if (error.code === 'ENOENT' && ['SessionStart', 'UserPromptSubmit'].includes(raw.hook_event_name) && ['codex', 'claude'].includes(process.argv[2])) await startPairing({ provider: process.argv[2] });
    return;
  }
  const cwd = String(raw.cwd ?? '').replace(/\\/g, '/');
  const event = normalizeHook(raw, process.argv[2], resolveProject(cwd, config));
  if (!event) {await diagnostic('hook.ignored',{provider:process.argv[2],error:'unsupported_hook'});return;}
  await enqueue(config, event);
  await diagnostic('hook.queued',{provider:event.provider,hook:raw.hook_event_name,eventId:event.id,projectId:event.project.id,sessionId:event.sessionId,durationMs:Date.now()-started});
  scheduleDelivery();
  await diagnostic('delivery.scheduled',{provider:event.provider});
}
main().catch(error => diagnostic('hook.failed',{provider:process.argv[2],error:errorCode(error)})).finally(() => { process.stdout.write('{}'); });
