# Tinyagents launch and connection guide

Tinyagents is the repository name; the application currently uses the **Sidequest** brand.

## Launch status

Prepared for a **private, invite-only alpha on Cloudflare Workers**. The code, generated assets, downloadable observers and local Cloudflare runtime checks are included. A production deployment and real-client acceptance still require the steps below.

This is a live activity mirror with a playful 3D interpretation. It does not execute prompts, approve tools, answer permission requests or control your real agents. Existing sessions appear only when they emit an observed hook.

| Area | Status |
| --- | --- |
| 3D office, variable project/session rooms, characters, interactions and 1,000 props | Implemented |
| Cloudflare Worker, SQLite Durable Objects and authenticated WebSockets | Implemented; tested with local workerd |
| Codex and Claude observer processes, plugin packages and repo marketplaces | Implemented; packaged commands tested on Windows |
| Pairing validation, diagnostics, bounded offline queue and retry tools | Implemented; tested through the Worker |
| Windows and Linux automated verification | Workflow included; remote CI results appear under GitHub Actions |
| Your Cloudflare account, deployment URL and private invite | You provide these |
| Real Codex and Claude sessions after installation | Final acceptance step; not yet verified |
| Open public SaaS, accounts and self-service credential lifecycle | Not ready; see remaining product work |

## Architecture and hosting

Use **Cloudflare Workers with Static Assets**, not a Pages-only upload. Wrangler deploys the Vite output and API together. Each office has one SQLite-backed Durable Object that stores its bounded snapshot and broadcasts updates over WebSockets. There is no separate database, Node server, model API subscription or Vercel project to provision.

`wrangler.jsonc` names the Worker **sidequest-office**. The expected URL is `https://sidequest-office.YOUR-SUBDOMAIN.workers.dev`; Wrangler prints the real URL. A custom domain is optional.

