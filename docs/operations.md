# tinyAGENTS operations

The owner-facing checklist is in [launch-guide.md](launch-guide.md). End-user setup is served at [/setup.html](https://tinyagents.michael-325.workers.dev/setup.html).

## Runtime

- Cloudflare Worker: `tinyagents`
- Website: `https://tinyagents.michael-325.workers.dev`
- Static assets: Vite's `dist/`, with API requests routed to the Worker first.
- State: one SQLite Durable Object per office, binding `OFFICES`, class `Office`.
- Accounts: Better Auth in the Worker, Cloudflare D1 binding `AUTH_DB`, migrations in `migrations/`. Private streams accept the owning account session or a legacy viewer cookie; public streams require owner-enabled sharing.
- Public registration: GitHub/GitLab social sign-in once either provider is configured. `PUBLIC_SIGNUP=true` permits only legacy signup while neither provider is configured.
- No external database, R2 bucket, AI API keys or always-on Node server is required.

Do not rename the Worker or Durable Object binding casually; doing so can select different state.

## Deployment

Push to main. The Verify and deploy workflow waits for both Windows and Linux verification, skips an outdated commit if main has moved, applies D1 migrations, deploys with the GitHub Actions secrets, and checks the public URL. Pull requests run verification only.

GitHub repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The deployment job uses the `production` environment. A manual Deploy to Cloudflare workflow is available for retries.

The current temporary deployment token expires on 16 October 2026 at 02:59 Israel time. Replacing this secret does not change office credentials.

For a manual deployment from an authenticated terminal:

```sh
npm ci
npm run deploy
```

Do not commit tokens, private connection/recovery files, `.env`, `.dev.vars`, `.local/`, or `.wrangler/`. Account login can use `npx wrangler login`; CI uses its encrypted secret.

If a deployment breaks the UI, revert the offending commit and push main again. Inspect GitHub Actions for failed verification, deployment or health steps. Keep storage schema changes backward-compatible before using Worker rollbacks.

## Social sign-in

See [sso-setup.md](sso-setup.md) for provider registration, exact callbacks and Worker secret names. `AUTH_BASE_URL` is fixed configuration, not derived from forwarded headers. Both providers need an ID and secret. `BETTER_AUTH_SECRET` signs cookies and encrypts stored provider tokens; keep it stable. Google/email-password login is disabled. OAuth routes are allowlisted, permission scopes and return URLs are fixed on the server, and account linking requires an authenticated flow.

The unique `office_owner` mapping binds one account to one office. First-time creation reserves a random ID in D1 and initializes the Durable Object idempotently. Import requires the original owner key; viewer keys cannot claim an office. Internal ownership/session headers are stripped from all incoming requests, then set only after database-backed authentication and a matching ownership record. A signed-in account cannot inherit another office from a legacy browser cookie.

Each account can issue up to 20 computer connections. Only their hashes are stored. Removing one leaves others active. Legacy keys remain valid after import; replacing all keys invalidates every connection. Social sessions expire after 30 days, with no cookie cache. Logout closes that session’s office streams and clears legacy cookies. Stream updates and pings recheck session expiry/revocation in D1. Account deletion removes the office, user, linked accounts, sessions and ownership mapping. Cloudflare backup retention still applies.

## Browser connection (plugin 0.6+)

First trusted SessionStart/UserPromptSubmit with no saved configuration launches a detached Node helper. It requests `/api/pairing/start` with a computer label, provider and IANA zone, opens `/connect?code=…`, and polls every five seconds for up to 15 minutes. Hook processes return immediately. Both plugins coordinate through one local launch lock and share the saved configuration. An existing valid configuration skips setup. An explicit `connect` checks its credentials; a revoked/deleted connection is backed up before a new browser handoff. Automatic attempts have a one-day cooldown after failure or dismissal; explicit setup can retry immediately.

Migration `0003_device_pairing.sql` stores an expiring request, SHA-256 digest of a 256-bit device secret, public confirmation code, label, provider, zone and approval state. Start requests use the signup limiter; browser approval uses the auth limiter, a logged-in account and a same-origin request. The account claim is atomic. Approval creates the office if needed and installs one idempotent connection. Polling needs the separate device secret; the public browser code never retrieves credentials. Delivery can retry within the expiry window. A domain-separated HMAC derives the temporary delivery key from the login signing secret and device digest; the Durable Object retains only its hash. Rotation of the login signing secret can interrupt an in-progress pairing but does not revoke previously saved connections.

The helper validates the endpoint, probes the credential, and atomically links a complete private file into place without replacing a concurrent connection. It acknowledges completion only after saving. The page waits for that acknowledgement before showing success. Expired requests are deleted on the next start request; account deletion cascades its approved requests. Polling cannot restore deleted offices or revoked keys. Hook input from before connection is not buffered or uploaded.

The setup skill provides a retry link for headless clients. `TINYAGENTS_URL` selects a self-hosted HTTPS origin (loopback HTTP is allowed for development); `TINYAGENTS_NO_BROWSER=1` suppresses the browser for tests/headless use. Manual JSON import stays available as a fallback. The official Codex directory currently excludes lifecycle-hook plugins, so distribution remains the repository marketplace. Hook review/trust remains in the host app.

## Legacy registration and authentication

A new office returns four values: its ID, ingest key, viewer key and owner/recovery key. Only key hashes are persisted server-side.

- Ingest key: write normalized activity and probe the connection.
- Viewer key: read office state.
- Owner/recovery key: read, manage sharing, replace all keys and delete the office.
- The cookie is HttpOnly, SameSite=Strict and Secure on the hosted Worker.
- Keys never appear in WebSocket query strings.
- Key replacement invalidates all previous keys, preserves office state and closes old viewer sockets.
- Deletion clears that office's durable storage and closes its sockets.

Users manage keys and deletion through Connect agents → Manage. Pre-0.3 local offices do not have a recovery key; create a new local office to use management. No such old office was deployed to this public Worker.

For a temporary **legacy** signup pause, change `PUBLIC_SIGNUP` to `false`. This flag does not pause social sign-in. Without `REGISTRATION_KEY`, registration then returns 503. If an invite is desired for a separate deployment, add `REGISTRATION_KEY` as a Worker secret. Existing office access continues.

## Public API

| Method | Route | Credential |
| --- | --- | --- |
| GET | /api/health | None |
| POST | /api/offices | Legacy signup only, while no social provider is configured |
| GET | /api/account | Returns provider readiness and the current account/office (or null) |
| POST | /api/account/office | Account cookie; create or claim with owner proof |
| DELETE | /api/account | Account cookie; delete account and its office |
| POST | /api/auth/sign-in/social | GitHub or GitLab OAuth start |
| GET | /api/auth/callback/github or /gitlab | OAuth state and provider callback |
| POST | /api/auth/link-social or /sign-out | Account cookie |
| GET | /api/auth/get-session or /list-accounts | Current account session |
| GET / POST / DELETE | /api/connections?office=ID | Owning account cookie or legacy owner key |
| POST | /api/session | Office ID and viewer/recovery key in JSON |
| POST | /api/connection | Ingest bearer key + X-Office-Id |
| POST | /api/events | Ingest bearer key + X-Office-Id |
| GET | /api/snapshot?office=ID | Account or legacy viewer cookie |
| GET | /api/stream?office=ID | Viewer cookie, WebSocket upgrade |
| GET / POST | /api/share?office=ID | Recovery bearer key |
| GET | /api/public?office=ID | None; owner must enable sharing |
| GET | /api/public/stream?office=ID | None; sharing enabled, WebSocket upgrade |
| POST | /api/clock?office=ID | Recovery bearer key; JSON `{ "timeZone": "Asia/Jerusalem" }` |
| POST | /api/keys?office=ID | Recovery bearer key |
| DELETE | /api/office?office=ID | Recovery bearer key |

Origin checks reject cross-site browser requests. Ingestion uses a strict schema and a 64 KiB request limit. Observers never forward raw prompts, tool arguments or results.

## Public projection and neighborhood

Sharing is opt-in and stored with the office. Public payloads are built from an allowlist in `shared/public-office.ts`; private tasks, tools and history must never pass through. Name/brief disclosure is a separate setting. Socket tags distinguish public/private; broadcasts fail closed for unknown tags. Sharing changes send `sharing_changed`, close public sockets and trigger fresh authorization. The client establishes its heartbeat immediately on open; the local Cloudflare proxy delays close completion for completely silent clients, so explicit invalidation also clears their view.

Friends are browser-local bookmarks, not mutual friend accounts. Up to three published offices can join a personal neighborhood, each capped at 24 characters. Visitors refresh every 12 seconds, and failed/closed links remove their cast. Full office visits stream all retained characters. IDs are namespaced per office before layout, collision and hierarchy calculations. Social gathering only changes the local animation destination of idle/done agents; observed work states and real agent instructions remain untouched. Shared antics are not synchronized between browsers.

Project identities use a locally normalized Git origin fingerprint, falling back to common Git directory or real folder path. Provider and client identity separate simultaneous sessions. Use manual per-folder `projectId` overrides for related repositories. No migration merges previous observer identities; old records remain in bounded state.

## Clock and layout compatibility

`OfficeState.timeZone` is optional for old records. Browser signup supplies it; otherwise the first observer event with a valid IANA zone registers it. Only an owner-authorized `/api/clock` call changes an established zone. The update is stored and broadcast to private and public viewers. Public projection includes the zone, but excludes private collaboration events.

`shared/campus.ts` packs workload-sized rectangles by evaluating the current frontier, balancing compactness and project proximity. It routes and merges circulation tiles outside those rectangles. `shared/layout.ts` supplies furniture, capacities and clearances; the scene and navigation consume the same result. Twelve desks is a per-room capacity policy, not a predefined room-size template. Empty office state has only shared amenities. Large state changes can reflow the campus. Agent states alone do not rebuild its geometry.

The optional event `collaboration` field carries only a kind and hashed target IDs. Message animation requires a unique matching recipient within the same provider/client/office scope; no text parsing or guessed recipient names. The frontend suppresses historical replay on initial connection. Public visits receive no collaboration history. Cosmetic social invitations reserve actual navigation destinations, wait for the other character and yield when work resumes.

## Limits and monitoring

Signup is limited to 5 requests per minute per connecting IP; recovery/session management is limited to 30. Cloudflare's rate-limit binding is approximate and local to a data center, not a global quota or full bot defense. Shared networks may temporarily share a limit. The app does not store IPs in office records.

Each office accepts up to 600 ingestion batches per minute and 10 private viewer sockets plus 20 public visitor sockets. Each batch has at most 20 events. State retains 160 agents, 80 activity entries and 1,024 deduplication IDs.

Local observers hold up to 256 events, discard events older than seven days and retry on future hooks. The optional `watch` command retries every five seconds. It is not installed as an OS service.

Watch Worker requests, errors and Durable Object usage in Cloudflare. Free-tier limits still apply. No large-public-load test has been performed. Stronger global abuse controls and long-term history are future work. D1 stores login profile and session data, including provider email and session network metadata; see the privacy page. An operator can inspect stored metadata; this is not end-to-end encrypted storage.

## Development and checks

```sh
npm ci
npm run verify
npm audit
```

Verification also runs both OAuth flows with mocked external providers against real workerd/D1/Durable Objects, testing account isolation, concurrent office creation, owner-file import, connection revocation, sign-out and account deletion. No fake login endpoint is shipped. Verification builds plugin downloads and the frontend, checks TypeScript, runs tests, performs a Worker dry run, then starts an isolated local Worker and tests signup, real observer processes, private office isolation, hierarchy, WebSockets, queue retry, recovery, rotation, public sharing/projection/revocation and deletion.

```sh
npm run dev
npm run bridge
```

Run those in separate terminals to use the UI on port 5187 and the local bridge on port 8787. Or run `npm run build` then `npm run cloud:dev` to inspect the actual Worker implementation on port 8788.

The read-only production check is:

```sh
node scripts/check-deployment.mjs https://tinyagents.michael-325.workers.dev
```

`scripts/smoke-worker.mjs` creates temporary offices and deletes them after its checks. Point it at production only for an intentional acceptance run, not on every deployment.

## Plugin and asset updates

Change observer source under `bridge/`; do not edit generated copies in `plugins/`. Bump the version in `scripts/build-plugins.mjs` for plugin updates. `npm run build` rebuilds both client packages.

Change voxel recipes under `shared/`, then run `npm run assets:build`. Generated models, previews and packs are committed.

Local hooks need client enablement and trust. Codex cloud-orchestrated sessions cannot execute the local observer. Host event coverage varies: a missing parent falls back to the root session, and no hook is evidence of missing telemetry, not proof that an agent is idle.
