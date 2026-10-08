import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

const common = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStart', 'SubagentStop', 'Stop', 'PreCompact', 'PostCompact'];
for (const provider of ['codex', 'claude']) {
  const files = {};
  const events = [...common, ...(provider === 'claude' ? ['Notification', 'PostToolUseFailure'] : ['Interrupt'])];
  const root = provider === 'codex' ? 'PLUGIN_ROOT' : 'CLAUDE_PLUGIN_ROOT';
  // Node resolves the environment variable, so spaces and Windows/POSIX shells work identically.
  const command = `node -e "process.argv[2]='${provider}';import(require('node:url').pathToFileURL(require('node:path').join(process.env.${root},'scripts','emit.mjs')).href)"`;
  const hooks = Object.fromEntries(events.map(event => [event, [{ hooks: [{
    type: 'command', command, ...(provider === 'codex' ? { commandWindows: command } : {}),
    async: true, timeout: 3,
  }] }]]));
  files['hooks/hooks.json'] = JSON.stringify({ description: 'Sidequest activity observer. Sends allowlisted metadata only; never changes agent decisions.', hooks }, null, 2);
  const manifest = { name: 'sidequest-office', version: '0.5.0', description: 'A living office for your coding agents. Metadata-only activity observer.', author: { name: 'Michael Raim' } };
  if (provider === 'codex') files['plugin.json'] = JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...manifest, extensions: { 'com.openai': { hooks: './hooks/hooks.json' } } }, null, 2);
  else files['.claude-plugin/plugin.json'] = JSON.stringify(manifest, null, 2);
  for (const file of ['emit.mjs', 'normalize.mjs', 'project.mjs', 'setup.mjs', 'transport.mjs', 'office.mjs']) files[`scripts/${file}`] = await readFile(`bridge/${file}`, 'utf8');
  files['README.md'] = `# Sidequest for ${provider === 'codex' ? 'Codex' : 'Claude Code'}

Requires Node.js 22.18+ on PATH in the environment where the coding client runs.

1. Open https://tinyagents.michael-325.workers.dev, choose Get your office, and create your office. No invite needed.
2. Download the connection file and save the recovery file privately. The recovery key lets you replace keys and delete the office.
3. From this extracted plugin directory, pair your machine:

\`\`\`sh
node scripts/setup.mjs /absolute/path/to/sidequest.config.json
node scripts/office.mjs doctor
\`\`\`

Both clients share ~/.sidequest/config.json. SIDEQUEST_CONFIG overrides its location; SIDEQUEST_HOME overrides the state directory. Pair separately inside WSL or on a remote machine.

## Persistent installation

${provider === 'codex' ? `Run with a current Codex CLI:

\`\`\`sh
codex plugin marketplace add michaelraim/tinyagents
codex plugin add sidequest-office@tinyagents
\`\`\`

Restart Codex, enable the plugin, and review/trust its hooks through /hooks. If the installed client lacks the plugin CLI, open the cloned tinyagents repository in Codex and select Tinyagents in the plugin directory. This package supports local Codex sessions. Cloud-orchestrated sessions cannot run these local command hooks.` : `Run:

\`\`\`sh
claude plugin marketplace add michaelraim/tinyagents
claude plugin install sidequest-office@tinyagents --scope user
\`\`\`

Restart Claude Code and inspect /hooks. To try this downloaded folder without a persistent install: claude --plugin-dir /absolute/path/to/this/folder.`}

The repository is public. For a local checkout, replace michaelraim/tinyagents with the absolute path to the repository (not to this plugin folder). Start a new session or submit a request; earlier sessions are not automatically discovered.

## Diagnostics and retry

\`\`\`sh
node scripts/office.mjs doctor
node scripts/office.mjs flush
node scripts/office.mjs watch
\`\`\`

Doctor checks authentication without creating a simulated agent. Flush retries pending events. Watch retries every five seconds while its terminal stays open. Hooks also retry, and never alter the real agent's decisions.

Up to 256 events are kept for seven days. A timeout leaves them queued. Stop watch with Ctrl+C. Network issues never block your coding client intentionally; a host may run SessionEnd synchronously for up to three seconds. Silence becomes an unconfirmed/away state, not invented work.

## Privacy and configuration

Only provider, hashed project/client/session/agent IDs, display name, generic activity, allowlisted tool name, parent link, optional room metadata, IANA time zone, hashed targets for recognized handoffs/messages and timestamp are sent. Prompts, raw commands, source, transcripts and tool output remain local.

Projects are identified by a locally hashed, normalized Git origin. SSH/HTTPS clones, subfolders and worktrees of the same remote share a project. Without a remote, the Git common directory is used; non-Git folders use their real path. Raw paths, remote URLs and remote credentials are never uploaded. Codex and Claude keep separate sessions and people inside that project.

Optional config: projectId (manual grouping override), projectName (display alias), vertical, projectDescription, theme (studio/lab/garden), taskLabel, instanceId (distinct client override), and projects (map of forward-slash folder paths to overrides, including subfolders). Names and labels are shared privately with your office; do not include secrets. Use the same projectId override when related folders have different remotes. On another machine, pair with the same office connection file.

Public visits are optional. Friends > Share my office on the website requires your recovery key. Public views omit task labels and tool details. Project names and briefs require a separate opt-in. Never share a connection or recovery file as a visitor link.

Simple setup guide: https://tinyagents.michael-325.workers.dev/setup.html

Disable/uninstall the plugin to stop new reports; stop watch too. Use Connect agents > Manage on the website to replace keys or delete the office. Keep connection and recovery files private. This is a public beta distributed through a GitHub marketplace, not a listing in the clients' official directories.
`;
  const zipFiles = {};
  for (const [filename, content] of Object.entries(files)) {
    await mkdir(`plugins/${provider}/${filename.split('/').slice(0, -1).join('/')}`, { recursive: true });
    await writeFile(`plugins/${provider}/${filename}`, content);
    zipFiles[filename] = strToU8(content);
  }
  await mkdir('public/plugins', { recursive: true });
  await writeFile(`public/plugins/${provider}.zip`, zipSync(zipFiles));
  console.log(`Built ${provider} plugin and downloadable zip`);
}
