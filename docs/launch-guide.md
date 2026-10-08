# tinyAGENTS: what is left to do

Homepage: **https://tinyagents.michael-325.workers.dev**

Your workspace: **https://tinyagents.michael-325.workers.dev/office** · Demo: **https://tinyagents.michael-325.workers.dev/demo**

GitHub and GitLab sign-in are configured on the live site. The new plugin connects through your browser. No connection-file download or import command is required.

## The new user experience

1. Install the Codex or Claude Code plugin using the [short setup guide](https://tinyagents.michael-325.workers.dev/setup.html).
2. Restart the coding app, enable/trust its hooks, and start a session. The plugin opens the browser.
3. Sign in if needed and click **Connect this computer**. Your office is created automatically. Start coding.

On Windows, run installation commands in **Windows Terminal or Command Prompt**, not in a Codex chat. The guide now uses `npx.cmd` to fetch the official CLI: the Codex desktop app alone does not put a `codex` command on your normal PATH. If `npx.cmd` is missing too, install Node.js 22.18+ and open a new terminal. Already on 0.6.2 or later? Restart the app and ask **“connect tinyAGENTS”** in a new chat.

Install both plugins to use both clients. They share the connection automatically on the same OS account. On another computer, sign into the same account during its browser connection. If the browser does not open, ask the agent **“connect tinyAGENTS”**.

Your existing computer connection is preserved. For an older office that has not been linked to social login, use **I already have an office** and its original owner recovery file once. New offices never need a recovery file.

## You do not need to set up hosting

Cloudflare hosting, the database, the public plugin repository, and GitHub deployment are configured.

Every push to **main** runs checks on Windows and Linux. When both pass, GitHub updates Cloudflare automatically and checks the live website. A failed check leaves the previous version running. Feature branches and pull requests do not replace the live site.

See progress under [GitHub Actions](https://github.com/michaelraim/tinyagents/actions).

The product is now **tinyAGENTS**. Existing connections still work. The technical plugin ID `sidequest-office`, the `~/.sidequest` folder, and older downloaded files remain supported so installed observers do not get disconnected. The connection download is `tinyagents.config.json`. Existing recovery files still work; new social-login accounts do not need one.

## On your current Windows computer

The previous connection check confirmed a valid key, but did not prove hooks were running. Two issues were found: Codex 0.161/0.162-alpha ignored the 0.6.0–0.6.1 package's hooks, and this computer was configured for a different office from the one opened by social sign-in. Version **0.6.2** fixes hook discovery and adds a safe office switch.

What is left for you:

1. Update each installed plugin to **0.6.2** using the setup guide, then restart the coding app.
2. In Codex, open **Settings → Hooks**, select **sidequest-office**, and review/trust its hooks. In the CLI, use **/hooks**. Installation alone does not approve hooks; a popup is not guaranteed.
3. Ask your coding agent **“Switch tinyAGENTS to my signed-in office.”** Check the account in the browser and click **Connect this computer**. The previous local connection is kept until approval, then backed up privately.
4. Start a real task. **My account & agents → Agent connection status** shows the last received report and which coding client sent it.

The pairing file is `%USERPROFILE%\.sidequest\config.json`. Both clients use it. Do not upload either file to GitHub or share it publicly.

The website's **Live view** badge only describes its live feed. **Waiting for agents** means no activity has reached that office. A paired computer can still be waiting for its first hook report. The `doctor` command shows the configured office ID and the last server receipt for that connection. Review and start a task after updating to confirm actual reporting.

## Requirements and limits

Node.js 22.18+ must be available where the coding app runs. WSL, containers, SSH and other computers connect separately, using the same account. This supports locally running Codex/Claude sessions; Codex cloud-orchestrated sessions cannot execute these local hooks. The coding app's hook trust review is still required.

No model API key, repository clone, npm install or local web server is needed to use the plugin. Existing installations need **0.6.2 or later**; the guide has the update commands.

## Your clock and the growing floor plan

New offices save the time zone of the computer connected by the plugin (or the browser when created on the website). Older offices pick up the first connected observer's time zone, unless the owner has already set one. Visitors see the owner's local time. A second harness cannot move an established office clock.

To change it: **Office settings → Office clock → Use my current time zone → Save office clock** (legacy offices still ask for the owner file until attached to an account). You can also type a zone such as `Asia/Jerusalem` or `America/New_York`. No GPS permission is needed. The clock includes daylight-saving changes. Lighting follows a gentle daily schedule, not seasonal astronomical sunrise times. The clock button cycles through night/day previews and back to the local clock.

Rooms, room sizes, shared-space sizes, placement and connecting paths are generated from the actual teams. Sessions grow their own suites; beyond twelve desks, a session gets an annex. Rooms belonging to the same project are encouraged to stay near one another. The layout can reflow as teams grow. It is not a saved building blueprint or a set of fixed project slots.

Try **+ Project**, **+ Session**, and **+ Subagent** in the demo. **Reset demo** restores the sample crew. Live offices only grow from real observer events.

## Conversations and little feelings

Small 3D bubbles anchored above each character show its observed state and a playful mood. Project names are painted on signboards mounted to entrance posts. Both move with the scene, not with a delayed screen overlay. Select the character for the details. A mood is an illustration, not an inference about a model's inner feelings.

The updated observers report subagent assignments and returns. Recognized direct-message tools can also report a hashed recipient ID. When both characters can be identified, they acknowledge each other at their desks or gather if both are between tasks. Unknown recipients and unsupported hook paths produce no invented conversation. Raw message text is never uploaded. These handoff scenes use the private activity stream; public visitors do not receive that history.

Coffee chats, hallway hellos, rubber-duck clubs and arcade rivalries also happen between resting characters. These are clearly labeled break scenes. They never cause real agents to send messages. Restart the clients after updating to observer **0.6.0** to get the new metadata.

## Share your office and visit friends

1. Open **Friends → Share my office**.
2. Set your public office name and motto. Signed-in owners do not need a recovery file.
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

Both plugins already use the same connection file on this computer. You only need one office. On another computer or inside WSL, connect through the browser using the same account.

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

- **Open your office elsewhere:** sign in with the same GitHub or GitLab account.
- **Lost or exposed connection key:** My account & agents → Connected computers → Remove the affected connection. Ask the coding agent to reconnect tinyAGENTS on that computer. For old pre-SSO keys, use the legacy Manage screen to replace all keys.
- **Delete your account and office:** My account & agents → Sign-in & account → Delete my account and office.
- **No agents appear:** ask the coding agent to diagnose the tinyAGENTS connection. Check hook trust and start a new task.
- **Updates stopped after a network problem:** run `node bridge/office.mjs flush`.

Your GitHub or GitLab account is your way back in. Keep its own account recovery options current. Existing viewer keys only grant viewing; they cannot claim an office. Old owner recovery keys remain valid, so keep those files private.

## What to expect

This is a public beta. The simulation mirrors observed activity; it does not send prompts, approve requests, or control real agents. Long periods without hooks appear as missing activity rather than invented work.

Cloudflare's free plan has usage limits. Watch usage in the dashboard as the number of users grows. The app has login and management rate limits, account ownership checks, private office keys, and bounded history; it has not been load-tested for a large public launch.

[What the app stores](https://tinyagents.michael-325.workers.dev/privacy.html) · [Technical operations](operations.md)
