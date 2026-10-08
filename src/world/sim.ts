import { Navigation } from '../../shared/simulation';
import type { Building, Point, Seat, Spot, SpotKind } from '../../shared/building';
import type { Agent, AgentState } from '../../shared/protocol';

/**
 * The life layer. Observed agent state decides *what kind* of thing a person does
 * (work, ask for help, take a break, leave). This file decides *how*: where they
 * walk, which spot they visit, how long they stay. It never changes agent state.
 */

export type Mood = 'work' | 'ask' | 'stuck' | 'celebrate' | 'break' | 'doze' | 'leave';
export type Action =
  | 'type' | 'think' | 'read' | 'test' | 'wave' | 'stuck' | 'doze' | 'celebrate' | 'relax'
  | 'coffee' | 'sip' | 'lounge' | 'play-pong' | 'play-arcade' | 'chat' | 'pace' | 'gaze' | 'phone' | 'walk' | 'idle';

export type Bubble = { text: string; at: number; tone: 'say' | 'emote' | 'alert' };

export type Body = Point & {
  key: string;
  angle: number;
  speed: number;
  /** Where the body is in its routine. */
  phase: 'seated' | 'walking' | 'at-spot' | 'gone';
  mood: Mood;
  action: Action;
  seat: Seat;
  path: Point[];
  goal: { kind: 'seat' } | { kind: 'spot'; spot: Spot } | { kind: 'exit' }
    | { kind: 'point'; x: number; z: number; facing: number; action: Action; meet?: string };
  /** Something carried in both hands: a new hire's box, a pizza, a report for the lead. */
  carry?: 'box' | 'pizza' | 'report';
  /** Not an agent: a courier or other visitor. */
  npc?: boolean;
  /** Seconds in the current phase. */
  timer: number;
  /** Seconds a walker has been held up by others. */
  blocked: number;
  /** When the current errand should end. */
  dwell: number;
  /** Seconds since the mood last changed. */
  moodAge: number;
  bubble?: Bubble;
  /** Visual-only reaction triggered by the viewer. */
  reaction?: { kind: 'poke' | 'snack' | 'highfive' | 'cheer'; at: number };
  /** Stable per-person randomness. */
  seed: number;
  /** For arrival fade-in and departure fade-out. */
  visible: number;
  state: AgentState;
};

const WALK_SPEED = 2.1;
const STALE_AFTER = 5 * 60_000;
const GO_HOME_AFTER = 30 * 60_000;

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * How a person behaves, from the observed agent:
 * - "Needs you" never times out: an unanswered prompt is still unanswered.
 * - A long-running tool (a build, a test suite) keeps them busy for up to 30 minutes.
 * - Otherwise five minutes of silence means we've lost the signal: they doze off.
 * - Half an hour without a word (idle, finished, or a session that died mid-task):
 *   they go home, and walk back in when work resumes.
 */
export function moodOf(agent: Agent, now: number): Mood {
  const quiet = now - agent.at;
  const busyTool = Object.keys(agent.tools ?? {}).length > 0;
  const silent = quiet > (busyTool ? 6 * STALE_AFTER : STALE_AFTER);
  if (agent.state === 'offline' || (agent.state !== 'waiting' && quiet > Math.max(GO_HOME_AFTER, busyTool ? 6 * STALE_AFTER : 0))) return 'leave';
  switch (agent.state) {
    case 'idle': return 'break';
    case 'done': return quiet < 6000 ? 'celebrate' : 'break';
    case 'waiting': return 'ask';
    case 'blocked': return silent ? 'doze' : 'stuck';
    default: return silent ? 'doze' : 'work';
  }
}

/** Long enough to walk out of the front door from the far end of the building. */
const WALK_OUT = 3 * 60_000;
/**
 * Whether an agent still has a desk in the office: anyone who hasn't gone home, plus
 * those who left in the last few minutes (so they can walk out). Rooms are sized
 * for these people only, not for every session the office has seen today.
 */
export function onSite(agent: Agent, now: number) {
  if (moodOf(agent, now) !== 'leave') return true;
  const left = agent.state === 'offline' ? agent.at : agent.at + GO_HOME_AFTER;
  return now - left < WALK_OUT;
}

