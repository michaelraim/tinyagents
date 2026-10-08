import { X } from 'lucide-react';
import { sessionsOf, type Agent, type Project } from '../shared/protocol';
import { verticalById, suggestedVertical } from '../shared/verticals.mjs';
import type { RoomDesign } from './scene/OfficeScene';
import TeamHierarchy from './TeamHierarchy';

export default function ProjectPanel({ project, design, now, onClose, onSelect, onDesign, onDecorate, readOnly }: {
  project: Project; design?: RoomDesign; now: number; onClose: () => void; onSelect: (a: Agent) => void;
  onDesign: (description: string) => void; onDecorate: () => void; readOnly: boolean;
}) {
  const vertical = verticalById.get(design?.vertical ?? project.vertical ?? suggestedVertical(project.name)) ?? verticalById.get('software')!;
  return <section className="game-panel glass project-directory" aria-label="Project directory"><div className="panel-heading"><div><small>{project.agents[0]?.officeName || 'PROJECT DIRECTORY'}</small><h2>{project.name}</h2></div><button aria-label="Close project directory" onClick={onClose}><X size={18}/></button></div>
    <div className="project-summary"><span className="vertical-chip" style={{background:vertical.color}}>{vertical.icon} {vertical.name}</span><small>{design?.vertical || project.vertical ? 'Chosen room theme' : 'Suggested from the project name'}</small>
      <p>{design?.description || project.description || 'No project brief yet. Add a short description so visitors know what this team is building.'}</p>
      <div className="project-fingerprint">{project.identity === 'repository' ? 'Repository' : project.identity === 'manual' ? 'Shared project identity' : project.identity === 'folder' ? 'Local folder' : 'Project identity'} · {project.id.split(':').pop()?.slice(0,8)}<small>Same repository → same project. Each harness keeps its own sessions and people.</small></div>
      <div className="harness-chips">{[...new Set(project.agents.map(a=>a.provider))].map(p=><span key={p} className={p}>{p==='codex'?'⌘ Codex':'✳ Claude Code'} · {sessionsOf(project).filter(s=>s.provider===p).length} sessions</span>)}</div>
      {!readOnly && <details><summary>Edit room brief</summary><form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);onDesign(String(data.get('brief')||''));}}><label>What are we building?<textarea name="brief" maxLength={180} defaultValue={design?.description || project.description || ''} placeholder="A multiplayer gardening game, with suspiciously competitive carrots."/></label><button className="primary">Save brief</button><button className="secondary" type="button" onClick={onDecorate}>Choose vertical & props</button></form><small>Saved in this browser. Publish updated room details from Friends → Share my office.</small></details>}
    </div>
    <TeamHierarchy projects={[project]} query="" now={now} onFocus={()=>{}} onSelect={onSelect}/>
  </section>;
}
