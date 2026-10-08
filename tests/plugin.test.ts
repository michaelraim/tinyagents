import { describe, expect, it } from 'vitest';
import { readFile, mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { unzipSync } from 'fflate';
import { validateConfig } from '../bridge/transport.mjs';

describe('installable observers', () => {
  it('uses the Codex hook-capable manifest without a portable manifest shadowing it', async () => {
    const archive = unzipSync(await readFile('public/plugins/codex.zip'));
    expect(archive['plugin.json']).toBeUndefined();
    const manifest = JSON.parse(await readFile('plugins/codex/.codex-plugin/plugin.json', 'utf8'));
    expect(manifest.hooks).toBe('./hooks/hooks.json');
    expect(manifest.name).toBe('sidequest-office');
    expect(archive['.codex-plugin/plugin.json']).toBeDefined();
  });
  it('ships complete, synchronized packages and resolvable marketplace entries', async () => {
    for (const provider of ['codex', 'claude']) {
      const archive = unzipSync(await readFile(`public/plugins/${provider}.zip`));
      for (const file of ['emit.mjs', 'normalize.mjs', 'project.mjs', 'setup.mjs', 'transport.mjs', 'office.mjs', 'pairing.mjs']) {
        const source = await readFile(`bridge/${file}`, 'utf8');
        expect(await readFile(`plugins/${provider}/scripts/${file}`, 'utf8')).toBe(source);
        expect(new TextDecoder().decode(archive[`scripts/${file}`])).toBe(source);
      }
      expect(new TextDecoder().decode(archive['skills/connect-tinyagents/SKILL.md'])).toBe(await readFile('bridge/connect-skill.md', 'utf8'));
    }
    const codex = JSON.parse(await readFile('.agents/plugins/marketplace.json', 'utf8'));
    const claude = JSON.parse(await readFile('.claude-plugin/marketplace.json', 'utf8'));
    expect(codex.plugins[0].source.path).toBe('./plugins/codex');
    expect(claude.plugins[0].source).toBe('./plugins/claude');
  });
  it('runs each generated shell command from a plugin path containing spaces', async () => {
    await mkdir('.local', { recursive: true });
    const directory = await mkdtemp(resolve('.local/plugin shell-'));
    try {
      for (const provider of ['codex', 'claude']) {
        const root = resolve(directory, provider);
        await cp(`plugins/${provider}`, root, { recursive: true });
        const hooks = JSON.parse(await readFile(resolve(root, 'hooks/hooks.json'), 'utf8'));
        const handler = hooks.hooks.PreToolUse[0].hooks[0];
        expect(handler.command_windows).toBeUndefined();
        if (provider === 'codex') expect(handler.commandWindows).toBe(handler.command);
        const command = process.platform === 'win32' ? handler.commandWindows || handler.command : handler.command;
        const result = await new Promise<string>((accept, reject) => {
          const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
          const args = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
          const child = spawn(shell, args, { env: { ...process.env, PLUGIN_ROOT: root, CLAUDE_PLUGIN_ROOT: root, SIDEQUEST_HOME: directory, SIDEQUEST_CONFIG: resolve(directory, 'missing.json') }, stdio: 'pipe', windowsHide: true });
          let output = '', error = '';
          const timeout = setTimeout(() => { child.kill(); reject(new Error('Hook timed out')); }, 8000);
          child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { error += value; });
          child.on('error', reject); child.on('exit', code => { clearTimeout(timeout); code === 0 ? accept(output.trim()) : reject(new Error(error)); });
          child.stdin.end('{}');
        });
        expect(result).toBe('{}');
      }
    } finally {
      if (resolve(directory).startsWith(resolve('.local') + sep + 'plugin shell-')) await rm(directory, { recursive: true, force: true });
    }
  }, 20000);
  it('rejects insecure, redirected and malformed connection settings before storing credentials', () => {
    const valid = { endpoint: 'https://example.com/api/events', officeId: '12345678-1234-4123-8123-123456789abc', ingestKey: 'a'.repeat(64) };
    expect(validateConfig(valid)).toBe(valid);
    for (const endpoint of ['http://example.com/api/events', 'https://user:pass@example.com/api/events', 'https://example.com/api/events?secret=1', 'https://example.com/other']) expect(() => validateConfig({ ...valid, endpoint })).toThrow();
    expect(() => validateConfig({ ...valid, officeId: '../elsewhere' })).toThrow();
    expect(() => validateConfig({ ...valid, ingestKey: 'short' })).toThrow();
  });
});