const workAction: Partial<Record<AgentState, Action>> = { coding: 'type', thinking: 'think', reading: 'read', testing: 'test' };

const lines: Record<string, string[]> = {
  coding: ['on it!', 'typing…', 'let\'s go', 'ok ok ok', 'building ⚒️'],
  thinking: ['hmm…', '🤔', 'wait…', 'what if…', 'thinking…'],
  reading: ['let me look', '👀', 'reading…', 'interesting', 'where is it…'],
  testing: ['🤞', 'run it!', 'please pass', 'testing…', 'moment of truth'],
  waiting: ['psst! 👋', 'need you!', 'can I?', 'approve? 🙏', 'hello? ✋'],
  blocked: ['ugh 😤', 'nope.', 'why?!', 'hmm, broken', '🫠'],
  done: ['shipped! 🎉', 'done ✨', 'nailed it', 'yesss', 'ta-da!'],
  idle: ['☕ break', 'stretch…', 'snack time', 'brb', '🙂'],
  offline: ['bye! 👋', 'see ya', 'logging off'],
  arrive: ['hi team!', 'reporting in', 'hello 👋', 'what\'s up'],
};
const chatter = ['😂', '☕?', '🐛!', 'lgtm', 'ship it', '🍕', 'nice', 'brb', '🔥', 'tabs or spaces?', 'it works on my machine', '🙌', 'merge it!', 'one more test…'];

export function pick<T>(list: T[], seed: number) { return list[Math.floor(seed * list.length) % list.length]; }

const breakSpots: { kind: SpotKind; weight: number; action: Action; dwell: [number, number] }[] = [
  { kind: 'coffee', weight: 3, action: 'coffee', dwell: [6, 10] },
  { kind: 'cafe-seat', weight: 3, action: 'sip', dwell: [18, 35] },
  { kind: 'sofa', weight: 3, action: 'lounge', dwell: [20, 40] },
  { kind: 'pingpong', weight: 2, action: 'play-pong', dwell: [20, 35] },
  { kind: 'arcade', weight: 2, action: 'play-arcade', dwell: [15, 30] },
  { kind: 'window', weight: 1, action: 'gaze', dwell: [10, 20] },
  { kind: 'cooler', weight: 1, action: 'chat', dwell: [10, 18] },
];

export class World {
  bodies = new Map<string, Body>();
  private nav!: Navigation;
  private building!: Building;
  private claimed = new Map<string, string>(); // spot id -> body key
  private random = Math.random;
  private started = false;
  /** Spot kinds temporarily out of order (a broken coffee machine). */
  closed = new Set<SpotKind>();

  constructor(building: Building) { this.setBuilding(building); }

  setBuilding(building: Building) {
    this.building = building;
    this.nav = new Navigation(building);
    for (const body of this.bodies.values()) {
      const seat = building.seats.find(s => s.agent.key === body.key);
      if (seat) body.seat = seat;
      // If the floor plan moved under someone, put them back at their desk.
      if (!this.walkable(body)) this.sitDown(body);
      else if (body.phase === 'walking') this.go(body, body.goal);
      if (body.phase === 'seated') Object.assign(body, { x: body.seat.x, z: body.seat.z, angle: body.seat.facing });
      if (body.goal.kind === 'spot') {
        const spotId = body.goal.spot.id;
        const spot = building.spots.find(s => s.id === spotId);
        if (!spot) { this.release(body); this.go(body, { kind: 'seat' }); }
        else body.goal = { kind: 'spot', spot };
      }
    }
  }

  /** Bring bodies in line with the observed agents. */
  sync(agents: Agent[], now: number) {
    const present = new Set<string>();
    for (const agent of agents) {
      const seat = this.building.seats.find(s => s.agent.key === agent.key);
      if (!seat) continue;
      present.add(agent.key);
      let body = this.bodies.get(agent.key);
      const mood = moodOf(agent, now);
      if (!body) {
        body = this.spawn(agent, seat, mood);
        this.bodies.set(agent.key, body);
        continue;
      }
      body.seat = seat;
      if (body.state !== agent.state) {
        body.state = agent.state;
        // Bubbles live on the animation clock, not the office's wall clock.
        this.say(body, pick(lines[agent.state] ?? ['…'], this.random()), performance.now(), agent.state === 'waiting' ? 'alert' : 'say');
      }
      if (body.mood !== mood) this.changeMood(body, mood, now);
    }
    for (const [key, body] of this.bodies) if (!present.has(key) && !body.npc) { this.release(body); this.bodies.delete(key); }
    this.started = true;
  }

