import { z } from 'zod';
import { stateMeta, emptyOffice, type Agent, type OfficeState } from './protocol.ts';

export const shareSchema = z.object({
  enabled: z.boolean(), name: z.string().trim().min(1).max(60), bio: z.string().trim().max(180).default(''),
  projectNames: z.boolean().default(false),
  rooms: z.record(z.string().regex(/^[a-zA-Z0-9_.:-]{1,160}$/), z.object({
    vertical: z.string().regex(/^[a-z-]{1,50}$/), description: z.string().max(180).default(''),
    props: z.array(z.string().regex(/^[a-z0-9-]{1,70}$/)).max(12).default([]),
  }).strict()).refine(value => Object.keys(value).length <= 160).default({}),
}).strict();
export type ShareSettings = z.infer<typeof shareSchema>;
export type PublicOffice = { office: OfficeState; profile: { name: string; bio: string }; designs: ShareSettings['rooms'] };
export const privateSharing = (): ShareSettings => ({ enabled: false, name: 'My tiny office', bio: '', projectNames: false, rooms: {} });

/** Construct from an allowlist; adding a private event field cannot accidentally publish it. */
export function publicOffice(office: OfficeState, settings: ShareSettings): PublicOffice {
  const projectIds = [...new Set(office.agents.map(a => a.project.id))];
  const agents: Agent[] = office.agents.map(a => ({
    version: 1, id: a.id, at: a.at, provider: a.provider, instanceId: a.instanceId,
    project: { id: a.project.id, name: settings.projectNames ? a.project.name : `Project ${String(projectIds.indexOf(a.project.id) + 1).padStart(2, '0')}`,
      theme: a.project.theme, vertical: settings.rooms[a.project.id]?.vertical ?? a.project.vertical,
      ...(settings.projectNames ? { description: settings.rooms[a.project.id]?.description || a.project.description } : {}) },
    sessionId: a.sessionId, agentId: a.agentId, parentAgentId: a.parentAgentId,
    name: a.name, state: a.state, activity: stateMeta[a.state].label, phase: 'state',
    key: a.key, joinedAt: a.joinedAt, tools: {}, toolMarks: {},
  }));
  return { profile: { name: settings.name, bio: settings.bio },
    designs: Object.fromEntries(Object.entries(settings.rooms).filter(([id])=>projectIds.includes(id)).map(([id, room]) => [id, { ...room, description: settings.projectNames ? room.description : '' }])),
    office: { ...emptyOffice(), agents, revision: office.revision } };
}
