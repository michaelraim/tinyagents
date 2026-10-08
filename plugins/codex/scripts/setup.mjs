import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { readConfig, configPath, probe } from './transport.mjs';

try {
  if (!process.argv[2]) throw new Error('Usage: node scripts/setup.mjs /path/to/tinyagents.config.json');
  const config = await readConfig(path.resolve(process.argv[2]));
  await probe(config);
  const destination = configPath();
  await mkdir(path.dirname(destination), { recursive: true });
  if (path.resolve(process.argv[2]) !== path.resolve(destination)) {
    await copyFile(destination, `${destination}.backup`).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await writeFile(destination, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  console.log('Paired and authenticated. Install the plugin in each coding client, then review its hooks.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
