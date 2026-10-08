import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const common = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStart', 'SubagentStop', 'Stop', 'PreCompact', 'PostCompact'];
for (const provider of ['codex', 'claude']) {
  const files = {};
  const events = [...common, ...(provider === 'claude' ? ['Notification', 'PostToolUseFailure'] : ['Interrupt'])];
  const root = provider === 'codex' ? 'PLUGIN_ROOT' : 'CLAUDE_PLUGIN_ROOT';
  const command = `node -e "process.argv[2]='${provider}';import(require('node:url').pathToFileURL(require('node:path').join(process.env.${root},'scripts','emit.mjs')).href)"`;
  const hooks = Object.fromEntries(events.map(event => [event, [{ hooks: [{ type: 'command', command, ...(provider === 'codex' ? { commandWindows: command } : {}), async: true, timeout: 3 }] }]]));
  files['hooks/hooks.json'] = JSON.stringify({ description: 'tinyAGENTS activity observer. Opens browser setup on first use; sends allowlisted metadata after connection. Never changes agent decisions.', hooks }, null, 2);
  const manifest = { name: 'sidequest-office', version, description: 'tinyAGENTS — a living office for your coding agents. Install, connect in your browser, start coding.', author: { name: 'Michael Raim' } };
  if (provider === 'codex') files['plugin.json'] = JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...manifest, extensions: { 'com.openai': { hooks: './hooks/hooks.json', onboardingSkill: './skills/connect-tinyagents/SKILL.md' } } }, null, 2);
  else files['.claude-plugin/plugin.json'] = JSON.stringify(manifest, null, 2);
  for (const file of ['emit.mjs', 'normalize.mjs', 'project.mjs', 'setup.mjs', 'transport.mjs', 'office.mjs', 'pairing.mjs']) files[`scripts/${file}`] = await readFile(`bridge/${file}`, 'utf8');
  files['skills/connect-tinyagents/SKILL.md'] = await readFile('bridge/connect-skill.md', 'utf8');
  files['README.md'] = `# tinyAGENTS for ${provider === 'codex' ? 'Codex' : 'Claude Code'}

Install the plugin, approve your computer in the browser, and start coding.
Requires Node.js 22.18+ on the coding client's PATH.

## Install

${provider === 'codex' ? `\`\`\`sh
codex plugin marketplace add michaelraim/tinyagents
codex plugin add sidequest-office@tinyagents
\`\`\`

Restart Codex, enable the plugin and review/trust its hooks in /hooks. Use the plugin's setup action or start a new session.` : `\`\`\`sh
claude plugin marketplace add michaelraim/tinyagents
claude plugin install sidequest-office@tinyagents --scope user
\`\`\`

Restart Claude Code and enable the plugin's hooks. Start a new session.`}

The plugin opens tinyAGENTS in your browser. Sign in with GitHub or GitLab if needed, check the computer name, and click **Connect this computer**. Your office is created automatically if you don't have one. The page confirms when the connection is saved. Start a task to bring your crew in.

No connection download, repository clone, npm install, recovery file or terminal pairing command is needed. If the browser doesn't open, ask your coding agent **connect tinyAGENTS**. The bundled skill returns a link and checks the connection.

Install both plugins if you use both clients. They share one office automatically in the same OS account. An already connected computer stays connected; no browser opens again. Connect separately inside WSL, containers, SSH or on another machine, using the same GitHub/GitLab account. Node must be installed in that environment. On headless machines, use the link returned by the setup skill.

This public beta uses a GitHub plugin marketplace. It is not listed in the clients' official directories. Locally running Codex/Claude sessions are supported; cloud-orchestrated Codex sessions cannot execute these local hooks. Hook trust stays under your coding client's control.

## Diagnostics

From this plugin folder:

\`\`\`sh
node scripts/office.mjs connect
node scripts/office.mjs doctor
node scripts/office.mjs flush
\`\`\`

Connect opens or resumes the browser handoff. Doctor checks credentials. Flush retries queued activity. Automatic pairing lasts 15 minutes and attempts at most once a day after cancellation or failure; an explicit connect retries immediately. Hooks remain fail-open and never change agent decisions. They don't replay activity from before pairing; start a task after connecting.

## Privacy and configuration

Only allowlisted activity metadata is uploaded after you approve the computer: provider, hashed project/session/agent identities, display names, generic activity, tool name, parent links, room metadata, local time zone and timestamps. Prompts, source, raw paths, remote URLs, commands, transcripts and tool output remain local. During connection, the website receives your computer name, client and time zone.

Both clients read ~/.sidequest/config.json. SIDEQUEST_CONFIG overrides the file; SIDEQUEST_HOME overrides the state directory. Keep these files private. Projects use a locally hashed Git origin: clones, subfolders and worktrees of the same remote share a room. Without a remote, identity uses the Git common directory or real folder path. Each harness keeps its own sessions and people.

Optional config fields: projectId, projectName, vertical, projectDescription, theme, taskLabel, instanceId, and a projects map of forward-slash folder paths to those overrides. For a self-hosted office, set TINYAGENTS_URL to its HTTPS origin before connecting. Advanced JSON import remains available with scripts/setup.mjs.

Manage connections under **My account & agents → Connected computers**. Remove a computer to revoke it. Disable/uninstall the plugin to stop new reports. Public visitor links are optional and never contain connection keys. Full guide: https://tinyagents.michael-325.workers.dev/setup.html
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
