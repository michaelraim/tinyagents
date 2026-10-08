import { expect, it } from 'vitest';
import { createDemo, growDemo } from '../src/demo';
import { projectsOf, applyEvent } from '../shared/protocol';
import { officePlan } from '../shared/layout';
import { Navigation, OfficeSimulation } from '../shared/simulation';

it('keeps occupied rooms, desks and shared areas in place through incremental arrivals', () => {
  let office = createDemo(), plan = officePlan(projectsOf(office));
  for (const kind of ['project','session','agent','agent','agent','agent'] as const) {
    const before = plan;
    office = growDemo(office, kind);
    plan = officePlan(projectsOf(office), before);
    for (const room of before.rooms) {
      const next = plan.rooms.find(r => r.id === room.id)!;
      expect([next.x,next.z,next.w,next.d]).toEqual([room.x,room.z,room.w,room.d]);
      for (const seat of room.seats) {
        const assigned = plan.rooms.flatMap(r => r.seats).find(s => s.agent.key === seat.agent.key)!;
        expect([assigned.x,assigned.z,assigned.facing]).toEqual([seat.x,seat.z,seat.facing]);
      }
    }
    expect(plan.hall).toEqual(before.hall);
    const nav = new Navigation(plan);
    for (const room of plan.rooms) for (const seat of room.seats) expect(nav.path(seat,plan.destinations[0]).length).toBeGreaterThan(0);
    for (let i=0;i<plan.floors.length;i++) for (let j=i+1;j<plan.floors.length;j++) {
      const a=plan.floors[i],b=plan.floors[j];
      expect(Math.abs(a.x-b.x)>=(a.w+b.w)/2-.01||Math.abs(a.z-b.z)>=(a.d+b.d)/2-.01).toBe(true);
    }
  }
}, 20000);

it('does not turn seated coworkers into walkers when an unrelated room arrives', () => {
  const office=createDemo(), now=Date.now(), plan=officePlan(projectsOf(office));
  const first=new OfficeSimulation(plan);first.sync(office.agents,now);
  const grown=growDemo(office,'project'), next=new OfficeSimulation(officePlan(projectsOf(grown),plan),first);
  for(const [key,body] of first.bodies) expect(next.bodies.get(key)?.phase).toBe(body.phase);
});

it('keeps agents with identical arrival times in their original order on updates', () => {
  const fixture=createDemo().agents[0], at=Date.now();
  let office={agents:[],events:[],seen:[],revision:0} as ReturnType<typeof createDemo>;
  office=applyEvent(office,{...fixture,id:'first',agentId:'a',at});
  office=applyEvent(office,{...fixture,id:'second',agentId:'b',at});
  const order=office.agents.map(a=>a.key);
  office=applyEvent(office,{...fixture,id:'update',agentId:'a',at:at+1});
  expect(office.agents.map(a=>a.key)).toEqual(order);
});
