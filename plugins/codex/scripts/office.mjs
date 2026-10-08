import { readConfig, probe, queuedFiles, flush } from './transport.mjs';
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
  if (!['doctor', 'flush', 'watch'].includes(command)) throw new Error('Usage: node scripts/office.mjs doctor|flush|watch');
  const config = await readConfig();
  if (command === 'doctor') {
    const result = await probe(config);
    console.log(`Connected to ${new URL(config.endpoint).origin}. Ingest credentials accepted. Server: ${result.storage}.`);
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
