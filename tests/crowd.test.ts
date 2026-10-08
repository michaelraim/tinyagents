import { describe, expect, it } from 'vitest';
import { planBuilding } from '../shared/building';
import { projectsOf, type Agent } from '../shared/protocol';
import { World, type Body } from '../src/world/sim';

const now = Date.now();
const mk = (i: number, project: string, state: Agent['state'], ago = 0): Agent => ({
  id: `e${i}`, provider: 'claude', sessionId: `s${i}`, agentId: 'main', state, at: now - ago,
  project: { id: project, name: project }, name: `A${i}`, key: `claude:s${i}:main`, joinedAt: now, toolMarks: {}, tools: {},
} as unknown as Agent);

/** Runs the world and returns the longest time any walker went without getting closer to where it was going. */
function stall(world: World, seconds: number, clock: { t: number }) {
  const dt = 1 / 30;
  const best = new Map<string, { left: number; since: number; goal: string }>();
  let worst = 0;
  const left = (b: Body) => b.path.reduce((n, p, i) => n + Math.hypot(p.x - (i ? b.path[i - 1].x : b.x), p.z - (i ? b.path[i - 1].z : b.z)), 0);
  for (let s = 0; s < seconds * 30; s++) {
    clock.t += dt * 1000;
    world.update(dt, clock.t);
    for (const b of world.bodies.values()) {
      if (b.phase !== 'walking') { best.delete(b.key); continue; }
      const goal = `${b.goal.kind}:${b.path.length ? `${b.path[b.path.length - 1].x},${b.path[b.path.length - 1].z}` : ''}`;
      const l = left(b), prev = best.get(b.key);
      if (!prev || prev.goal !== goal || l < prev.left - 0.05) best.set(b.key, { left: l, since: clock.t, goal });
      else worst = Math.max(worst, (clock.t - prev.since) / 1000);
    }
  }
  return worst;
}

describe('crowds', () => {
  it('never gets stuck in doorways, even when everyone moves at once', () => {
    let agents = [...Array.from({ length: 43 }, (_, i) => mk(i, 'p1', i % 3 ? 'idle' : 'coding')), ...Array.from({ length: 14 }, (_, i) => mk(100 + i, 'p2', 'idle'))];
    const world = new World(planBuilding(projectsOf({ agents, events: [], seen: [], revision: 0 })));
    const clock = { t: 0 };
    world.sync(agents, now);
    let worst = stall(world, 120, clock);
    world.gatherAtCafe(['pizza']);
    worst = Math.max(worst, stall(world, 90, clock));
    agents = agents.map(a => ({ ...a, state: 'offline' }));
    world.sync(agents, now);
    worst = Math.max(worst, stall(world, 90, clock));
    expect([...world.bodies.values()].filter(b => b.phase !== 'gone')).toHaveLength(0);
    agents = agents.map(a => ({ ...a, state: 'coding', at: now }));
    world.sync(agents, now);
    worst = Math.max(worst, stall(world, 90, clock));
    expect(worst).toBeLessThan(4);
    expect([...world.bodies.values()].filter(b => b.phase !== 'seated')).toHaveLength(0);
  });
});
