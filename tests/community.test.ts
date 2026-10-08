import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, sep, join } from 'node:path';
import { canonicalRemote, resolveProject } from '../bridge/project.mjs';
import { normalizeHook } from '../bridge/normalize.mjs';
import { createDemo } from '../src/demo';
import { agentKey, agentRole, projectsOf, sessionsOf, eventSchema } from '../shared/protocol';
import { privateSharing, publicOffice, shareSchema } from '../shared/public-office';
import { neighborhood, publicLinkId } from '../shared/neighborhood';
import { planBuilding } from '../shared/building';
import { World } from '../src/world/sim';

describe('public office boundaries',()=>{
  it('projects only approved fields, including when new private fields exist',()=>{
    const office=createDemo(); office.agents[0].task='PRIVATE_TASK'; office.agents[0].tool='PRIVATE_TOOL';
    const view=publicOffice(office,{...privateSharing(),enabled:true});
    const text=JSON.stringify(view);
    expect(text).not.toMatch(/PRIVATE_TASK|PRIVATE_TOOL|Polish the Orbit|Orbit web/);
    expect(view.office.events).toEqual([]);expect(view.office.seen).toEqual([]);
    expect(view.office.agents[0].project.name).toBe('Project 01');
    expect(publicOffice(office,{...privateSharing(),enabled:true,projectNames:true}).office.agents[0].project.name).toBe('Orbit web');
    expect(shareSchema.safeParse({...privateSharing(),ownerKey:'secret'}).success).toBe(false);
  });
  it('keeps neighbor identities and hierarchy distinct from matching local IDs',()=>{
    const office=createDemo(), view=publicOffice(office,{...privateSharing(),enabled:true,name:'Neighbor'});
    const combined=neighborhood(office,[{id:'other-office',view}]);
    expect(new Set(combined.agents.map(a=>a.key)).size).toBe(office.agents.length*2);
    expect(projectsOf(combined)).toHaveLength(6);
    const child=combined.agents.find(a=>a.visitingOfficeId&&a.parentAgentId)!;
    expect(combined.agents.some(a=>a.visitingOfficeId&&a.agentId===child.parentAgentId)).toBe(true);
    expect(agentRole(combined.agents.find(a=>a.visitingOfficeId&&a.agentId===child.parentAgentId)!,combined.agents)).toBe('Team lead');
  });
  it('accepts only public visitor links on this deployment',()=>{
    const id='12345678-1234-4123-8123-123456789abc';
    expect(publicLinkId(`https://office.test/?visit=${id}`,'https://office.test')).toBe(id);
    for(const link of [`https://evil.test/?visit=${id}`,`https://user:secret@office.test/?visit=${id}`,'https://office.test/?visit=bad'])expect(()=>publicLinkId(link,'https://office.test')).toThrow();
  });
});
describe('repository and harness identity',()=>{
  it('canonicalizes SSH and HTTPS without carrying credentials or query strings',()=>{
    expect(canonicalRemote('git@github.com:Team/App.git')).toBe(canonicalRemote('https://user:secret@github.com/team/app.git?token=private'));
    expect(canonicalRemote('file:///secret/repo')).toBeNull();
  });
  it('groups two harnesses, subdirectories and clones of one repo but separates unrelated repositories',async()=>{
    await mkdir('.local',{recursive:true});const directory=await mkdtemp(resolve('.local/identity-'));
    try{
      const folders=['a','b','c'].map(name=>join(directory,name));
      for(const [i,folder] of folders.entries()){
        await mkdir(join(folder,'src'),{recursive:true});execFileSync('git',['init',folder],{stdio:'ignore',windowsHide:true});
        execFileSync('git',['-C',folder,'remote','add','origin',i===0?'git@github.com:Team/App.git':i===1?'https://github.com/team/app.git':'https://github.com/team/different.git'],{stdio:'ignore',windowsHide:true});
      }
      const event=(folder:string,provider:string)=>eventSchema.parse(normalizeHook({cwd:folder,session_id:'same-session',hook_event_name:'SessionStart'},provider,resolveProject(folder,{})));
      const a=event(folders[0],'codex'),child=event(join(folders[0],'src'),'claude'),b=event(folders[1],'codex'),c=event(folders[2],'codex');
      expect(a.project.id).toBe(child.project.id);expect(a.project.id).toBe(b.project.id);expect(a.project.id).not.toBe(c.project.id);
      expect(a.project.identity).toBe('repository');expect(JSON.stringify(a)).not.toContain(directory);expect(JSON.stringify(a)).not.toContain('github.com');
      expect(agentKey(a)).not.toBe(agentKey(child));expect(agentKey({...a,instanceId:'another-client'})).not.toBe(agentKey(a));
      expect(sessionsOf({...a.project,agents:[{...createDemo().agents[0],...a,key:agentKey(a)},{...createDemo().agents[0],...child,key:agentKey(child)}]})).toHaveLength(2);
    }finally{if(resolve(directory).startsWith(resolve('.local')+sep+'identity-'))await rm(directory,{recursive:true,force:true});}
  },15000);
});
describe('social motion',()=>{
  it('invites only resting characters to hangouts and sends them back to their desks when work returns',()=>{
    const office=createDemo(),plan=planBuilding(projectsOf(office)),world=new World(plan),now=Date.now();
    world.sync(office.agents,now);world.sync(office.agents,now);
    const idle=office.agents.filter(a=>a.state==='idle');
    for(const a of idle){const b=world.bodies.get(a.key)!;b.timer=0;}
    const invited=world.gatherAtCafe(['pizza']);
    expect(invited).toBe(idle.length);
    for(const a of office.agents.filter(a=>a.state==='coding'))expect(world.bodies.get(a.key)!.goal.kind).toBe('seat');
    world.sync(office.agents.map(a=>idle.some(b=>b.key===a.key)?{...a,state:'coding',at:now+100}:a),now+100);
    for(const a of idle)expect(world.bodies.get(a.key)!.goal.kind).toBe('seat');
  });
});
