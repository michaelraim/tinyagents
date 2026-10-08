import { ChevronRight } from 'lucide-react';
import { sessionsOf, summarizeAgents, teamMeta, effectiveState, stateMeta, type Agent, type Project } from '../shared/protocol';

export default function TeamHierarchy({projects,query,now,onSelect,onFocus}:{projects:Project[];query:string;now:number;onSelect:(agent:Agent)=>void;onFocus:(id:string)=>void}) {
  return <div className="team-hierarchy">{projects.map(project=>{
    const summary=summarizeAgents(project.agents,now),sessions=sessionsOf(project),meta=teamMeta[summary.status];
    const matching=sessions.map(s=>({...s,agents:s.agents.filter(a=>`${a.name} ${a.activity} ${a.project.name} ${a.sessionId}`.toLowerCase().includes(query.toLowerCase()))})).filter(s=>s.agents.length);
    if(!matching.length)return null;
    return <article key={project.id} className="project-team"><button className="project-team-heading" onClick={()=>onFocus(project.id)}><span className="team-lamp" style={{background:meta.color}}/><span><strong>{project.name}</strong><small>{sessions.length} {sessions.length===1?'session':'sessions'} · {summary.total} agents · {summary.subagents} {summary.subagents===1?'subagent':'subagents'}</small></span><ChevronRight size={15}/></button>
      <div className="team-summary"><span style={{color:meta.color}}>{meta.label}</span><span>{summary.running} working{summary.attention?` · ${summary.attention} need input`:''}</span></div>
      {matching.map(session=>{const status=summarizeAgents(sessions.find(s=>s.key===session.key)!.agents,now);return <section key={session.key} className="session-team"><header><span>{session.provider==='codex'?'⌘ Codex':'✳ Claude'} · {session.name}<small className="session-code">Session {session.id.split(':').pop()?.slice(0,6)}{session.agents[0]?.instanceId?` · client ${session.agents[0].instanceId.slice(0,4)}`:''}</small></span><small style={{color:teamMeta[status.status].color}}>{teamMeta[status.status].label}</small></header><div className="coworker-list">{session.agents.map(a=><button key={a.key} className={a.parentAgentId?'is-subagent':''} onClick={()=>onSelect(a)}><span className={`tiny-portrait ${a.provider}`}>{a.name[0]}</span><div><strong>{a.parentAgentId?'↳ ':''}{a.name}{session.agents.some(b=>b.parentAgentId===a.agentId)?' ★':''}</strong><small>{session.agents.some(b=>b.parentAgentId===a.agentId)?'Team lead':a.parentAgentId?'Subagent':'Agent'} · {a.activity}</small></div><span className="coworker-state" title={stateMeta[effectiveState(a,now)].label}>{stateMeta[effectiveState(a,now)].emoji}</span></button>)}</div></section>;})}
    </article>;
  })}</div>;
}
