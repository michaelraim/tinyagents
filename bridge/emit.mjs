import { normalizeHook } from './normalize.mjs';
import { readConfig, enqueue, flush } from './transport.mjs';

// Fail-open observer: no decisions, permission responses or model context.
async function main() {
  const config = await readConfig();
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 2_000_000) return; }
  const raw = JSON.parse(input);
  const cwd = String(raw.cwd ?? '').replace(/\\/g, '/');
  const event = normalizeHook(raw, process.argv[2], { ...config, ...(config.projects?.[cwd] ?? {}) });
  if (!event) return;
  await enqueue(config, event);
  await flush(config);
}
main().catch(() => {}).finally(() => { process.stdout.write('{}'); });