  private spawn(agent: Agent, seat: Seat, mood: Mood): Body {
    const seed = hash(agent.key);
    const body: Body = {
      key: agent.key, x: seat.x, z: seat.z, angle: seat.facing, speed: 0, phase: 'seated', mood, action: 'idle',
      seat, path: [], goal: { kind: 'seat' }, timer: 0, blocked: 0, dwell: 0, moodAge: 0, seed, visible: 1, state: agent.state,
    };
    if (mood === 'leave') { body.phase = 'gone'; body.visible = 0; return body; }
    if (this.started) {
      // Newcomers walk in through the front door; brand-new hires carry their things.
      const hired = Date.now() - agent.joinedAt < 2 * 60_000;
      Object.assign(body, { x: this.building.entrance.x, z: this.building.entrance.z, visible: 0, carry: hired ? 'box' : undefined });
      this.go(body, { kind: 'seat' });
      this.say(body, pick(lines.arrive, seed), performance.now(), 'say');
    }
    this.applyAction(body);
    return body;
  }

  private changeMood(body: Body, mood: Mood, now: number) {
    body.mood = mood;
    body.moodAge = 0;
    if (mood === 'leave') { this.release(body); this.go(body, { kind: 'exit' }); return; }
    if (body.phase === 'gone') {
      Object.assign(body, { x: this.building.entrance.x, z: this.building.entrance.z, visible: 0, phase: 'walking' });
      this.go(body, { kind: 'seat' });
      return;
    }
    if (mood === 'break') {
      // Finish the thought at the desk for a moment before wandering off.
      body.dwell = 2 + body.seed * 4;
      if (body.phase === 'seated') body.timer = 0;
      return;
    }
    // Any work-ish mood sends them back to the desk.
    if (body.phase !== 'seated' && !(body.goal.kind === 'seat' && body.phase === 'walking')) {
      this.release(body);
      this.go(body, { kind: 'seat' });
    }
    void now;
  }

  say(body: Body, text: string, now: number, tone: Bubble['tone'] = 'say') {
    body.bubble = { text, at: now, tone };
  }

  react(key: string, kind: NonNullable<Body['reaction']>['kind'], now: number) {
    const body = this.bodies.get(key);
    if (!body) return;
    body.reaction = { kind, at: now };
    const replies = {
      poke: ['hey!', 'huh?', '👀', 'what?', 'stop it 😆'],
      snack: ['yum! 🍪', 'thanks!! 😋', 'nom nom', '🥹 cookie'],
      highfive: ['✋ yeah!', 'up top!', 'teamwork 🙌'],
      cheer: ['😊', 'aww thanks', 'you rock', '💪'],
    } as const;
    this.say(body, pick([...replies[kind]], this.random()), now, 'emote');
  }

  /** Send someone to grab a coffee right now (viewer request, purely visual). */
  coffeeRun(key: string) {
    const body = this.bodies.get(key);
    if (!body || body.mood === 'leave' || body.phase === 'gone') return;
    const spot = this.freeSpot('coffee', body);
    if (spot) this.go(body, { kind: 'spot', spot }, 6);
  }

  private walkable(p: Point) {
    const cx = Math.round((p.x - this.nav.origin.x) / this.nav.cell), cz = Math.round((p.z - this.nav.origin.z) / this.nav.cell);
    if (cx < 0 || cz < 0 || cx >= this.nav.width || cz >= this.nav.depth) return false;
    return this.nav.open[cz * this.nav.width + cx] === 1 || this.nav.clear(p);
  }

  private goalPoint(goal: Body['goal']): Point {
    return goal.kind === 'seat' ? { x: 0, z: 0 } : goal.kind === 'spot' ? goal.spot : goal.kind === 'point' ? goal : this.building.entrance;
  }

