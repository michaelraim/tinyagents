# Tinyagents: what is left to do

Website: **https://tinyagents.michael-325.workers.dev**

The website is open to everyone. Anyone can create an office without an invite. Each office's activity stays private.

## You do not need to set up hosting

Cloudflare hosting, the database, the public plugin repository, and GitHub deployment are configured.

Every push to **main** runs checks on Windows and Linux. When both pass, GitHub updates Cloudflare automatically and checks the live website. A failed check leaves the previous version running. Feature branches and pull requests do not replace the live site.

See progress under [GitHub Actions](https://github.com/michaelraim/tinyagents/actions).

## Connect your agents

1. Open the website and click **Connect agents → New office**.
2. Save the **recovery file** and **connection file**. Keep both private.
3. Follow the [short connection guide](https://tinyagents.michael-325.workers.dev/setup.html). It has copyable commands for Windows, macOS, Linux, Codex and Claude Code.
4. Restart the coding clients, review/trust their hooks, and start a task.

You need Node.js 22.18 or newer on the computer where the agents run. If an agent runs inside WSL or on another computer, pair it there too. This version supports locally running Codex/Claude sessions; Codex cloud-orchestrated sessions cannot run the local observer.

You do not need to give the website an OpenAI or Anthropic API key.

## Replace the deployment token before it expires

The supplied Cloudflare token expires on **16 October 2026 at 02:59 Israel time**.

The token is saved as an encrypted GitHub Actions secret. It is not in this public repository. Before it expires:

1. Create a replacement Cloudflare token with **Edit Cloudflare Workers** access for this account. Choose a longer lifetime if you want unattended updates to continue.
2. Open [the repository's Actions secrets](https://github.com/michaelraim/tinyagents/settings/secrets/actions).
3. Edit **CLOUDFLARE_API_TOKEN** and paste the replacement.
4. Push a change to main, or run **Deploy to Cloudflare** from GitHub Actions.

The running website does not shut down when the deployment token expires. New deployments will fail until the secret is replaced. Token creation and expiry are controlled by your Cloudflare account; the current token cannot extend its own lifetime.

Cloudflare's [deployment token instructions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) show the required permissions. No R2 bucket or S3 credentials are needed for this application.

## Everyday use

- **Open your office elsewhere:** Connect agents → Open office → choose the recovery file.
- **Lost or exposed connection key:** Connect agents → Manage → choose the recovery file → Replace all keys. Save the new files and pair your clients again.
- **Delete an office:** Connect agents → Manage → choose the recovery file → Delete this office.
- **No agents appear:** run `node bridge/office.mjs doctor` from your checkout. Then check hook trust and start a new task.
- **Updates stopped after a network problem:** run `node bridge/office.mjs flush`.

Save the recovery file. There is no email reset. Someone with a viewer key can watch but cannot delete your office or replace its keys.

## What to expect

This is a public beta. The simulation mirrors observed activity; it does not send prompts, approve requests, or control real agents. Long periods without hooks appear as missing activity rather than invented work.

Cloudflare's free plan has usage limits. Watch usage in the dashboard as the number of users grows. The app has signup and recovery rate limits, private office keys, and bounded history; it has not been load-tested for a large public launch.

[What the app stores](https://tinyagents.michael-325.workers.dev/privacy.html) · [Technical operations](operations.md)
