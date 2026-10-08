import { describe, expect, it } from 'vitest';
import { planBuilding, emptyMemory } from '../shared/building';
import { Navigation } from '../shared/simulation';
import { projectsOf, type OfficeState } from '../shared/protocol';
import { createDemo, growDemo } from '../src/demo';

function check(office: OfficeState) {
  const plan = planBuilding(projectsOf(office));
  const nav = new Navigation(plan);
  const unreachable = [
    ...plan.seats.map(s => ({ what: `seat ${s.agent.name}`, p: s })),
    ...plan.spots.map(s => ({ what: `spot ${s.id}`, p: s })),
  ].filter(({ p }) => !nav.path(plan.entrance, p).length);
  return { plan, unreachable };
}

describe('building layout', () => {
  it('reaches every desk and every hangout spot from the front door', () => {
    const { unreachable } = check(createDemo());
    expect(unreachable.map(u => u.what)).toEqual([]);
  });

  it('stays walkable as the office grows', () => {
    let office = createDemo();
    for (let i = 0; i < 6; i++) office = growDemo(office, i % 2 ? 'agent' : 'project');
    const { plan, unreachable } = check(office);
    expect(unreachable.map(u => u.what)).toEqual([]);
    expect(plan.seats).toHaveLength(office.agents.length);
  });

  it('gives each project one room and never overlaps rooms', () => {
    const { plan } = check(createDemo());
    const projects = plan.rooms.filter(r => r.kind === 'project');
    expect(projects).toHaveLength(3);
    for (const a of plan.rooms) for (const b of plan.rooms) {
      if (a === b) continue;
      const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.01;
      const overlapZ = Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.01;
      expect(overlapX && overlapZ, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  });

  it('keeps project colours stable when new projects arrive', () => {
    const memory = emptyMemory();
    const first = planBuilding(projectsOf(createDemo()), memory);
    const grown = planBuilding(projectsOf(growDemo(createDemo(), 'project')), memory);
    for (const room of first.rooms.filter(r => r.project)) {
      expect(grown.rooms.find(r => r.id === room.id)?.slot).toBe(room.slot);
    }
  });
});
