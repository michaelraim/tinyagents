import { z } from 'zod';
import type { Agent, AgentState, OfficeEvent, OfficeState } from './protocol.ts';

/**
 * The tycoon layer. Everything here is derived from real, observed transitions
 * (a turn finishing, tests going green, an agent getting stuck) and turned into
 * game feedback: events, stars, coins, daily goals and moods. It never changes
 * what an agent is doing; it only decides how the office celebrates or worries.
 */

export type GameEventKind =
  | 'shipped' | 'tests-green' | 'snag' | 'squashed' | 'needs-you' | 'hired' | 'reported' | 'left' | 'exhausted' | 'back'
  | 'pizza' | 'cat' | 'coffee-broken' | 'coffee-fixed' | 'birthday' | 'rain' | 'flicker' | 'duck' | 'gift';

export type GameEvent = {
  id: string; kind: GameEventKind; at: number; agentKey?: string; otherKey?: string;
  title: string; detail?: string; icon: string; stars?: number; coins?: number;
  tone: 'good' | 'bad' | 'alert' | 'fun' | 'info';
  /** Cosmetic events are clearly labelled as office life, not real work. */
  cosmetic?: boolean;
};

export type Mood = { energy: number; happiness: number; workingSince?: number };

export type GameState = {
  stars: number; coins: number;
  day: string;
  today: { shipped: number; squashed: number; testsGreen: number; coffees: number; snacks: number };
  affinity: Record<string, number>;
  moods: Record<string, Mood>;
  /** Office upgrades bought with coins. */
  unlocked: UpgradeId[];
};

/** Things to spend coins on. Each one visibly changes the office. */
export const upgrades = [
  { id: 'plants', icon: '🌿', name: 'Jungle pack', price: 40, detail: 'Hanging plants and big pots everywhere.' },
  { id: 'neon', icon: '🌈', name: 'Rainbow neon', price: 60, detail: 'Every neon strip slowly cycles colours.' },
  { id: 'espresso', icon: '☕', name: 'Espresso Pro', price: 80, detail: 'A golden espresso machine. Coffee breaks recharge twice as fast.' },
  { id: 'aquarium', icon: '🐠', name: 'Lobby aquarium', price: 90, detail: 'A glowing fish tank greets visitors.' },
  { id: 'disco', icon: '🪩', name: 'Disco ball', price: 120, detail: 'The lounge gets a mirror ball and party lights at night.' },
  { id: 'dog', icon: '🐶', name: 'Office dog', price: 150, detail: 'A very good boy who wanders around all day.' },
  { id: 'rooftop', icon: '🛰️', name: 'Rooftop dish', price: 200, detail: 'A giant blinking satellite dish on the lobby roof.' },
] as const;
export type UpgradeId = typeof upgrades[number]['id'];

export function buy(game: GameState, id: UpgradeId): GameState | null {
  const item = upgrades.find(u => u.id === id);
  if (!item || game.unlocked.includes(id) || game.coins < item.price) return null;
  return { ...game, coins: game.coins - item.price, unlocked: [...game.unlocked, id] };
}

const WORKING: AgentState[] = ['coding', 'thinking', 'reading', 'testing'];
const isWorking = (s?: AgentState) => !!s && WORKING.includes(s);
/** The calendar day in the office's own time zone; daily goals reset at its midnight. */
export function dayKey(now: number, timeZone?: string) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)); }
  catch { return new Date(now).toISOString().slice(0, 10); }
}
const today = (now: number) => dayKey(now);

export function emptyGame(now = Date.now()): GameState {
  return { stars: 0, coins: 120, day: today(now), today: { shipped: 0, squashed: 0, testsGreen: 0, coffees: 0, snacks: 0 }, affinity: {}, moods: {}, unlocked: [] };
}

const short = (text?: string, n = 46) => !text ? '' : text.length > n ? `${text.slice(0, n - 1)}…` : text;

/**
 * Compare two snapshots of the office and describe what happened, in game terms.
 * `previous` maps agent key to its last seen state.
 */
