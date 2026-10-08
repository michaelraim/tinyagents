import { describe, expect, it } from 'vitest';
import { createDemo } from '../src/demo';
import { applyEvent, projectsOf, type Agent } from '../shared/protocol';
import { officePlan } from '../shared/layout';
import { BODY_RADIUS, Navigation, OfficeSimulation } from '../shared/simulation';

describe('office floor plan and circulation',()=>{
  it('sizes suites around sessions and keeps all floor footprints disjoint',()=>{
    const plan=officePlan(projectsOf(createDemo()));
    expect(new Set(plan.rooms.map(r=>r.w)).size).toBeGreaterThan(1);
    expect(new Set(plan.rooms.map(r=>r.d)).size).toBe(2);
    expect(plan.rooms.filter(r=>r.projectId==='orbit')).toHaveLength(3);
    for(let i=0;i<plan.floors.length;i++)for(let j=i+1;j<plan.floors.length;j++){
      const a=plan.floors[i],b=plan.floors[j];
      expect(Math.abs(a.x-b.x)>= (a.w+b.w)/2-.01 || Math.abs(a.z-b.z)>=(a.d+b.d)/2-.01).toBe(true);
    }
  });
  it('connects every workstation to every break spot through actual doorways',()=>{
    const plan=officePlan(projectsOf(createDemo())),nav=new Navigation(plan);
    for(const room of plan.rooms)for(const seat of room.seats)for(const destination of plan.destinations){
      expect(nav.clear(seat),seat.agent.name+' home').toBe(true);
      const path=nav.path(seat,destination);
      expect(path.length,seat.agent.name+' path').toBeGreaterThan(0);
      let previous=seat;
      for(const p of path){expect(nav.line(previous,p),seat.agent.name+' segment').toBe(true);previous={...seat,...p};}
    }
  },15000);
  it('routes around furniture and rejects sealed destinations',()=>{
    const floor={x:0,z:0,w:12,d:12};
    const nav=new Navigation({bounds:floor,floors:[floor],obstacles:[{x:0,z:0,w:3,d:7}]});
    const path=nav.path({x:-4,z:0},{x:4,z:0});
    expect(path.length).toBeGreaterThan(1);
    expect(path.some(p=>Math.abs(p.z)>3.5+BODY_RADIUS)).toBe(true);
    expect(nav.path({x:-4,z:0},{x:0,z:0})).toEqual([]);
  });
  it('routes around a seated coworker as well as static furniture',()=>{
    const floor={x:0,z:0,w:12,d:10},nav=new Navigation({bounds:floor,floors:[floor],obstacles:[]}),occupant={x:0,z:0};
    const start={x:-4,z:0},path=nav.path(start,{x:4,z:0},[occupant]);
    expect(path.length).toBeGreaterThan(1);
    let before=start;
    for(const end of path){for(let i=0;i<=40;i++){const p={x:before.x+(end.x-before.x)*i/40,z:before.z+(end.z-before.z)*i/40};expect(Math.hypot(p.x,p.z)).toBeGreaterThan(BODY_RADIUS*2);}before=end;}
  });
});

describe('fixed-step crowd simulation',()=>{
  it('keeps people inside walkable space and returns them when work resumes',()=>{
    const office=createDemo(),plan=officePlan(projectsOf(office)),sim=new OfficeSimulation(plan),now=Date.now();
    const agents=office.agents.map(a=>({...a,state:'idle' as const,at:now}));sim.sync(agents,now);
    const reached=new Set<string>(); let minimumContact=Infinity;
    for(let frame=0;frame<60*100;frame++){
      sim.advance(1/60);
      if(frame%60===0)for(const b of sim.bodies.values()){
        expect(sim.nav.clear(b),b.key+' left walkable floor').toBe(true);
        if(b.phase==='break')reached.add(b.key);
      }
      if(frame%5===0){const bodies=[...sim.bodies.values()];for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)minimumContact=Math.min(minimumContact,Math.hypot(bodies[i].x-bodies[j].x,bodies[i].z-bodies[j].z));}
    }
    expect(reached.size).toBeGreaterThanOrEqual(4);
    expect(minimumContact).toBeGreaterThan(BODY_RADIUS*2-.035);
    sim.sync(agents.map(a=>({...a,state:'coding'} as Agent)),now+100000);
    for(let frame=0;frame<60*100;frame++)sim.advance(1/60);
    for(const b of sim.bodies.values()){
      expect(b.phase,JSON.stringify({key:b.key,x:b.x,z:b.z,home:{x:b.home.x,z:b.home.z},path:b.path,vx:b.vx,vz:b.vz})).toBe('desk');
      expect(Math.hypot(b.x-b.home.x,b.z-b.home.z)).toBeLessThan(.2);
    }
  },20000);
  it('is independent of display frame rate and reserves distinct destinations',()=>{
    const office=createDemo(),plan=officePlan(projectsOf(office)),a=new OfficeSimulation(plan),b=new OfficeSimulation(plan),now=Date.now();
    const agents=office.agents.map(x=>({...x,state:'idle' as const,at:now}));a.sync(agents,now);b.sync(agents,now);
    for(let i=0;i<1200;i++)a.advance(1/60);
    for(let i=0;i<600;i++)b.advance(1/30);
    for(const [key,body] of a.bodies){expect(body.x).toBeCloseTo(b.bodies.get(key)!.x,5);expect(body.z).toBeCloseTo(b.bodies.get(key)!.z,5);}
    const destinations=[...a.bodies.values()].filter(x=>x.target!=='home').map(x=>x.target);
    expect(new Set(destinations).size).toBe(destinations.length);
  });
  it('preserves existing people when a new subagent expands a team',()=>{
    const office=createDemo(),now=Date.now(),first=new OfficeSimulation(officePlan(projectsOf(office)));
    first.sync(office.agents,now);for(let i=0;i<600;i++)first.advance(1/60);
    const chip=office.agents.find(a=>a.agentId==='chip')!,before=first.bodies.get(chip.key)!;
    const expanded=applyEvent(office,{...office.agents[0],id:'new-arrival',agentId:'rae',name:'Rae',parentAgentId:'milo',at:now+1000});
    const next=new OfficeSimulation(officePlan(projectsOf(expanded)),first);next.sync(expanded.agents,now+1000);
    expect(next.bodies.size).toBe(first.bodies.size+1);
    expect(next.bodies.get(chip.key)!.x).toBeCloseTo(before.x,5);expect(next.bodies.get(chip.key)!.z).toBeCloseTo(before.z,5);
    for(const b of next.bodies.values())expect(next.nav.clear(b.home)).toBe(true);
  });
});
