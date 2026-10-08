import { useEffect, useMemo, useRef } from 'react';
import { officePlan, type OfficePlan } from '../shared/layout';
import type { Project } from '../shared/protocol';
import { recordDiagnostic } from './diagnostics';

// One committed plan drives the scene and minimap. Stream updates preserve its
// occupied plots; changing offices starts a separate campus.
export function useCampus(projects: Project[], officeKey: string) {
  const previous=useRef<{key:string;plan:OfficePlan} | undefined>(undefined);
  const signature=projects.map(p=>`${p.id}:${p.name}:${p.agents.map(a=>`${a.key}:${a.parentAgentId??''}`).join(',')}`).join('|');
  const plan=useMemo(()=>officePlan(projects,previous.current?.key===officeKey?previous.current.plan:undefined),[signature,officeKey]);
  useEffect(()=>{previous.current={key:officeKey,plan};recordDiagnostic('campus.changed',{rooms:plan.rooms.length});},[plan,officeKey]);
  return plan;
}