export function detectEvents(previous: Map<string, { state: AgentState; at: number }>, agents: Agent[], now: number, first: boolean): GameEvent[] {
  if (first) return [];
  const events: GameEvent[] = [];
  for (const agent of agents) {
    const before = previous.get(agent.key);
    const id = `${agent.key}:${agent.at}:${agent.state}`;
    const name = agent.name;
    if (!before) {
      if (agent.parentAgentId) {
        const lead = agents.find(a => a.agentId === agent.parentAgentId && a.sessionId === agent.sessionId && a.provider === agent.provider);
        events.push({ id, kind: 'hired', at: now, agentKey: agent.key, otherKey: lead?.key, icon: '📦', tone: 'good', coins: 5,
          title: `New hire! ${name} joined ${lead ? `${lead.name}'s team` : 'the team'}`, detail: short(agent.task) });
      } else if (agent.state !== 'offline') {
        events.push({ id, kind: 'back', at: now, agentKey: agent.key, icon: '👋', tone: 'info', title: `${name} clocked in`, detail: short(agent.task) });
      }
      continue;
    }
    if (before.state === agent.state) continue;
    const s = agent.state;
    if (s === 'done') {
      if (agent.parentAgentId) {
        const lead = agents.find(a => a.agentId === agent.parentAgentId && a.sessionId === agent.sessionId && a.provider === agent.provider);
        events.push({ id, kind: 'reported', at: now, agentKey: agent.key, otherKey: lead?.key, icon: '📋', tone: 'good', stars: 2, coins: 4,
          title: `${name} reported back${lead ? ` to ${lead.name}` : ''}`, detail: short(agent.task) });
      } else {
        events.push({ id, kind: 'shipped', at: now, agentKey: agent.key, icon: '🚀', tone: 'good', stars: 3, coins: 6,
          title: `${name} shipped it!`, detail: short(agent.task) });
      }
    }
    if (before.state === 'testing' && s !== 'blocked' && s !== 'testing') {
      events.push({ id: id + ':tests', kind: 'tests-green', at: now, agentKey: agent.key, icon: '✅', tone: 'good', stars: 2, coins: 3, title: `Tests green for ${name}`, detail: short(agent.task) });
    }
    if (s === 'blocked') events.push({ id, kind: 'snag', at: now, agentKey: agent.key, icon: '🚨', tone: 'bad', title: `${name} hit a snag`, detail: short(agent.activity) });
    if (before.state === 'blocked' && isWorking(s)) events.push({ id: id + ':fix', kind: 'squashed', at: now, agentKey: agent.key, icon: '🐛', tone: 'good', stars: 1, coins: 2, title: `${name} squashed the bug`, detail: short(agent.task) });
    if (s === 'waiting') events.push({ id, kind: 'needs-you', at: now, agentKey: agent.key, icon: '📞', tone: 'alert', title: `${name} needs you`, detail: short(agent.activity) });
    if (s === 'offline') events.push({ id, kind: 'left', at: now, agentKey: agent.key, icon: '🌙', tone: 'info', title: `${name} signed off`, detail: short(agent.task) });
  }
  return events;
}

/** How an event lifts or dents the agent's mood (cosmetic, kept in the browser). */
export function applyMoodEvent(game: GameState, event: GameEvent): GameState {
  if (!event.agentKey) return game;
  const m = { ...(game.moods[event.agentKey] ?? { energy: 80, happiness: 70 }) };
  if (['shipped', 'reported', 'tests-green', 'squashed'].includes(event.kind)) m.happiness = Math.min(100, m.happiness + 12);
  if (event.kind === 'snag') m.happiness = Math.max(0, m.happiness - 15);
  return { ...game, moods: { ...game.moods, [event.agentKey]: m } };
}

/** Fold an event into the economy and the day's tallies. */
export function applyGameEvent(game: GameState, event: GameEvent): GameState {
  const t = { ...game.today };
  if (event.kind === 'shipped' || event.kind === 'reported') t.shipped++;
  if (event.kind === 'squashed') t.squashed++;
  if (event.kind === 'tests-green') t.testsGreen++;
  return { ...applyMoodEvent(game, event), stars: game.stars + (event.stars ?? 0), coins: game.coins + (event.coins ?? 0), today: t };
}

/**
 * Moods drift with real work: long stretches drain energy, waiting on you makes them
 * impatient, breaks recharge. Called about once a second.
 */
export function tickMoods(game: GameState, agents: Agent[], now: number, dtSeconds: number): GameState {
  const moods = { ...game.moods };
  for (const agent of agents) {
    const m = { ...(moods[agent.key] ?? { energy: 85, happiness: 72 }) };
    const minutes = dtSeconds / 60;
    if (isWorking(agent.state)) {
      m.workingSince ??= now;
      m.energy = Math.max(0, m.energy - minutes * 1.6);
    } else {
      m.workingSince = undefined;
      if (agent.state === 'idle' || agent.state === 'done') m.energy = Math.min(100, m.energy + minutes * 6);
    }
    if (agent.state === 'waiting') m.happiness = Math.max(0, m.happiness - minutes * 4);
    else if (agent.state !== 'blocked') m.happiness += (70 - m.happiness) * Math.min(1, minutes * 0.05);
    moods[agent.key] = m;
  }
  return { ...game, moods };
}

export function moodOfAgent(game: GameState, key: string): Mood { return game.moods[key] ?? { energy: 85, happiness: 72 }; }

export function moodEmoji(m: Mood) {
  if (m.energy < 25) return '🥱';
  if (m.happiness > 85) return '🤩';
  if (m.happiness > 65) return '😊';
  if (m.happiness > 40) return '😐';
  return '😣';
}

/** The viewer's little interactions cost coins and build affinity. */
export const interactionCost = { poke: 0, snack: 5, highfive: 0, cheer: 2, coffee: 3 } as const;
export type Interaction = keyof typeof interactionCost;
export function interact(game: GameState, key: string, kind: Interaction): GameState | null {
  const cost = interactionCost[kind];
  if (game.coins < cost) return null;
  const m = { ...moodOfAgent(game, key) };
  if (kind === 'snack') { m.energy = Math.min(100, m.energy + 20); m.happiness = Math.min(100, m.happiness + 8); }
  if (kind === 'coffee') m.energy = Math.min(100, m.energy + (game.unlocked.includes('espresso') ? 60 : 30));
  if (kind === 'cheer' || kind === 'highfive') m.happiness = Math.min(100, m.happiness + 10);
  if (kind === 'poke') m.happiness = Math.max(0, m.happiness - 1);
  const t = { ...game.today };
  if (kind === 'coffee') t.coffees++;
  if (kind === 'snack') t.snacks++;
  return { ...game, coins: game.coins - cost, today: t, moods: { ...game.moods, [key]: m },
    affinity: { ...game.affinity, [key]: (game.affinity[key] ?? 0) + (kind === 'poke' ? 0 : 1) } };
}

export type Goal = { label: string; value: number; target: number };
export function dailyGoals(game: GameState, agents: Agent[]): Goal[] {
  const moods = agents.map(a => moodOfAgent(game, a.key).happiness);
  const avg = moods.length ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) : 0;
  return [
    { label: 'Ship 5 tasks', value: game.today.shipped, target: 5 },
    { label: 'Turn tests green 3×', value: game.today.testsGreen, target: 3 },
    { label: 'Keep happiness 70+', value: avg, target: 70 },
  ];
}

/** Rank from today's stars, like a score screen. */
export function rankFor(stars: number) {
  const ranks: [number, string][] = [[60, 'S'], [35, 'A'], [18, 'B'], [8, 'C'], [0, 'D']];
  const index = ranks.findIndex(([min]) => stars >= min);
  const [min, letter] = ranks[index];
  const next = index > 0 ? ranks[index - 1][0] : min + 40;
  return { letter, progress: Math.min(1, (stars - min) / Math.max(1, next - min)) };
}

// ---------- Server-side settlement ----------

/** Start a new day's tallies when the office's calendar day changes. */
export function rollDay(game: GameState, day: string): GameState {
  return game.day === day ? game : { ...game, day, today: { shipped: 0, squashed: 0, testsGreen: 0, coffees: 0, snacks: 0 } };
}

/** The part of the game the office stores: everything except the cosmetic moods. */
export function economy(game: GameState): GameState {
  return { ...game, moods: {} };
}

/**
 * Apply a batch of observed events to the office and pay out for what happened.
 * Runs on the server, so every viewer sees the same score and nothing is counted twice.
 */
export function settleEvents(game: GameState, office: OfficeState, events: OfficeEvent[], apply: (office: OfficeState, event: OfficeEvent) => OfficeState, now = Date.now()) {
  let next = rollDay(game, dayKey(now, office.timeZone));
  const earned: GameEvent[] = [];
  for (const event of events) {
    const before = new Map(office.agents.map(a => [a.key, { state: a.state, at: a.at }]));
    office = apply(office, event);
    const changed = office.agents.filter(a => before.get(a.key)?.state !== a.state || !before.has(a.key));
    for (const happened of detectEvents(before, changed, now, false)) {
      if (happened.cosmetic) continue;
      next = applyGameEvent(next, happened);
      earned.push(happened);
    }
  }
  return { office, game: economy(next), earned };
}

export const gameActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('buy'), id: z.enum(upgrades.map(u => u.id) as [UpgradeId, ...UpgradeId[]]) }).strict(),
  z.object({ action: z.literal('interact'), key: z.string().min(1).max(400), kind: z.enum(['poke', 'snack', 'highfive', 'cheer', 'coffee']) }).strict(),
]);
export type GameAction = z.infer<typeof gameActionSchema>;

/** A viewer's purchase or interaction, checked against what the office can afford. */
export function applyAction(game: GameState, action: GameAction, now = Date.now(), timeZone?: string): GameState | null {
  const current = rollDay(game, dayKey(now, timeZone));
  const next = action.action === 'buy' ? buy(current, action.id) : interact(current, action.key, action.kind);
  return next ? economy(next) : null;
}
