# Sidequest for Codex

Requires Node.js 22.18+ on PATH in the environment where the coding client runs.

1. Open your deployed office, choose Connect agents, and create an office with the owner's invite.
2. Download the connection file and save the viewer recovery file privately.
3. From this extracted plugin directory, pair your machine:

```sh
node scripts/setup.mjs /absolute/path/to/sidequest.config.json
node scripts/office.mjs doctor
```

Both clients share ~/.sidequest/config.json. SIDEQUEST_CONFIG overrides its location; SIDEQUEST_HOME overrides the state directory. Pair separately inside WSL or on a remote machine.

## Persistent installation

Run with a current Codex CLI:

```sh
codex plugin marketplace add michaelraim/tinyagents
codex plugin add sidequest-office@tinyagents
```

Restart Codex, enable the plugin, and review/trust its hooks through /hooks. If the installed client lacks the plugin CLI, open the cloned tinyagents repository in Codex and select Tinyagents in the plugin directory. This package supports local Codex sessions. Cloud-orchestrated sessions cannot run these local command hooks.

A private GitHub repository requires GitHub access. For a local checkout, replace michaelraim/tinyagents with the absolute path to the repository (not to this plugin folder). Start a new session or submit a request; earlier sessions are not automatically discovered.

## Diagnostics and retry

```sh
node scripts/office.mjs doctor
node scripts/office.mjs flush
node scripts/office.mjs watch
```

Doctor checks authentication without creating a simulated agent. Flush retries pending events. Watch retries every five seconds while its terminal stays open. Hooks also retry, and never alter the real agent's decisions.

Up to 256 events are kept for seven days. A timeout leaves them queued. Stop watch with Ctrl+C. Network issues never block your coding client intentionally; a host may run SessionEnd synchronously for up to three seconds. Silence becomes an unconfirmed/away state, not invented work.

## Privacy and configuration

Only provider, hashed project/session/agent IDs, display name, generic activity, allowlisted tool name, parent link and timestamp are sent. Prompts, raw commands, source, transcripts and tool output remain local.

Optional config: projectId, projectName, theme (studio/lab/garden), taskLabel, and projects (map of forward-slash cwd paths to overrides). Names and labels are shared; do not include secrets. Match projectId across worktrees to group them.

Full launch, updates and troubleshooting guide: https://github.com/michaelraim/tinyagents/blob/main/docs/launch-guide.md

Disable/uninstall the plugin to stop new reports; stop watch too. Keep connection and recovery files private. This is a self-hosted alpha, not a public-directory listing.