  private go(body: Body, goal: Body['goal'], dwell?: number) {
    const target = goal.kind === 'seat' ? body.seat : this.goalPoint(goal);
    if (goal.kind === 'spot') this.claimed.set(goal.spot.id, body.key);
    body.goal = goal;
    body.phase = 'walking';
    body.timer = 0;
    if (dwell !== undefined) body.dwell = dwell;
    const path = this.nav.path(body, target);
    // If routing fails (for example the person is standing inside furniture after a
    // re-plan), walk straight there; better a small clip than a frozen person.
    body.path = path.length ? path : [{ x: target.x, z: target.z }];
  }

  private release(body: Body) {
    for (const [spot, key] of this.claimed) if (key === body.key) this.claimed.delete(spot);
  }

  private sitDown(body: Body) {
    this.release(body);
    Object.assign(body, { x: body.seat.x, z: body.seat.z, angle: body.seat.facing, phase: 'seated', path: [], goal: { kind: 'seat' }, timer: 0 });
  }

  private freeSpot(kind: SpotKind, body: Body): Spot | undefined {
    if (this.closed.has(kind)) return undefined;
    const free = this.building.spots.filter(s => s.kind === kind && !this.claimed.has(s.id));
    if (!free.length) return undefined;
    free.sort((a, b) => distance(a, body) - distance(b, body));
    return free[Math.floor(this.random() * Math.min(2, free.length))];
  }

  private chooseBreak(body: Body) {
    const total = breakSpots.reduce((n, s) => n + s.weight, 0);
    let roll = this.random() * total;
    for (const option of [...breakSpots].sort(() => this.random() - 0.5)) {
      roll -= option.weight;
      if (roll > 0) continue;
      const spot = this.freeSpot(option.kind, body);
      if (!spot) continue;
      const [min, max] = option.dwell;
      this.go(body, { kind: 'spot', spot }, min + this.random() * (max - min));
      return true;
    }
    return false;
  }

  private applyAction(body: Body) {
    if (body.phase === 'walking') { body.action = 'walk'; return; }
    if (body.phase === 'at-spot' && body.goal.kind === 'point') { body.action = body.goal.action; return; }
    if (body.phase === 'at-spot' && body.goal.kind === 'spot') {
      const kind = body.goal.spot.kind;
      if (kind === 'whiteboard') { body.action = 'pace'; return; }
      body.action = breakSpots.find(s => s.kind === kind)?.action ?? 'idle';
      // Someone else nearby? Then it's a chat.
      if (['coffee', 'cooler', 'window'].includes(kind)) {
        const near = [...this.bodies.values()].some(b => b !== body && b.phase === 'at-spot' && distance(b, body) < 2.6);
        if (near) body.action = 'chat';
      }
      return;
    }
    switch (body.mood) {
      case 'work': body.action = workAction[body.state] ?? 'type'; break;
      case 'ask': body.action = 'wave'; break;
      case 'stuck': body.action = 'stuck'; break;
      case 'doze': body.action = 'doze'; break;
      case 'celebrate': body.action = 'celebrate'; break;
      // On a break at the desk: lean back from the screen, then scroll the phone.
      case 'break': body.action = body.timer > 20 ? 'phone' : 'relax'; break;
      default: body.action = 'idle';
    }
  }

