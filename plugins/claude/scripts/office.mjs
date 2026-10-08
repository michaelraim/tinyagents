import { readConfig, probe, queuedFiles, flush } from './transport.mjs';
import { connect } from './pairing.mjs';
const command = process.argv[2] || 'doctor';
async function drain(config) {
  let delivered = 0;
  for (let batch = 0; batch < 13; batch++) {
    const before = (await queuedFiles(config)).length;
    if (!before) break;
    delivered += await flush(config, 6000);
    if ((await queuedFiles(config)).length >= before) break;
  }
  return delivered;
}
try {
  if (command === 'connect') { console.log(await connect({ switchOffice: process.argv.includes('--switch-office') })); process.exit(0); }
  if (!['doctor', 'flush', 'watch'].includes(command)) throw new Error('Usage: node scripts/office.mjs connect|doctor|flush|watch');
  const config = await readConfig();
  if (command === 'doctor') {
    const result = await probe(config);
    console.log(`Credentials accepted by ${new URL(config.endpoint).origin}. Office ID: ${config.officeId}.`);
    console.log(result.reporting?.lastReceivedAt ? `This connection last delivered activity at ${new Date(result.reporting.lastReceivedAt).toISOString()}. Providers: ${Object.keys(result.reporting.providers).join(', ')}. This is a receipt, not proof the client is still running.` : 'No confirmed activity receipt for this connection. Credentials alone do not prove hooks are running.');
    console.log('In Codex, open Settings → Hooks and review sidequest-office (or /hooks in the CLI), then start a task. Compare this office ID with My account & agents on the website; use connect --switch-office if they differ.');
    console.log(`${(await queuedFiles(config)).length} queued events. Run flush to retry, or watch to keep retrying while this terminal stays open.`);
  } else if (command === 'flush') {
    console.log(`Delivered ${await drain(config)} events; ${(await queuedFiles(config)).length} still queued.`);
  } else {
    console.log('Retrying queued events every 5 seconds. Ctrl+C stops. This does not invent activity or read transcripts.');
    for (;;) {
      try { const count = await drain(config); if (count) console.log(`Delivered ${count} events.`); }
      catch (error) { console.error(error.message); }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
