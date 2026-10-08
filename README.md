# tinyAGENTS

Small people. Big ideas. A tiny neon office for your coding agents.

tinyAGENTS turns your Codex and Claude Code agents into characters in a living 3D office. Each project gets a room, each agent a desk. What you see mirrors what your agents are really doing: typing, thinking, getting stuck, waiting for you, celebrating. Around that sits a light management-sim layer: events, moods, coins, an upgrade shop and random office life.

**[Homepage](https://tinyagents.michael-325.workers.dev)** · **[Demo](https://tinyagents.michael-325.workers.dev/demo)** · **[Open your office](https://tinyagents.michael-325.workers.dev/office)** · **[Connect your agents](https://tinyagents.michael-325.workers.dev/setup.html)** · **[Owner checklist](docs/launch-guide.md)**

Users sign in with GitHub or GitLab, and offices are private by default. Install a plugin, approve your computer in the browser and start coding. Cloudflare Workers serves the site and a SQLite Durable Object per office stores its state. Every push to `main` deploys after the Windows and Linux checks pass.

## Run it

Requires Node.js 22.18+.

```sh
npm ci
npm run plugins:build
npm run dev
```

Open **http://127.0.0.1:5187**:

| Path | What it is |
| --- | --- |
| `/` | The homepage, with the live demo office as its hero. |
| `/demo` | The playground: thirteen simulated agents. Open ⚙ to trigger events (pizza, birthday, broken coffee machine, cat, rain…) and to add projects or new hires. |
| `/office` | Your real office. |

Start the local bridge in a second terminal to try real hook events:

```sh
npm run bridge
```

## What's in it

**The world** (`src/world/`, layout in `shared/building.ts`)

- **Building**: one building in a neon city. A corridor runs down the middle with project rooms on both sides, plus a lobby, a café and a lounge.
  - Each project is one room with its own carpet colour and neon sign.
  - Each session is a desk pod. Rooms grow with their team and are fully furnished.
- **Themes**: each room's topic (the plugin's `vertical`, a guess from the project name, or a pick in the room panel) adds three signature props. There are 50 topics.
- **People**: Kenney CC0 *Mini Characters* (rigged, animated), with hand-tuned pose layers for typing, thinking, waving, despair, dozing and celebrating.
  - Lanyards show the harness: terracotta is Claude Code, white is Codex.
  - Team leads wear a gold headset. Subagents are smaller and sit beside their lead.
  - Each agent has a Sims-style status gem over its head.
- **Furniture**: Kenney CC0 *Furniture Kit*, merged into one batch per room at runtime (`Batched`) to keep draw calls low.
- **Look**: neon signs and strips, a lit city backdrop, and day/night that follows the office's own time zone. High-quality mode adds shadows, ambient occlusion and bloom; Fast mode drops them and is chosen automatically on slow machines.

**What you see is what they do**

| Real event | In the office |
| --- | --- |
| Editing, reading, testing | Typing, reading or watching tests, with a live task card ("Editing auth.ts") |
| Waiting for your approval | Stands and waves, phone rings, alert card with Jump to / Cheer up / Send break |
| A tool fails | Head in hands, the room's alarm beacon spins, teammates walk over to help |
| Tests pass, task finished | Confetti, stars and coins |
| Subagent starts | A new hire walks in carrying a box |
| Subagent finishes | Walks to the lead with a report and they high-five |
| Hours of nonstop work | Energy drains; "running on fumes" alert |
| No signal for 5 minutes | Dozes off |
| Idle for 30 minutes, or session ended | Walks out of the front door |

**The game layer** (`src/world/game.ts`, `useGame.ts`, `occurrences.ts`)

