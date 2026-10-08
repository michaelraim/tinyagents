# tinyAGENTS

Small crew. Big things. A living office for your coding agents.

A public beta of a living Three.js coworking office for Codex and Claude Code. A reference video informed the cutaway rooms, miniature furniture, and expressive coworkers; all geometry here is original procedural Three.js geometry.

**[Homepage](https://tinyagents.michael-325.workers.dev)** · **[Open your office](https://tinyagents.michael-325.workers.dev/office)** · **[Connect your agents](https://tinyagents.michael-325.workers.dev/setup.html)** · **[Owner checklist](docs/launch-guide.md)**

Users sign in with GitHub or GitLab; their office activity is private. The operator first completes the [OAuth setup](docs/sso-setup.md). Cloudflare Workers serves the website and SQLite Durable Objects store office state. Every push to main deploys automatically after Windows and Linux checks pass.

## Run it

Requires Node.js 22.18+.

```sh
npm ci
npm run plugins:build
npm run assets:build
npm run dev
```

Open **http://127.0.0.1:5187**. It opens the public homepage with an interactive miniature. `/office` opens your real workspace; `/demo` is the explicitly labeled playground with thirteen simulated coworkers. Use + Project, + Session and + Subagent to exercise the layout generator. In a second terminal, start the local bridge to try actual hook events:

```sh
npm run bridge
```

Choose **Connect agents → Create my office**. Save the connection file and viewer credentials, download the client plugin, and follow the included README. The live office starts empty. Installation and trust review happen in the coding client; this repo does not modify your global Codex or Claude settings automatically.

## What works

- Full-screen simulation world with orbit, zoom, room focus, a dynamic minimap, day/evening lighting, and a camera that follows a coworker.
- Generated session suites, sized from workstation counts, with up to twelve desks before an annex is needed. A packing algorithm chooses positions from the existing footprint and routes paths through the remaining land; there are no predefined project slots or floor-plan templates. Shared spaces grow with headcount. Painted, post-mounted 3D entrance signs stay readable at overview zoom; character bubbles are native scene sprites with no DOM tracking lag.
- Articulated voxel coworkers with elbows and knees, blended seated poses, distance-driven walking, and distinct coding, reading, testing, thinking, waiting and blocked gestures. Idle/done agents visit shared spaces; new work brings them back. Offline agents leave an empty workstation. Pause, 1×/2× animation speed, and reduced-motion controls.
- A shared reception, meeting room, coffee kitchen, arcade and planted central courtyard. Fixed-step crowd movement uses clearance-aware A* routes, stationary-coworker avoidance, acceleration, disc contacts, obstacle sliding and reserved break spots. Furniture bounds and navigation come from the same floor plan.
- Persistent state/emotion bubbles, desk monitor activity, attention lamps, doorway status lights, transition rings, completion confetti, footsteps and explicit handoff trails. Poke/snack/cheer produce short gestures and speech bubbles. Sound feedback is opt-in.
- **50 verticals × 20 prop recipes = 1,000 generated GLB assets**, with SVG previews and one downloadable ZIP per vertical. Open **Make it yours** to search all props, inspect a rotating 3D model, apply a project theme, or add/remove individual props. Each room has twelve display spots; designs persist in localStorage on this device.
- Provider-aware project/session/subagent hierarchy with aggregated work, attention, idle, completion and stale-signal states. Attention counts remain visible alongside concurrently running work.
- Poke, snack, and cheer reactions. These are visual interactions and do not send prompts or influence the real agent.
- Local hook normalization, bounded disk outbox, automatic next-hook retries, manual flush/optional retry watcher, authenticated pairing diagnostics, WebSocket snapshots, and persistence.
- Generated Codex and Claude plugin folders and zip downloads, using a shared dependency-free Node observer.
- GitHub/GitLab social login via Better Auth and Cloudflare D1, cross-device office ownership, explicit linking of both providers, per-computer connection keys, sign-out and account deletion. Existing offices can be attached with their original owner key.
- A Cloudflare Worker with one SQLite-backed Durable Object per office, hibernatable WebSockets, stored state, rate limits, legacy key compatibility and office deletion.

- A motion-rich public homepage with an interactive miniature, signup and a separate demo route.
- Owner-local office clocks with automatic gradual day/night lighting and daylight-saving support. Neighbors keep their own room clock and lighting. Manual day/night preview is temporary.
- Explicit delegation/return/message events trigger character acknowledgement and handoff trails. Idle pairs can meet; busy characters keep working. Background break chatter is cosmetic and labeled separately. Public visits do not expose private collaboration history.

## Verify

```sh
npm run verify
npm audit
```

Tests cover duplicate and out-of-order delivery, overlapping tools, provider/session isolation, parent relationships, stale observations, room expansion, privacy allowlisting, credential separation, cross-office access, actual HTTP ingestion, and WebSocket delivery. Simulation tests verify non-overlapping rooms, every seat's reachable routes, obstacle clearance, crowd contacts, reserved destinations, return-to-work, frame-rate independence and expansion continuity. Integration tests create isolated temporary data under `.local/`.

Asset checks cover all 1,000 recipes, finite geometry, outward winding, greedy face merging, exported GLB metadata, and real Three.js loading of a model from every vertical. The recipe source is `shared/verticals.mjs`; geometry is authored in `shared/voxel-models.mjs` and `shared/voxel-specialties.mjs`. Run `npm run assets:build` after changing either. Generated assets are in `public/models`, previews in `public/model-previews`, and packs in `public/packs`.

The kit is procedural and reuses construction families across verticals; it is not 1,000 individually hand-sculpted models. Themes are suggested from the display name and can be overridden. No private source-code analysis is performed. Props occupy storage displays and feature plinths; free-form furniture placement is future work. Walking, feelings and gestures are cosmetic interpretations of observed state, not claims about unobserved agent activity. Motion uses floor-plane crowd physics, not a general-purpose rigid-body engine.

## Deploy on Cloudflare

The live app is deployed by GitHub Actions on pushes to main. See [operations](docs/operations.md) for configuration and limits. For a separate self-hosted deployment, choose a Worker name and authenticate to your own Cloudflare account:

```sh
npx wrangler login
# Create your own D1 database, set its ID/base URL in wrangler.jsonc,
# and configure signing/provider secrets as described in docs/sso-setup.md.
npm run deploy
```

Once either OAuth provider is configured, registration uses social sign-in. The legacy anonymous-signup API is disabled automatically. While provider setup is pending, existing recovery access and the demo remain available. Legacy offices retain their separate ingest, viewer and recovery keys. Viewer cookies are HttpOnly, SameSite=Strict, and Secure on the hosted Worker. WebSockets use the viewer cookie rather than exposing a secret in their URL. Configure the connection file from the hosted app, not the local demo URL. No third-party model API key is required.

To exercise the real Worker locally:

```sh
npm run build
npx wrangler d1 migrations apply AUTH_DB --local
npx wrangler dev --port 8788
```

Then open its printed URL. This runs the same Durable Object implementation as deployment.

## Plugin configuration

Both plugins read `~/.sidequest/config.json`, or the file named by `SIDEQUEST_CONFIG`. A downloaded connection file supplies endpoint, office ID, and ingest key. Per-project overrides allow explicit project grouping and atmosphere:

```json
{
  "endpoint": "https://YOUR-WORKER.workers.dev/api/events",
  "officeId": "GENERATED-OFFICE-ID",
  "ingestKey": "GENERATED-INGEST-KEY",
  "projects": {
    "/absolute/path/to/repo": {
      "projectId": "my-stable-project",
      "projectName": "Orbit",
      "theme": "studio",
      "taskLabel": "Build the dashboard"
    }
  }
}
```

Use forward slashes for Windows paths. Assign matching `projectId` values to worktrees or machines that should share a room. Themes are `studio`, `lab`, and `garden`. Without an override, a normalized Git origin is hashed; non-Git folders use their real local path. The folder basename remains the default visible name. Names and explicit task labels are shared metadata. Raw prompts, code, command arguments, transcripts, and tool outputs are never forwarded.

Edit `bridge/` and `scripts/build-plugins.mjs`, then run `npm run plugins:build`; generated plugin copies should not be edited directly.

## Current limits

This is a public beta distributed through this repository's plugin marketplaces. Live integration is exercised with hook-shaped fixtures through real transport; full event coverage still depends on the installed coding client and its hook settings.

- Codex hooks require explicit trust. Both clients can install from this repository's marketplaces; this is not a public-directory listing. Local execution is the supported initial scope. Cloud-orchestrated sessions cannot use this local command-hook observer.
- The mirror shows only observed events. It does not discover every pre-existing session or read transcripts. Some tool paths are not hook-visible. A silent agent becomes “Away” with its last observation after five minutes; this is uncertainty, not proof that the process exited.
- `Stop` means a turn ended, not that all requested work succeeded. `PostToolUse` means a tool returned, not that tests passed. Task labels are explicit local configuration in this version.
- Root-session parentage is used when a subagent event lacks an explicit parent ID. Fine-grained nested parentage and subagent tool attribution depend on host payload coverage. The observer does not fabricate them.
- The outbox holds 256 normalized events and flushes up to 20 on each subsequent hook. Run `node bridge/office.mjs flush` to retry manually, or `node bridge/office.mjs watch` for retries while its terminal stays open. There is no automatically installed background service or agent heartbeat.
- The office retains 160 agent records, 80 activity entries, and 1,024 recent event IDs. Larger organizations need virtualization, lifecycle archival, and stronger long-term event deduplication.
- Offices use keys instead of email accounts. Recovery, key replacement and deletion are available. Device-specific keys, stronger abuse controls and large-scale load testing remain future work. Monitor Cloudflare usage as the service grows.
- Room mood is configured, not inferred by uploading private project content. Idle movement is an illustration and does not imply a physical task or hidden model thought.
- No real agent control, approvals, prompt replies, terminal streaming, token usage, or cost estimates are implemented. The inspector offers visibility and harmless reactions.

See [the product and architecture plan](docs/product-plan.md) for the next milestones and verified source links.