  update(dt: number, now: number) {
    const bodies = [...this.bodies.values()];
    for (const body of bodies) {
      body.timer += dt;
      body.moodAge += dt;
      if (body.phase === 'gone') { if (body.npc) this.bodies.delete(body.key); continue; }
      body.visible = Math.min(1, body.visible + dt * 2);

      if (body.phase === 'walking') this.walk(body, dt, bodies);
      else body.speed = 0;

      if (body.phase === 'seated') {
        // Idle people eventually wander off; thinkers sometimes pace at the whiteboard.
        if (body.mood === 'break' && body.timer > body.dwell) {
          if (!this.chooseBreak(body)) body.timer = 0;
        } else if (body.mood === 'work' && body.state === 'thinking' && body.timer > 35 + body.seed * 40) {
          const spot = this.building.spots.find(s => s.kind === 'whiteboard' && s.roomId === body.seat.podId.split(':pod:')[0] && !this.claimed.has(s.id));
          if (spot) this.go(body, { kind: 'spot', spot }, 8 + this.random() * 6);
          else body.timer = 0;
        }
      } else if (body.phase === 'at-spot') {
        if (body.timer > body.dwell) {
          this.release(body);
          if (body.npc) { this.go(body, { kind: 'exit' }); continue; }
          if (body.goal.kind === 'point') { this.go(body, { kind: 'seat' }); continue; }
          // After a break: maybe one more stop, otherwise back to the desk.
          if (body.mood === 'break' && this.random() < 0.45 && this.chooseBreak(body)) { /* off again */ }
          else this.go(body, { kind: 'seat' });
        }
        // Occasional chatter between people hanging out together.
        if (body.mood === 'break' && this.random() < dt * 0.06) {
          const near = bodies.find(b => b !== body && b.phase === 'at-spot' && distance(b, body) < 3);
          if (near) this.say(body, pick(chatter, this.random()), now, 'say');
        }
      }
      this.applyAction(body);
      if (body.bubble && now - body.bubble.at > (body.bubble.tone === 'alert' ? 6000 : 3800)) body.bubble = undefined;
    }
  }

  private walk(body: Body, dt: number, bodies: Body[]) {
    const target = body.path[0];
    if (!target) return this.arrive(body);
    const dx = target.x - body.x, dz = target.z - body.z, len = Math.hypot(dx, dz);
    if (len < 0.08) {
      body.path.shift();
      if (!body.path.length) this.arrive(body);
      return;
    }
    const pace = (body.goal.kind === 'exit' ? 1.6 : WALK_SPEED) * (0.9 + body.seed * 0.25);
    const step = Math.min(len, pace * dt);
    let nx = body.x + (dx / len) * step, nz = body.z + (dz / len) * step;
    // Side-step around other walkers (never into walls). Only sideways: pushing back
    // along the path deadlocks two people meeting head-on in a doorway. Anyone held up
    // for a moment just squeezes past.
    if (body.blocked < 0.8 && len > 0.4) {
      const fx = dx / len, fz = dz / len;
      for (const other of bodies) {
        if (other === body || other.phase === 'gone' || other.phase === 'seated') continue;
        const ox = nx - other.x, oz = nz - other.z, d = Math.hypot(ox, oz);
        if (d >= 0.75) continue;
        const ahead = ox * fx + oz * fz;
        if (ahead > 0.05) continue; // they're behind us: their problem
        // Sidestep to whichever side they already lean towards (or a stable pick when dead on).
        const lean = ox * fz - oz * fx;
        const sign = Math.abs(lean) > 0.01 ? Math.sign(lean) : body.seed > 0.5 ? 1 : -1;
        const push = (0.75 - d) * 0.35 * Math.min(1, step / 0.02);
        const px = nx + fz * sign * push, pz = nz - fx * sign * push;
        if (this.walkable({ x: px, z: pz })) { nx = px; nz = pz; }
      }
    }
    const moved = Math.hypot(nx - body.x, nz - body.z);
    body.blocked = moved < step * 0.4 ? body.blocked + dt : Math.max(0, body.blocked - dt * 0.5);
    body.speed = moved / Math.max(dt, 1e-4);
    body.x = nx; body.z = nz;
    const heading = Math.atan2(dx, dz);
    body.angle += Math.atan2(Math.sin(heading - body.angle), Math.cos(heading - body.angle)) * (1 - Math.exp(-dt * 10));
  }

  private arrive(body: Body) {
    body.timer = 0;
    body.speed = 0;
    if (body.goal.kind === 'seat') {
      body.carry = undefined;
      this.sitDown(body);
      if (body.mood === 'break') body.dwell = 25 + body.seed * 30; // linger at the desk before the next errand
      return;
    }
    if (body.goal.kind === 'exit') { body.phase = 'gone'; body.visible = 0; return; }
    body.phase = 'at-spot';
    if (body.goal.kind === 'point') {
      const goal = body.goal;
      Object.assign(body, { x: goal.x, z: goal.z, angle: goal.facing });
      // Handing over a report ends with a high five.
      if (goal.meet) {
        const other = this.bodies.get(goal.meet);
        this.react(body.key, 'highfive', performance.now());
        if (other) this.react(other.key, 'highfive', performance.now());
        body.carry = undefined;
      }
      return;
    }
    body.x = body.goal.spot.x; body.z = body.goal.spot.z;
    body.angle = body.goal.spot.facing;
  }