- **Economy**: stars, coins, a score and a rank, plus three daily goals. All of it is earned only from real events.
- **Moods**: each agent has energy and happiness, driven by real work and changed by your interactions (poke, snack, high-five, cheer, coffee). Interactions cost coins and build affinity hearts.
- **Shop**: spend coins on upgrades that visibly change the office: plants, rainbow neon, espresso machine, aquarium, disco ball, office dog, rooftop dish.
- **Office life**: random, clearly labelled cosmetic events. Pizza delivery, birthdays, a coffee machine that breaks until someone fixes it, rain, light flickers, a visiting cat, rubber-duck sessions.
- **TV mode**: the camera cuts to whatever is happening.
- **Sound**: optional synthesized effects (off by default).

Game progress is stored in the viewer's browser. Nothing in the game layer is ever sent to an agent.

**The mirror** (`bridge/`)

- Hooks send state plus, by default, a short task title from your prompt (or the task a lead handed a subagent), file *names* and command *verbs*. Code, paths, arguments, output and full prompts never leave the machine. `"shareTasks": false` turns titles off. Public views never include task details.
- **Liveness**:
  - "Needs you" never times out.
  - Long-running tools stay busy for up to 30 minutes.
  - The server forgets agents silent for 24 hours.
  - Events are timestamped when the hook fires, and the server accepts each valid event on its own.

**Plumbing**

- A local outbox with a detached retry worker, and diagnostics.
- Browser pairing, GitHub/GitLab sign-in, per-computer keys and public visitor links.
- One Durable Object per office, with WebSocket snapshots.
- Friends' public offices can join your building as coworking rooms.

## Verify

```sh
npm run verify
npm audit
```

The tests cover:

- **Delivery**: duplicates, out-of-order events, overlapping tools, provider and session isolation, stale observations and retries.
- **Privacy**: allowlisting, credential separation, cross-office access, and scrubbing of task titles and tool descriptions.
- **Liveness rules**.
- **Layout**: every desk and hangout spot reachable, rooms never overlapping, stable colours as the office grows.
- **Game logic**: events, economy, moods and the shop.
- **Integration**: real HTTP ingestion and WebSocket delivery.

## Deploy on Cloudflare

The live app deploys from GitHub Actions on pushes to `main`. See [operations](docs/operations.md). For your own deployment:

```sh
npx wrangler login
# Create your own D1 database, set its ID/base URL in wrangler.jsonc,
# and configure signing/provider secrets as described in docs/sso-setup.md.
npm run deploy
```

To run the real Worker locally:

```sh
npm run build
npx wrangler d1 migrations apply AUTH_DB --local
npx wrangler dev --port 8788
```

## Plugin configuration

Both plugins read `~/.sidequest/config.json`, or the file named by `SIDEQUEST_CONFIG`. The browser approval writes the endpoint, office ID and ingest key for you, and both harnesses share the file.

Optional settings:

```json
{
  "shareTasks": true,
  "projects": {
    "/absolute/path/to/repo": {
      "projectId": "my-stable-project",
      "projectName": "Orbit",
      "vertical": "games",
      "taskLabel": "Build the dashboard"
    }
  }
}
```

Use forward slashes for Windows paths. Give worktrees or machines the same `projectId` to share a room. Without one, a normalized Git origin is hashed; non-Git folders use their local path.

Edit `bridge/` and `scripts/build-plugins.mjs`, then run `npm run plugins:build`. Don't edit the generated plugin copies directly.

## Limits

- Codex hooks need explicit trust. Distribution is through this repository's plugin marketplaces. Cloud-orchestrated sessions can't run the local hook observer.
- The office shows observed events only. `Stop` means a turn ended, not that the work succeeded. A silent agent dozes after five minutes; that's uncertainty, not proof that it exited.
- Claude Code fires no hook when you press Esc. The agent returns to idle when its next idle notification arrives.
- An office keeps 160 agents and 80 activity entries.
- Game progress lives in each viewer's browser.

## Credits

- Characters and furniture: [Kenney](https://kenney.nl) (CC0).
- Fonts: Silkscreen, Tiny5 and Nunito Sans (SIL OFL).
- Everything else: original.

See [docs/rebuild-plan.md](docs/rebuild-plan.md) for the design rationale.
