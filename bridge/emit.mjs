import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { normalizeHook, delegation } from './normalize.mjs';
import { readConfig, enqueue, stateHome } from './transport.mjs';
import { diagnostic, errorCode } from './diagnostics.mjs';
import { scheduleDelivery } from './delivery.mjs';
import { resolveProject } from './project.mjs';
import { startPairing } from './pairing.mjs';

const sessionFile = sessionId => path.join(stateHome(), 'sessions', `${createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 24)}.json`);

/**
 * Remember what a lead asked its subagents to do, so the subagent can show it.
 * Claude's SubagentStart doesn't carry the delegation text; the preceding Task call does.
 */
async function delegationContext(raw) {
  const file = sessionFile(raw.session_id);
  const isDelegation = raw.hook_event_name === 'PreToolUse' && /^(Task|Agent|spawn_agent)$/.test(String(raw.tool_name));
  const isStart = raw.hook_event_name === 'SubagentStart';
  if (!isDelegation && !isStart) return {};
  let pending = [];
  try { pending = JSON.parse(await readFile(file, 'utf8')).pending ?? []; } catch { /* First delegation in this session. */ }
  let result = {};
  if (isDelegation) {
    const text = delegation(raw.tool_input ?? {});
    if (text) pending.push(text);
  } else {
    result = { delegation: pending.shift() };
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify({ pending: pending.slice(-8), at: Date.now() }), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
  return result;
}

// Fail-open observer: no decisions, permission responses or model context.
async function main() {
  // Stamp the event when the hook fires, before any slow local lookups, so a
  // late-finishing hook process can't reorder an agent's timeline.
  const started = Date.now();
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 2_000_000) return; }
  const raw = JSON.parse(input);
  await diagnostic('hook.received', { provider: process.argv[2], hook: raw?.hook_event_name });
  let config;
  try { config = await readConfig(); }
  catch (error) {
    await diagnostic('hook.failed', { provider: process.argv[2], error: errorCode(error) });
    if (error.code === 'ENOENT' && ['SessionStart', 'UserPromptSubmit'].includes(raw.hook_event_name) && ['codex', 'claude'].includes(process.argv[2])) await startPairing({ provider: process.argv[2] });
    return;
  }
  const cwd = String(raw.cwd ?? '').replace(/\\/g, '/');
  const context = config.shareTasks === false ? {} : await delegationContext(raw).catch(() => ({}));
  const event = normalizeHook(raw, process.argv[2], resolveProject(cwd, config), started, context);
  if (!event) { await diagnostic('hook.ignored', { provider: process.argv[2], error: 'unsupported_hook' }); return; }
  await enqueue(config, event);
  await diagnostic('hook.queued', { provider: event.provider, hook: raw.hook_event_name, eventId: event.id, projectId: event.project.id, sessionId: event.sessionId, durationMs: Date.now() - started });
  scheduleDelivery();
  await diagnostic('delivery.scheduled', { provider: event.provider });
}
main().catch(error => diagnostic('hook.failed', { provider: process.argv[2], error: errorCode(error) })).finally(() => { process.stdout.write('{}'); });
