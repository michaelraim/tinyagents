import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, AgentState } from '../../shared/protocol';
import { applyGameEvent, buy, detectEvents, interact, loadGame, moodOfAgent, saveGame, tickMoods, upgrades, type GameEvent, type GameState, type Interaction, type UpgradeId } from './game';
import { floatText, shake } from './fx';
import { Occurrences } from './occurrences';
import { play, type Sfx } from './sfx';
import type { World } from './sim';

export type Toast = GameEvent & { shownAt: number };

const sound: Partial<Record<GameEvent['kind'], Sfx>> = {
  shipped: 'fanfare', reported: 'star', 'tests-green': 'star', squashed: 'coin', snag: 'snag', 'needs-you': 'ring',
  hired: 'pop', pizza: 'whoosh', birthday: 'fanfare', 'coffee-broken': 'zap', 'coffee-fixed': 'coin', cat: 'meow', flicker: 'zap', exhausted: 'snag',
};

/**
 * Runs the game layer for one office: turns real transitions into events, plays the
 * matching choreography in the world, keeps score and moods, and stages random
 * office life. Returns what the HUD needs.
 */
export function useGame(officeKey: string, agents: Agent[], world: World, daylight: number, now: number) {
  const [game, setGame] = useState<GameState>(() => loadGame(officeKey));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [log, setLog] = useState<GameEvent[]>([]);
  const previous = useRef(new Map<string, { state: AgentState; at: number }>());
  const first = useRef(true);
  const occurrences = useRef(new Occurrences());
  const exhaustedAt = useRef(new Map<string, number>());
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => { setGame(loadGame(officeKey)); first.current = true; previous.current.clear(); }, [officeKey]);
  useEffect(() => { saveGame(officeKey, game); }, [game, officeKey]);

  const emit = useCallback((event: GameEvent) => {
    setGame(g => applyGameEvent(g, event));
    setToasts(t => [{ ...event, shownAt: Date.now() }, ...t.filter(x => Date.now() - x.shownAt < 7000)].slice(0, 3));
    setLog(l => [event, ...l].slice(0, 60));
    const s = sound[event.kind];
    if (s) play(s);
    const body = event.agentKey ? world.bodies.get(event.agentKey) : undefined;
    if (body) {
      if (event.stars) floatText(`+${event.stars} ⭐`, body.x, body.z, '#ffd23f');
      else if (event.coins) floatText(`+${event.coins} 🪙`, body.x, body.z, '#b6ff3b');
    }
    // Choreography: the world reacts to real events.
    if (event.kind === 'snag' && event.agentKey) { world.rally(event.agentKey); shake(300); }
    if (event.kind === 'reported' && event.agentKey && event.otherKey) world.report(event.agentKey, event.otherKey);
    if (event.kind === 'shipped' && event.agentKey) {
      for (const b of world.bodies.values()) if (b !== body && !b.npc && body && Math.hypot(b.x - body.x, b.z - body.z) < 5 && Math.random() < 0.6) world.say(b, ['👏', 'nice!', '🎉', 'legend', 'gg'][Math.floor(Math.random() * 5)], performance.now(), 'emote');
    }
  }, [world]);

  // Real transitions → events.
  useEffect(() => {
    const events = detectEvents(previous.current, agents, Date.now(), first.current);
    first.current = false;
    previous.current = new Map(agents.map(a => [a.key, { state: a.state, at: a.at }]));
    events.forEach((e, i) => setTimeout(() => emit(e), i * 350));
  }, [agents, emit]);

  // Once a second: moods drift, exhaustion alerts, random office life.
  useEffect(() => {
    setGame(g => tickMoods(g, agentsRef.current, Date.now(), 1));
    for (const agent of agentsRef.current) {
      const m = moodOfAgent(game, agent.key);
      const last = exhaustedAt.current.get(agent.key) ?? 0;
      if (m.energy < 18 && ['coding', 'thinking', 'reading', 'testing'].includes(agent.state) && Date.now() - last > 30 * 60_000) {
        exhaustedAt.current.set(agent.key, Date.now());
        const minutes = m.workingSince ? Math.round((Date.now() - m.workingSince) / 60_000) : 0;
        emit({ id: `tired-${agent.key}-${Date.now()}`, kind: 'exhausted', at: Date.now(), agentKey: agent.key, icon: '🥱', tone: 'alert',
          title: `${agent.name} is running on fumes`, detail: minutes ? `Coding for ${minutes} min straight. A break would help.` : 'They could use a break.' });
      }
    }
    occurrences.current.tick({ world, agents: agentsRef.current, daylight, emit });
  }, [now]);

  const gameRef = useRef(game);
  gameRef.current = game;
  /** Spend coins on a little interaction; false when the office can't afford it. */
  const act = useCallback((key: string, kind: Interaction) => {
    const next = interact(gameRef.current, key, kind);
    if (!next) return false;
    gameRef.current = next;
    setGame(next);
    return true;
  }, []);

  /** Buy an office upgrade; false when the office can't afford it. */
  const purchase = useCallback((id: UpgradeId) => {
    const next = buy(gameRef.current, id);
    if (!next) return false;
    gameRef.current = next;
    setGame(next);
    const item = upgrades.find(u => u.id === id)!;
    const event: GameEvent = { id: `buy-${id}-${Date.now()}`, kind: 'gift', at: Date.now(), icon: item.icon, title: `New in the office: ${item.name}!`, detail: item.detail, tone: 'good' };
    setToasts(t => [{ ...event, shownAt: Date.now() }, ...t].slice(0, 3));
    setLog(l => [event, ...l].slice(0, 60));
    play('fanfare');
    return true;
  }, []);

  const trigger = useCallback((kind: string) => occurrences.current.trigger(kind, { world, agents: agentsRef.current, daylight, emit }), [world, daylight, emit]);
  const dismiss = useCallback((id: string) => setToasts(t => t.filter(x => x.id !== id)), []);
  return { game, toasts, log, act, purchase, trigger, dismiss };
}
