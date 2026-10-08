import { describe, expect, it } from 'vitest';
import { applyAction, applyGameEvent, buy, dailyGoals, detectEvents, emptyGame, interact, rankFor, settleEvents, tickMoods } from '../src/world/game';
import { applyEvent, emptyOffice, type OfficeEvent } from '../shared/protocol';
import { normalizeHook } from '../bridge/normalize.mjs';
import type { Agent, AgentState } from '../shared/protocol';

const agent = (key: string, state: AgentState, extra: Partial<Agent> = {}) => ({
  key, name: key.toUpperCase(), state, at: Date.now(), provider: 'claude', sessionId: 's', agentId: key, project: { id: 'p', name: 'P', theme: 'studio' },
  activity: 'doing things', task: 'A task', tools: {}, toolMarks: {}, joinedAt: 0, version: 1, id: key, phase: 'state', ...extra,
}) as unknown as Agent;
const seen = (...pairs: [string, AgentState][]) => new Map(pairs.map(([k, s]) => [k, { state: s, at: 0 }]));

describe('game events from real transitions', () => {
  it('stays quiet on the first snapshot', () => {
    expect(detectEvents(new Map(), [agent('a', 'coding')], Date.now(), true)).toEqual([]);
  });
  it('celebrates shipping, green tests and squashed bugs', () => {
    const kinds = (prev: Map<string, { state: AgentState; at: number }>, now: Agent[]) => detectEvents(prev, now, Date.now(), false).map(e => e.kind);
    expect(kinds(seen(['a', 'coding']), [agent('a', 'done')])).toEqual(['shipped']);
    expect(kinds(seen(['a', 'testing']), [agent('a', 'thinking')])).toEqual(['tests-green']);
    expect(kinds(seen(['a', 'testing']), [agent('a', 'blocked')])).toEqual(['snag']);
    expect(kinds(seen(['a', 'blocked']), [agent('a', 'coding')])).toEqual(['squashed']);
    expect(kinds(seen(['a', 'coding']), [agent('a', 'waiting')])).toEqual(['needs-you']);
  });
  it('turns a finished subagent into a report to its lead, and a new one into a hire', () => {
    const lead = agent('lead', 'coding'), sub = agent('sub', 'done', { parentAgentId: 'lead' });
    const report = detectEvents(seen(['lead', 'coding'], ['sub', 'coding']), [lead, sub], Date.now(), false)[0];
    expect(report.kind).toBe('reported');
    expect(report.otherKey).toBe('lead');
    const hire = detectEvents(seen(['lead', 'coding']), [lead, agent('new', 'thinking', { parentAgentId: 'lead' })], Date.now(), false)[0];
    expect(hire.kind).toBe('hired');
  });
});

describe('economy and moods', () => {
  it('pays stars and coins and counts the day', () => {
    let g = emptyGame();
    g = applyGameEvent(g, { id: '1', kind: 'shipped', at: 0, icon: '', title: '', tone: 'good', stars: 3, coins: 6, agentKey: 'a' });
    expect(g.stars).toBe(3);
    expect(g.today.shipped).toBe(1);
    expect(dailyGoals(g, [])[0].value).toBe(1);
  });
  it('charges for snacks and refuses when broke', () => {
    const g = { ...emptyGame(), coins: 4 };
    expect(interact(g, 'a', 'snack')).toBeNull();
    const fed = interact({ ...g, coins: 10 }, 'a', 'snack')!;
    expect(fed.coins).toBe(5);
    expect(fed.affinity.a).toBe(1);
  });
  it('drains energy during long work and recovers on breaks', () => {
    let g = emptyGame();
    g = tickMoods(g, [agent('a', 'coding')], Date.now(), 1200);
    expect(g.moods.a.energy).toBeLessThan(60);
    const tired = g.moods.a.energy;
    g = tickMoods(g, [agent('a', 'idle')], Date.now(), 300);
    expect(g.moods.a.energy).toBeGreaterThan(tired);
  });
  it('sells each upgrade once and only when affordable', () => {
    const g = { ...emptyGame(), coins: 100 };
    expect(buy(g, 'disco')).toBeNull();
    const bought = buy(g, 'plants')!;
    expect(bought.coins).toBe(60);
    expect(bought.unlocked).toEqual(['plants']);
    expect(buy(bought, 'plants')).toBeNull();
  });
  it('makes espresso twice as reviving once bought', () => {
    const plain = interact({ ...emptyGame(), moods: { a: { energy: 10, happiness: 50 } } }, 'a', 'coffee')!;
    const pro = interact({ ...emptyGame(), unlocked: ['espresso'], moods: { a: { energy: 10, happiness: 50 } } }, 'a', 'coffee')!;
    expect(pro.moods.a.energy - 10).toBe(2 * (plain.moods.a.energy - 10));
  });
  it('ranks by stars', () => {
    expect(rankFor(0).letter).toBe('D');
    expect(rankFor(40).letter).toBe('A');
  });
});

describe('server settlement', () => {
  const hook = (hook_event_name: string, at: number) => normalizeHook({ session_id: 's1', cwd: '/x/repo', hook_event_name }, 'claude', {}, at) as OfficeEvent;
  it('pays for each transition inside one batch, and strips moods', () => {
    const now = Date.now();
    const { game, earned } = settleEvents(emptyGame(), emptyOffice(), [hook('UserPromptSubmit', now), hook('Stop', now + 1)], applyEvent, now);
    expect(earned.map(e => e.kind)).toContain('shipped');
    expect(game.stars).toBe(3);
    expect(game.moods).toEqual({});
  });
  it('resets the daily tallies at the office midnight', () => {
    const old = { ...emptyGame(), day: '2001-01-01', today: { shipped: 9, squashed: 0, testsGreen: 0, coffees: 0, snacks: 0 } };
    expect(applyAction({ ...old, coins: 50 }, { action: 'buy', id: 'plants' })!.today.shipped).toBe(0);
  });
});
