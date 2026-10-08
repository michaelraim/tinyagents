# Turn on GitHub and GitLab sign-in

Both providers are configured on the live tinyAGENTS site. These steps are kept for credential replacement or a separate self-hosted deployment. They are not part of user onboarding.

These apps are for everyone who uses tinyAGENTS. Each visitor signs in with their own account. Visitors do not create OAuth apps, provide tokens or download recovery files. Google is not used.

## 1. GitHub: create one OAuth app

Open [GitHub → New OAuth app](https://github.com/settings/applications/new).

Fill in:

| Field | Value |
| --- | --- |
| Application name | `tinyAGENTS` |
| Homepage URL | `https://tinyagents.michael-325.workers.dev` |
| Application description | `A living office for your coding agents.` |
| Authorization callback URL | `https://tinyagents.michael-325.workers.dev/api/auth/callback/github` |

Leave **Enable Device Flow** off. Click **Register application**, then **Generate a new client secret**. Keep this page open. You need its **Client ID** and **Client secret** in step 3. Use an OAuth app, not a personal access token or a GitHub App.

The application requests only `read:user` and `user:email`. It does not request repository access. GitHub accounts with a private email work too. [GitHub's instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [provider integration](https://better-auth.com/docs/authentication/github).

## 2. GitLab: create one application

Sign into [GitLab.com](https://gitlab.com). Open **your avatar → Edit profile → Access → Applications → Add new application**.

- **Name:** `tinyAGENTS`
- **Redirect URI:** `https://tinyagents.michael-325.workers.dev/api/auth/callback/gitlab`
- Keep **Confidential** enabled if that option is shown.
- Under **Scopes**, select **read_user** only.

Save the application. Keep its **Application ID** and **Secret** for step 3. This integration uses GitLab.com; private company GitLab servers are not included. [GitLab's instructions](https://docs.gitlab.com/integration/oauth_provider/), [provider integration](https://better-auth.com/docs/authentication/gitlab).

## 3. Paste the four values into Cloudflare

Open [the tinyagents Worker](https://dash.cloudflare.com/325c51bb660c9d0a12fd3cac89ea46ac/workers/services/view/tinyagents/production). Go to **Settings → Variables and Secrets → Add**. Select **Secret** for each value below:

| Secret name — copy exactly | Paste this value |
| --- | --- |
| `GITHUB_CLIENT_ID` | GitHub's Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub's Client secret |
| `GITLAB_CLIENT_ID` | GitLab's Application ID |
| `GITLAB_CLIENT_SECRET` | GitLab's Secret |

Save/deploy the changes when Cloudflare prompts you. Do not replace `BETTER_AUTH_SECRET`; it is already configured. Do not paste these values into chat or commit them to GitHub. [Cloudflare's secret settings](https://developers.cloudflare.com/workers/configuration/secrets/).

Refresh [tinyAGENTS](https://tinyagents.michael-325.workers.dev). A provider's button becomes available once both of its values are saved. Future pushes to main keep these secrets and update the code automatically. No additional GitHub Actions secrets are needed for OAuth.

## 4. Keep your current office

1. Click **Get your office → Continue with GitHub** (or GitLab).
2. After signing in, choose **I already have an office**. **Do not create a new office** if you want to keep the existing one.
3. Select `C:\Users\mgame\.sidequest\recovery.json` once.
4. Your current office is now attached to your account. Existing Codex and Claude connections keep working.
5. Open **My account & agents → Sign-in & account** to link the other provider if you want either login to open the same office.

On another browser or computer, use the same provider account. If both providers use different emails, explicitly linking them while signed in still lets them share the office. Signing into a second provider independently does not automatically merge accounts.

New users install a plugin, sign in when its browser opens, and approve their computer. The office and local connection are created automatically. See the [connection guide](https://tinyagents.michael-325.workers.dev/setup.html).

## Check it worked

Sign out and back in: the same office should open. Try the other provider after linking it. Existing public visitor links still work without login.

Both flows are tested with simulated provider responses against the actual Cloudflare runtime. The first real GitHub/GitLab consent and callback checks still require the OAuth apps above. Until their credentials are added, their buttons show **Coming online soon**; existing recovery access and the demo remain available.

## Local development with social login

The simple `npm run bridge` server is for local observer development and uses legacy keys. For real SSO use the Worker:

```sh
npm run build
npx wrangler d1 migrations apply AUTH_DB --local
npm run cloud:dev
```

Create separate development OAuth apps with callbacks `http://localhost:8788/api/auth/callback/github` and `http://localhost:8788/api/auth/callback/gitlab`. Put their four credentials, a new random `BETTER_AUTH_SECRET` of at least 32 characters, and `AUTH_BASE_URL=http://localhost:8788` in the ignored `.dev.vars` file. Open **http://localhost:8788** consistently, not a mix of localhost and 127.0.0.1. Never reuse production secrets in tests.

For another deployment, create its own D1 database with `npx wrangler d1 create tinyagents-auth`, update the database ID and `AUTH_BASE_URL` in `wrangler.jsonc`, apply remote migrations, set its own signing/provider secrets, and register callbacks for that deployment's URL.