Cloudflare offers free static asset requests and a free SQLite Durable Objects tier, subject to quotas. API requests, storage operations and connected viewers still consume resources. This is a suitable starting point for a personal office, not a promise of unlimited free hosting. Check your account usage as you add users. [Static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## What you need to provide

- GitHub access to `michaelraim/tinyagents`. If the repository is private, every marketplace installer also needs access, or must use a local checkout.
- A Cloudflare account with permission to deploy Workers and Durable Objects; complete Cloudflare's initial account setup and choose a workers.dev subdomain if asked.
- A private, random invite value stored as the Worker secret `REGISTRATION_KEY`. Use your password manager to generate and save it. It is not your Cloudflare password or API token.
- Node.js **22.18 or newer** on PATH, plus Git. Node must be available to the actual client process, including desktop apps, WSL or SSH hosts.
- Current Codex and/or Claude Code, signed into your own account. Enable the observer plugin and review its hooks. Organization policy can disable local hooks.

You do **not** give the web application an OpenAI API key, Anthropic API key, Codex login, Claude login or transcript directory. Each local observer uses only its generated office ingest key.

## 1. Get and verify the project

Run in a terminal:

```sh
git clone https://github.com/michaelraim/tinyagents.git
cd tinyagents
npm ci
npm run verify
```

If you already have this checkout, use it instead of cloning again.

`verify` regenerates the plugin packages, checks frontend and Worker TypeScript, builds production assets, runs tests, performs a deployment dry run and runs an isolated local Cloudflare acceptance test. It does not log into Cloudflare, deploy publicly or modify your coding-client settings. `npm audit` checks the dependency lockfile separately.

Generated model files are committed. After changing the voxel recipes, run `npm run assets:build` and commit the resulting models, previews and packs.

## 2. Deploy to Cloudflare

From the repository:

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
npx wrangler secret put REGISTRATION_KEY
```

Select your account if prompted. The first deployment creates the Worker and Durable Object binding. Registration remains disabled until you enter the private invite in the secret prompt. Enter only the invite value; do not put it in source files or command arguments.

The deploy command runs all verification before uploading. No separate asset upload or database migration command is needed: the initial SQLite Durable Object migration is declared in `wrangler.jsonc`.

Open the printed HTTPS URL. Then visit `https://YOUR-WORKER.workers.dev/api/health`. It should return:

```json
{"ok":true,"storage":"cloudflare","registration":true}
```

This health response confirms routing and registration configuration; it does not replace the real connection checks below.

Do not change the Worker name or delete the Durable Object migration after creating real offices. A new Worker or changed binding can point at different state.

## 3. Create and save your office

In the **deployed HTTPS app**, choose **Connect agents → New office** and enter your invite.

Save both downloads somewhere private:

| File | Purpose |
| --- | --- |
| `sidequest.config.json` | Endpoint, office ID and ingest key. The local observer uses this to write activity. |
| `sidequest.recovery.json` | Office ID, viewer key and URL. Use **Join my office** on another browser or after your login expires. |

The keys are only shown at creation. There is no email recovery. Keep the files in a password manager or another private location. Do not commit, send to an agent prompt, or put them inside `public/`.

The browser stores the office ID and an HttpOnly viewer cookie. It restores the live office after reload. Choosing the demo is remembered separately. The viewer cookie lasts 30 days; an expired login displays **Sign in · Connect agents**.

The live office starts empty. Downloading a plugin alone does not install or pair it.

## 4. Pair your machine once

From the cloned repository, using the downloaded connection file:

```sh
node bridge/setup.mjs "/absolute/path/to/sidequest.config.json"
node bridge/office.mjs doctor
```

Windows PowerShell example:

```powershell
node bridge/setup.mjs "$env:USERPROFILE/Downloads/sidequest.config.json"
node bridge/office.mjs doctor
```

Setup verifies the endpoint and authenticates before saving `~/.sidequest/config.json`. Existing configuration is backed up to `config.json.backup` before replacement. Both providers share the pairing; setup only needs to run once per execution environment.

A successful doctor prints **Ingest credentials accepted**. It creates no fake agent.

If using downloaded plugin ZIPs instead of a checkout, extract a ZIP and run `node scripts/setup.mjs PATH` and `node scripts/office.mjs doctor` from that extracted folder. Both ZIPs contain the same pairing tools.

Windows and WSL have separate homes and PATHs. Pair inside WSL if the coding client runs there. Pair on the SSH host if the coding client runs remotely. Merely opening a remote session from a paired local desktop does not pair the remote host.

## 5. Install the Codex observer

With a current Codex CLI:

```sh
codex plugin marketplace add michaelraim/tinyagents
codex plugin add sidequest-office@tinyagents
```

Restart Codex. Check that **Sidequest office** is enabled in the plugin directory and review/trust its hooks with `/hooks`. Changed hooks may require review again.

For a local checkout, replace `michaelraim/tinyagents` with its absolute directory in the marketplace-add command. If your client does not have these CLI commands, open this trusted repository in Codex, restart the app and select **Tinyagents** in its plugin directory. The repository catalog is `.agents/plugins/marketplace.json`.

Install only one copy of this observer; do not also manually merge its hooks into global settings. The tested CLI exposes `codex plugin add`; older versions may need updating.

This package targets **locally orchestrated Codex sessions**. Cloud-orchestrated Work sessions cannot run this local command-hook observer. Organization settings may restrict hooks. See [Codex hooks](https://learn.chatgpt.com/docs/hooks) and [plugin packaging and marketplaces](https://developers.openai.com/plugins/build/plugins).

## 6. Install the Claude Code observer

```sh
claude plugin marketplace add michaelraim/tinyagents
claude plugin install sidequest-office@tinyagents --scope user
```

Restart Claude Code and inspect `/hooks`. User scope makes the plugin available across your local projects. The catalog lives at `.claude-plugin/marketplace.json`.

For a local checkout, use its absolute path in marketplace-add. For a one-session test with an extracted ZIP:

```sh
claude --plugin-dir "/absolute/path/to/extracted/claude-plugin"
```

Use a persistent marketplace install for daily use. Your organization may restrict plugins and hooks. See [Claude marketplace setup](https://code.claude.com/docs/en/plugin-marketplaces) and [hook reference](https://code.claude.com/docs/en/hooks).

## 7. Confirm real activity before relying on it

Keep the deployed office open. In each installed coding client:

1. Start a new session inside a real project and ask it to inspect a small file. A project room and coworker should appear.
2. Ask for a small edit or a test run. Activity should change while the corresponding tools execute.
3. If your normal workflow uses subagents, start one and verify it appears under the same session.
4. Exercise a permission request through your normal client settings. The office should show **Needs you** if the host emits that event. Approve or answer inside the coding client.
5. Finish the turn, reload the web page, and confirm the same live office returns.
6. Open another project and verify it gets a separate room. Use both providers at once to verify both appear.

If a particular event is missing, inspect the client's `/hooks`, run doctor, and check the queue. A transport fixture test cannot prove that every client version emits every event. Do not treat the deployment as fully accepted until both real-client checks pass.

## Project grouping and atmosphere

By default, the normalized working directory determines the project ID and its final folder name becomes the visible name. Worktrees with different paths appear separately. Give related paths the same explicit `projectId` to group them:

```json
{
  "endpoint": "https://YOUR-WORKER.workers.dev/api/events",
  "officeId": "YOUR-GENERATED-OFFICE-ID",
  "ingestKey": "YOUR-GENERATED-INGEST-KEY",
  "projects": {
    "C:/work/my-app": {
      "projectId": "my-app",
      "projectName": "Orbit",
      "theme": "studio",
      "taskLabel": "Build the dashboard"
    },
    "C:/worktrees/my-app-feature": {
      "projectId": "my-app",
      "projectName": "Orbit",
      "theme": "studio"
    }
  }
}
```

Edit your private config, not this example. Use exact working-directory paths with forward slashes. Overrides do not discover child folders automatically. Themes are `studio`, `lab`, or `garden`; the web app's **Make it yours** panel provides the 50 verticals and prop customization. Browser decorations are saved on that device, not synchronized to every viewer.

Names and configured task labels are shared metadata. Do not put secrets in them. The observer never scans your code to infer a theme.

## Reliability, privacy and troubleshooting

The observer sends allowlisted activity metadata: provider, hashed IDs, display names, parent links when supplied, tool category/name, generic activity and timestamps. It does not transmit raw prompts, command arguments, source code, results or transcripts. Hashes obscure IDs and paths; they are not a claim of strong anonymization. Cloudflare stores the resulting office metadata.

| Symptom | Action |
| --- | --- |
| Health returns HTML/404 | Deploy the Worker from this repository, including `/api/*` routing. A static-only upload cannot ingest events. |
| Registration returns 503 | Set `REGISTRATION_KEY` on the correct Worker. |
| Invite rejected | Use the exact invite secret, not a viewer key or Cloudflare token. |
| Setup/doctor reports 401 or 404 | Check endpoint and connection file. Use the deployed office's ingest credentials. |
| Connection check times out | Check HTTPS, network/proxy access and Cloudflare availability. The observer does not follow redirects. |
| Doctor succeeds but office is empty | Check plugin enablement, hook trust, Node PATH, execution environment and supported local session type. Start a new request. |
| Wrong project grouping | Configure exact cwd overrides with a shared `projectId`. |
| **Sign in · Connect agents** | Choose **Join my office**, then enter office ID and viewer key from recovery. |
| Agent becomes Away mid-task | No hook was observed for five minutes. A long tool call or disconnected client may explain it. |
| Events remain queued | Run `node bridge/office.mjs flush`. For ongoing retry, run `node bridge/office.mjs watch` in a terminal. |
| HTTP 400 during flush | Check machine clock, plugin version and locally queued JSON. Preserve the queue while diagnosing; do not repeatedly recreate offices. |
| HTTP 429 | Close excess viewer tabs or wait a minute before retrying. |
| 3D scene cannot start | Use a WebGL-capable browser with hardware acceleration. |
| GitHub plugin installation fails | Confirm repository access; try adding an authenticated local checkout. |

The queue holds the latest 256 events, expires entries after seven days, and sends batches of up to 20. Hooks retry on subsequent invocations. Optional `watch` retries every five seconds while its terminal is open; Ctrl+C stops it. It sends queued events only, not fabricated activity or heartbeats. Host shutdown can cancel an asynchronous callback before it queues anything.

The server deduplicates recent event IDs and rejects invalid timestamps/payloads. It retains 160 agents, 80 activity entries and 1,024 recent IDs per office. Up to 10 simultaneous viewer sockets are allowed. This is a bounded activity view, not an audit archive.

`Stop` means the turn ended, not that every task succeeded. `PostToolUse` means a tool returned, not that tests passed. Parent links fall back to the root session when the host does not provide a nested parent. Gestures, feelings and break-room movement are playful interpretations.

## Updates and optional GitHub deployment

The **Verify** workflow runs on pushes to main and pull requests, on Windows and Linux. Confirm it is green in GitHub Actions after pushing.

To deploy updates manually:

```sh
git pull --ff-only
npm ci
npm run deploy
```

Keep the same Worker name and bindings to retain office state.

An optional **Deploy to Cloudflare** workflow is included and runs only through **Actions → Run workflow** on main. For it, create a GitHub `production` environment and add secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use Cloudflare's Workers deployment token guidance and restrict it to your account. The registration invite remains a Worker secret; the workflow does not configure or rotate it. See [Cloudflare's GitHub Actions setup](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

For plugin updates, increment the plugin version in `scripts/build-plugins.mjs`, rebuild, commit and push. Users refresh the marketplace and update/reinstall the plugin through their client's plugin controls, then review changed hooks. Existing pairing files remain valid.

## Local development

```sh
npm run dev
npm run bridge
```

Run these in separate terminals. Open `http://127.0.0.1:5187`. The bridge listens on loopback port 8787 and saves state under ignored `.local/`. Local offices need no invite.

To inspect the Cloudflare version locally:

```sh
npm run build
npx wrangler dev --port 8788 --var REGISTRATION_KEY:local-test-invite
```

Open port 8788 and use that test invite. Local offices and deployed offices have separate state and keys. Never pair a remote coding machine to a localhost endpoint from another computer.

## Remaining work before a public product launch

Private alpha use is the current scope. These are product and operational gaps, not settings you can fill in:

- Account sign-in, device-specific keys, token revocation/rotation, office deletion and recovery controls.
- Distributed abuse prevention, per-user quotas, monitoring and retention/export policies.
- Load testing at larger project and agent counts; 160 retained records is not a validated smooth-rendering guarantee.
- A broader real-client and OS compatibility matrix, including supported Codex/Claude releases.
- Public marketplace distribution, onboarding polish, privacy/terms and support policy.
- Remote approval/reply controls, transcript viewing, token costs and cloud-orchestrated agent support.

Changing `REGISTRATION_KEY` only changes who can create new offices; it does not revoke existing viewer/ingest keys. There is no self-service revoke/delete API yet. If a key leaks, stop using that office and restrict/remove the affected deployment while implementing proper revocation; replacing the pairing file alone does not invalidate the leaked key.

To stop local reporting, disable/uninstall the observer in both clients and stop any watch process. The private connection, backup and outbox remain under `~/.sidequest/` until you remove them yourself.
