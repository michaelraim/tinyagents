import {describe,it,expect} from 'vitest';
import {createDemo,growDemo} from '../src/demo';
import {applyEvent,projectsOf,eventSchema} from '../shared/protocol';
import {officePlan} from '../shared/layout';
import {Navigation} from '../shared/simulation';
import {officeClock,clockSettingsSchema} from '../shared/clock';
import {resolveConversation,ConversationInbox} from '../shared/collaboration';
import {normalizeHook} from '../bridge/normalize.mjs';

describe('generated campus',()=>{
  it('has exactly one entrance marker per project',()=>{
    const plan=officePlan(projectsOf(createDemo()));
    expect(plan.rooms.filter(r=>r.first).map(r=>r.projectId)).toEqual(['orbit','infra','bloom']);
  });
  it('changes the actual footprint when projects, sessions and subagents arrive',()=>{
    let office=createDemo();let before=officePlan(projectsOf(office));
    for(const kind of ['project','session','agent','agent','agent','agent','agent'] as const){
      office=growDemo(office,kind);const next=officePlan(projectsOf(office));
      expect(next.rooms.flatMap(r=>r.seats)).toHaveLength(office.agents.length);
      if(kind!=='agent')expect(next.rooms.length).toBeGreaterThan(before.rooms.length);
      const nav=new Navigation(next);
      for(const r of next.rooms)for(const seat of r.seats)expect(nav.path(seat,next.destinations[0]).length,`${kind}: ${seat.agent.name}`).toBeGreaterThan(0);
      for(let i=0;i<next.floors.length;i++)for(let j=i+1;j<next.floors.length;j++){const a=next.floors[i],b=next.floors[j];expect(Math.abs(a.x-b.x)>=(a.w+b.w)/2-.01||Math.abs(a.z-b.z)>=(a.d+b.d)/2-.01).toBe(true);}
      before=next;
    }
  });
  it('is deterministic and reserves no empty project rooms',()=>{
    const empty=officePlan([]);expect(empty.rooms).toEqual([]);
    const small=createDemo();small.agents=small.agents.slice(0,1);
    const first=officePlan(projectsOf(small));expect(first).toEqual(officePlan(projectsOf(small)));expect(first.rooms).toHaveLength(1);
    expect(first.bounds.w*first.bounds.d).toBeLessThan(officePlan(projectsOf(createDemo())).bounds.w*officePlan(projectsOf(createDemo())).bounds.d);
  });
});
describe('owner local time',()=>{
  it('uses the office zone and observes daylight-saving changes',()=>{
    expect(officeClock('America/New_York',Date.parse('2026-03-08T06:59:00Z')).time).toBe('01:59');
    expect(officeClock('America/New_York',Date.parse('2026-03-08T07:00:00Z')).time).toBe('03:00');
    const at=Date.parse('2026-10-08T10:00:00Z');
    expect(officeClock('Asia/Jerusalem',at).daylight).toBe(1);expect(officeClock('America/Los_Angeles',at).daylight).toBe(0);
    expect(clockSettingsSchema.safeParse({timeZone:'not/a-zone'}).success).toBe(false);
  });
  it('registers a legacy office once without letting another harness move its clock',()=>{
    const demo=createDemo(),event={...demo.events[0],id:'clock-1',timeZone:'Asia/Tokyo'};
    const registered=applyEvent(demo,event);expect(registered.timeZone).toBe('Asia/Tokyo');
    expect(applyEvent(registered,{...event,id:'clock-2',timeZone:'Europe/London'}).timeZone).toBe('Asia/Tokyo');
  });
});
describe('observed collaboration',()=>{
  it('links explicit delegation and returns without transmitting conversation text',()=>{
    const raw={session_id:'session',agent_id:'child',cwd:'/private/repo',hook_event_name:'SubagentStart',prompt:'PRIVATE_PROMPT'};
    const parent=eventSchema.parse(normalizeHook({...raw,agent_id:undefined,hook_event_name:'SessionStart'},'codex'));
    const child=eventSchema.parse(normalizeHook(raw,'codex'));
    const office=applyEvent(applyEvent({agents:[],events:[],seen:[],revision:0},parent),child);
    const talk=resolveConversation(child,office.agents)!;expect(talk.from).toBe(office.agents[0].key);expect(talk.to).toBe(office.agents[1].key);
    expect(JSON.stringify(child)).not.toMatch(/PRIVATE_PROMPT|private\/repo/);
    const returned=eventSchema.parse(normalizeHook({...raw,hook_event_name:'SubagentStop'},'codex'));
    expect(resolveConversation(returned,office.agents)?.from).toBe(office.agents[1].key);
  });
  it('does not infer messages, replay a snapshot, or resolve an ambiguous recipient',()=>{
    const office=createDemo(),sender=office.agents[0],target=office.agents[6],now=Date.now();
    const event={...sender,id:'message',at:now,collaboration:{kind:'message' as const,targetAgentId:target.agentId}};
    expect(resolveConversation({...event,collaboration:undefined},office.agents)).toBeUndefined();
    expect(resolveConversation(event,office.agents)?.to).toBe(target.key);
    expect(resolveConversation(event,[...office.agents,{...target,key:'ambiguous',sessionId:'other'}])).toBeUndefined();
    const inbox=new ConversationInbox();expect(inbox.take([event],office.agents,now)).toEqual([]);expect(inbox.take([event],office.agents,now)).toEqual([]);
    expect(inbox.take([{...event,id:'new-message'},event],office.agents,now)).toHaveLength(1);
    expect(inbox.take([{...event,id:'old-message',at:now-9000},event],office.agents,now)).toEqual([]);
  });
});
