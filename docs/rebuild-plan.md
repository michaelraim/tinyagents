# tinyAGENTS: analysis and rebuild plan

Written 2026-10-08, after reviewing the Codex-built version (v0.6.x), the reference video and the full Codex conversation.

## Status

**Shipped in the rebuild** (all three phases):

| Area | What |
| --- | --- |
| Look | Neon night-shift brand (Silkscreen and Tiny5 pixel type, neon signs and strips, bloom), a lit city backdrop, and day/night on the office clock. |
| People and furniture | Kenney CC0 characters with pose layers; Kenney furniture batched per room. |
| Rooms | One room per project with spare desks, clutter and 50 topic themes, chosen per room. |
| Mirror | Task titles, file names, command verbs (opt-out), honest liveness, per-event acceptance, 24-hour pruning. |
| Game layer | Real-event choreography (helpers rush to a stuck teammate, reports handed to leads, new hires carrying boxes); moods and energy; coins, stars, score and rank; daily goals; a shop with seven upgrades; random office life; TV mode; sound; rank-up and counter juice. |
| HUD | Resource bar, the "needs you" pill with portraits, the alert card, left navigation, panels, toasts. |
| Homepage, dialogs and guides | Rebuilt or reskinned in the brand, with a new favicon and social card. |
| Performance | Furniture batching, throttled shadow updates, and a Fast graphics mode chosen automatically on slow machines. |
| Cleanup | The old renderer, voxel pipeline and 51 MB of generated assets are deleted. |

**Next ideas:**

- Sync game progress to the office, so it follows you across devices.
- Instanced characters, for offices with 100+ agents.
- Shared neighbourhood events: two offices' agents meeting in the café.

## What the product has to be

A mirror of your coding agents, run like a small simulation game. It should be fun enough that you leave it open on a second screen instead of watching the terminals. If you glance at it, you should know immediately:

- which projects are busy,
- who is working, who is stuck, and **who is waiting on me**,
- **what** each agent is working on right now.

Between those moments, the office stays alive: people stretch, grab coffee, chat and celebrate.

## What is wrong today

### 1. The world doesn't read as a game (the main problem)

| Reference video | Current build |
| --- | --- |
| Dark blueprint grid, so a bright building pops out of it | Sage-on-sage pastel; no figure and ground |
| One building: a corridor spine with rooms snug against it | Detached plots floating on a lawn, joined by paths |
| Saturated carpet per project (purple, teal, yellow, pink) | Washed-out floors; projects hard to tell apart |
| Dense furniture: bench desks, dual monitors, planters, sofas | Big empty floors with a few tiny desks |
| Chunky chibi people with big heads, readable from far away | Tiny voxel figures, about 10 px tall at overview zoom |
| Task cards above agents: name, status, timer, task, model | Generic canned text ("Working with tools") |
| Big project label beside each room: "Ralv · 5 open threads" | Small dark plaques |
| Soft ambient occlusion and soft shadows | Flat lighting, no AO |
| Almost no UI chrome | **21 floating panels** (10 always visible) covering the world |

### 2. It can't actually mirror what agents do

The hooks deliberately send no human-readable task information. `activity` is canned text picked by hook type, and `task` is a static config label. So the office can never show "Fixing the login redirect" or "Editing `auth.ts`", which is the core value.

### 3. Liveness bugs make the mirror lie

- Event timestamps are taken *after* slow git calls. A late `PostToolUse` can land after `Stop`, leaving an agent "thinking" forever.
- After 5 minutes of silence, everything shows "Away". That includes a permission prompt you haven't answered, and a long build.
- Pressing Esc in Claude Code fires no `Stop` hook, so the agent stays "coding".
- Finished or killed sessions never leave. They pile up until a 160-agent cap evicts the *oldest* agents, not the stale ones.
- One invalid event rejects its whole batch, and the outbox then stays stuck on it.

### 4. The code can't be iterated on

The code is hand-minified into dense one-line blocks: a 29 KB `OfficeScene.tsx`, a 24 KB `App.tsx`. Nothing is instanced or shared:

- every `Box` builds its own geometry and material,
- each agent costs about 65 draw calls,
- the whole scene re-renders every second.

### 5. Breadth over depth

There are 1,000 procedural props, SSO, friends, neighborhoods and office clocks, but the core loop (watch your agents, feel what they're doing) isn't polished.

## What we keep

The plumbing is basically sound:

- privacy-aware local normalization,
- the atomic outbox and detached delivery worker,
- repository-based project identity,
- the idempotent reducer with per-tool tracking,
- the Cloudflare Worker with one Durable Object per office, WebSocket snapshots, auth and pairing,
- the A* `Navigation` grid.

## The rebuild

### Phase 1: a world that feels like a game (in progress)

A new renderer in `src/world/`, written as readable, normally formatted code.

- **Building layout** (`shared/building.ts`):
  - A corridor spine. Project rooms attach on both sides, and amenity rooms (lobby, café, lounge) are placed along it.
  - Each **project is one room**, and each **session is a desk pod** inside it. The room grows with the team.
- **Chibi characters**, built from rounded geometry that is shared across all characters:
  - Big heads, with varied hair and skin.
  - **Shirt colour shows the harness**: Claude is terracotta, Codex is charcoal.
  - **Team leads** wear a headset and a gold star. **Subagents** are smaller "juniors" who sit next to their lead.
- **A behaviour layer**, mapping agent state to what you see:

  | Agent state | What it looks like |
  | --- | --- |
  | Coding | Types |
  | Thinking | Leans back, sometimes paces |
  | Testing | Watches the screen with fingers crossed |
  | Waiting for you | Stands up and waves, with a pulsing **!** |
  | Blocked | Head in hands, with a storm cloud |
  | Done | Celebrates with confetti, then goes for coffee |
  | Idle | Wanders: café, sofa, ping-pong, chatting |
  | Stale (no recent signal) | Dozes at the desk 💤 |
  | Session ended | Walks out through the lobby |
  | New subagent | Walks in from the lobby to a seat beside their lead |

- **Look**:
  - A dark blueprint grid with a bright building on it, and saturated project carpets.
  - Soft shadows plus N8AO ambient occlusion.
  - The day/night cycle follows local time, with lamps and monitor glow at night.
- **Readable information**:
  - Big ground labels per room.
  - A task card over each agent (name · status · timer · task · harness). It collapses to an emoji bubble when zoomed out.
- **Minimal HUD**: brand, a status strip ("7 working · 2 need you", where clicking jumps to who needs you), one inspector drawer and a small control cluster.
- **Interactions**: poke, snack, high-five and send-for-coffee, with emoji/short-word reactions.

### Phase 2: make the mirror honest

- **Task capture, default on, private office only**:
  - Send a short title (the first ~80 characters of the latest prompt) plus the current target (a file basename, or a command verb).
  - Never shown in public visitor views. One config switch turns it off.
- **Timing**: stamp `at` on hook arrival, and add a per-session sequence number.
- **Liveness**:
  - Keep "waiting" as waiting.
  - Long tools show "busy (quiet)", not away.
  - Idle and done age into "left".
  - A Durable Object alarm garbage-collects dead sessions.
  - A Claude interrupt is inferred from the next prompt.
- **Delivery**: the server accepts valid events individually, and the client drops poison events.

### Phase 3: bring everything onto the new world

- `/office`, `/demo` and public visits use the new renderer.
- Onboarding, friends and neighborhood are restyled for it.
- Old scene code is deleted.
