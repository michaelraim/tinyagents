# tinyAGENTS: what is left to do

Homepage: **https://tinyagents.michael-325.workers.dev**

Your workspace: **https://tinyagents.michael-325.workers.dev/office** · Demo: **https://tinyagents.michael-325.workers.dev/demo**

The website is open to everyone. Anyone can create an office without an invite. Each office stays private until its owner opens a public visitor link.

## You do not need to set up hosting

Cloudflare hosting, the database, the public plugin repository, and GitHub deployment are configured.

Every push to **main** runs checks on Windows and Linux. When both pass, GitHub updates Cloudflare automatically and checks the live website. A failed check leaves the previous version running. Feature branches and pull requests do not replace the live site.

See progress under [GitHub Actions](https://github.com/michaelraim/tinyagents/actions).

The product is now **tinyAGENTS**. Existing connections still work. The technical plugin ID `sidequest-office`, the `~/.sidequest` folder, and older downloaded files remain supported so installed observers do not get disconnected. New downloads are named `tinyagents.config.json` and `tinyagents.recovery.json`.

## On your current Windows computer

Your private office has been created. This computer is paired, and the tinyAGENTS observer is installed for both Codex and Claude Code. The connection check to Cloudflare passed.

What is left for you:

1. Restart Codex and Claude Code.
2. Check **/hooks** in each client. Enable **sidequest-office** and review/trust its hooks when asked.
3. Start a new task in a project. Open **/office** to watch its agent appear. The homepage is now an introduction, not your workspace.
4. Back up `%USERPROFILE%\.sidequest\recovery.json` somewhere private. You need it to open this office in another browser, replace keys, or delete the office.

The pairing file is `%USERPROFILE%\.sidequest\config.json`. Both clients use it. Do not upload either file to GitHub or share it publicly.

The observer packages were tested against the live server. Your first real task after restarting is still needed to confirm that each client is actually running its hooks. This existing chat does not gain new hooks halfway through a session.

## For everyone else, or another computer

1. Open the website and click **Get your office**.
2. Save the recovery and connection files.
3. Follow the [short connection guide](https://tinyagents.michael-325.workers.dev/setup.html). It has copyable commands for Windows, macOS, Linux, Codex and Claude Code.

To use your existing office on another computer, copy your private connection file there and pair that computer using the same guide. Use your recovery file to sign into the website.

You need Node.js 22.18 or newer on the computer where the agents run. If an agent runs inside WSL or on another computer, pair it there too. This version supports locally running Codex/Claude sessions; Codex cloud-orchestrated sessions cannot run the local observer.

You do not need to give the website an OpenAI or Anthropic API key.

## Your clock and the growing floor plan

New offices save the time zone of the browser that creates them. Older offices pick up the first connected observer's time zone, unless the owner has already set one. Visitors see the owner's local time. A second harness cannot move an established office clock.

To change it: **Office settings → Office clock → Load owner recovery file → Use my current time zone → Save office clock**. You can also type a zone such as `Asia/Jerusalem` or `America/New_York`. No GPS permission is needed. The clock includes daylight-saving changes. Lighting follows a gentle daily schedule, not seasonal astronomical sunrise times. The clock button cycles through night/day previews and back to the local clock.

Rooms, room sizes, shared-space sizes, placement and connecting paths are generated from the actual teams. Sessions grow their own suites; beyond twelve desks, a session gets an annex. Rooms belonging to the same project are encouraged to stay near one another. The layout can reflow as teams grow. It is not a saved building blueprint or a set of fixed project slots.

Try **+ Project**, **+ Session**, and **+ Subagent** in the demo. **Reset demo** restores the sample crew. Live offices only grow from real observer events.

## Conversations and little feelings

Small 3D bubbles anchored above each character show its observed state and a playful mood. Project names are painted on signboards mounted to entrance posts. Both move with the scene, not with a delayed screen overlay. Select the character for the details. A mood is an illustration, not an inference about a model's inner feelings.

The updated observers report subagent assignments and returns. Recognized direct-message tools can also report a hashed recipient ID. When both characters can be identified, they acknowledge each other at their desks or gather if both are between tasks. Unknown recipients and unsupported hook paths produce no invented conversation. Raw message text is never uploaded. These handoff scenes use the private activity stream; public visitors do not receive that history.

Coffee chats, hallway hellos, rubber-duck clubs and arcade rivalries also happen between resting characters. These are clearly labeled break scenes. They never cause real agents to send messages. Restart the clients after updating to observer **0.5.1** to get the new metadata.

## Share your office and visit friends

1. Open **Friends → Share my office**.
2. Choose your recovery file. Set your public office name and motto.
3. Leave project names off for anonymous room names, or turn them on to share names and room briefs.
4. Click **Open visitor link**, then **Copy link**. Anyone with that link can watch without an account.
5. To stop sharing, return here and click **Close visitor link**.

Your task text, tool details, source code, paths and private activity history are excluded from the visitor view. A public link still reveals character names, harnesses, hierarchy, generic work states, room themes and the office time zone. Already viewed information cannot be taken back.

To follow someone, paste their public link into **Friends → Add friend**. Click **Visit** for their full office. Check **In my world** and **Show my neighborhood** to bring up to three offices into your view, with up to 24 characters from each.

Try **Coffee summit**, **Rubber-duck debate**, **Competitive stand-up**, or **Arcade rivalry**. Characters between tasks meet in shared areas. These are visual jokes in your browser: they do not communicate between real coding agents or appear in your friend's browser. Busy agents continue their observed work. Friends are saved in this browser, not a shared address book.

## Know who is working where

Click a room sign or a project in the left rail. The project directory shows its name, vertical, short brief, harnesses, sessions and team hierarchy. **Edit room brief** adds a description; **Choose vertical & props** changes its theme. Publish again from Friends to share your updated decorations and brief.

Characters wear their room number and color. **⌘** means Codex; **✳** means Claude. **★** marks an agent with subagents; **↳** marks a subagent. Select anyone to see their project, session, harness and reporting relationship.

## Codex and Claude in the same office

Both plugins already use the same connection file on this computer. You only need one office. On another computer or inside WSL, pair with that same file.

The observer groups a project by its Git repository, not its display name. Codex and Claude working in the same repository share the project and keep separate sessions. Subfolders, worktrees and clones with the same Git origin also group together. Different repositories with the same name stay separate. A folder without Git is identified by its real path.

For folders that should be one project despite different remotes, set the same `projectId` in each folder's configuration override. The [connection guide](https://tinyagents.michael-325.workers.dev/setup.html) has an example. Repo fingerprints change when origin changes; existing records are not automatically migrated. Updating an older observer can leave old rooms visible as away until they age out of the bounded office history.

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