  // ---------- Event choreography ----------

  private roomOf(body: Body) { return body.seat.podId.split(':pod:')[0]; }
  private free(body: Body) { return !body.npc && body.phase !== 'gone' && body.mood !== 'leave' && (body.mood === 'break' || body.phase === 'at-spot'); }
  get plan() { return this.building; }

  /** Send someone to stand at a point and do something there for a while. */
  visit(key: string, x: number, z: number, facing: number, action: Action, dwell: number, meet?: string) {
    const body = this.bodies.get(key);
    if (!body || body.phase === 'gone') return false;
    this.release(body);
    this.go(body, { kind: 'point', x, z, facing, action, meet }, dwell);
    return true;
  }

  /** Teammates on a break rush over to help someone who is stuck. */
  rally(key: string) {
    const stuck = this.bodies.get(key);
    if (!stuck) return [];
    const helpers = [...this.bodies.values()].filter(b => b !== stuck && this.free(b) && this.roomOf(b) === this.roomOf(stuck)).slice(0, 2);
    helpers.forEach((b, i) => {
      const side = i === 0 ? 1 : -1;
      const x = stuck.seat.x + side * 0.85, z = stuck.seat.z + Math.cos(stuck.seat.facing + Math.PI) * 0.35;
      this.visit(b.key, x, z, Math.atan2(stuck.seat.x - x, stuck.seat.z - z), 'chat', 12);
      this.say(b, pick(['on my way!', 'I got you 🛟', 'lemme see', 'rubber duck time 🦆'], this.random()), performance.now());
    });
    return helpers.map(b => b.key);
  }

  /** A subagent walks over to its lead, hands over the report, and they high-five. */
  report(subKey: string, leadKey: string) {
    const sub = this.bodies.get(subKey), lead = this.bodies.get(leadKey);
    if (!sub || !lead || sub.phase === 'gone') return;
    const x = lead.seat.x + 0.75, z = lead.seat.z;
    sub.carry = 'report';
    this.visit(subKey, x, z, Math.atan2(lead.seat.x - x, lead.seat.z - z), 'chat', 5, leadKey);
    this.say(sub, pick(['done! 📋', 'report ready', 'all yours, boss'], this.random()), performance.now());
  }

  /** Everyone on a break heads to the café (pizza, birthday cake). */
  gatherAtCafe(say: string[]) {
    const cafe = this.building.rooms.find(r => r.kind === 'cafe');
    if (!cafe) return 0;
    const seats = this.building.spots.filter(s => s.roomId === cafe.id && (s.kind === 'cafe-seat' || s.kind === 'coffee' || s.kind === 'window'));
    let n = 0;
    for (const b of this.bodies.values()) {
      if (!this.free(b) || n >= seats.length) continue;
      const spot = seats[n++];
      this.release(b);
      this.go(b, { kind: 'spot', spot }, 20 + this.random() * 15);
      if (n <= 4) this.say(b, pick(say, this.random()), performance.now(), 'emote');
    }
    return n;
  }

  /** A visitor (pizza courier, delivery) walks in, stops somewhere, and leaves. */
  summon(key: string, x: number, z: number, facing: number, carry: Body['carry'], dwell = 5) {
    const e = this.building.entrance;
    const body: Body = {
      key, x: e.x, z: e.z, angle: Math.PI, speed: 0, phase: 'walking', mood: 'work', action: 'walk',
      seat: { x: e.x, z: e.z, facing: 0, desk: e, podId: 'npc:pod:0', agent: undefined as unknown as Agent },
      path: [], goal: { kind: 'seat' }, timer: 0, blocked: 0, dwell, moodAge: 0, seed: hash(key), visible: 0, state: 'coding', npc: true, carry,
    };
    this.bodies.set(key, body);
    this.go(body, { kind: 'point', x, z, facing, action: 'idle' }, dwell);
    return body;
  }
}
