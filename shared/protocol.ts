import { z } from 'zod';
import { timeZoneSchema } from './clock.ts';

export const states = ['thinking', 'coding', 'reading', 'testing', 'waiting', 'blocked', 'idle', 'done', 'offline'] as const;
export type AgentState = typeof states[number];
export type Provider = 'codex' | 'claude';
export type Theme = 'studio' | 'lab' | 'garden';
const identifier = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/).refine(v => !['__proto__', 'constructor', 'prototype'].includes(v));
export const eventSchema = z.object({
  version: z.literal(1), id: identifier, at: z.number().int().positive(),
  provider: z.enum(['codex', 'claude']), instanceId: identifier.optional(),
  timeZone: timeZoneSchema.optional(),
  collaboration: z.object({ kind: z.enum(['delegate','return','message']), targetAgentId: identifier, targetSessionId: identifier.optional() }).strict().optional(),
  project: z.object({ id: identifier, name: z.string().min(1).max(60), theme: z.enum(['studio', 'lab', 'garden']).default('studio'),
    identity: z.enum(['repository', 'folder', 'manual']).optional(), vertical: z.string().regex(/^[a-z-]{1,50}$/).optional(), description: z.string().max(180).optional() }).strict(),
  sessionId: identifier, agentId: identifier, parentAgentId: identifier.optional(),
  name: z.string().min(1).max(50), state: z.enum(states),
  activity: z.string().min(1).max(140), task: z.string().max(180).optional(),
  tool: z.string().max(80).optional(), toolCallId: identifier.optional(),
  phase: z.enum(['start', 'finish', 'state']).default('state'),
}).strict();
export type OfficeEvent = z.infer<typeof eventSchema>;
export type Agent = OfficeEvent & { key: string; joinedAt: number; officeName?: string; officeTimeZone?: string; visitingOfficeId?: string; toolMarks: Record<string, number>; tools: Record<string, { state: AgentState; activity: string; tool: string; at: number }> };
export type OfficeState = { agents: Agent[]; events: OfficeEvent[]; seen: string[]; revision: number; timeZone?: string };
export const emptyOffice = (): OfficeState => ({ agents: [], events: [], seen: [], revision: 0 });
export const agentKey = (e: Pick<OfficeEvent, 'provider' | 'instanceId' | 'sessionId' | 'agentId'>) => `${e.provider}:${e.instanceId ? e.instanceId + ':' : ''}${e.sessionId}:${e.agentId}`;
export const sameSession = (a: Agent, b: Agent) => a.provider === b.provider && a.instanceId === b.instanceId && a.sessionId === b.sessionId && a.project.id === b.project.id;
export const agentRole = (agent: Agent, peers: Agent[]) => peers.some(a => sameSession(a, agent) && a.parentAgentId === agent.agentId) ? 'Team lead' : agent.parentAgentId ? 'Subagent' : 'Agent';
export const stateMeta: Record<AgentState, { label: string; emoji: string; color: string; feeling: string }> = {
  coding: { label: 'Building', emoji: '⌨️', color: '#6b9f85', feeling: 'In the zone' },
  thinking: { label: 'Thinking', emoji: '💭', color: '#9780c3', feeling: 'Connecting the dots' },
  reading: { label: 'Exploring', emoji: '🔎', color: '#799bb6', feeling: 'Curiosity mode' },
  testing: { label: 'Testing', emoji: '🧪', color: '#69a69e', feeling: 'Fingers crossed' },
  waiting: { label: 'Needs you', emoji: '✋', color: '#d69b49', feeling: 'A little help?' },
  blocked: { label: 'Hit a snag', emoji: '🩹', color: '#cc796e', feeling: 'Working through it' },
  idle: { label: 'On a break', emoji: '☕', color: '#a3a09a', feeling: 'Taking a breather' },
  done: { label: 'Finished', emoji: '✨', color: '#85ac70', feeling: 'That felt good' },
  offline: { label: 'Away', emoji: '🌙', color: '#9994a6', feeling: 'See you soon' },
};

// All event sources pass through this reducer. Late delivery cannot rewind an agent.
export function applyEvent(office: OfficeState, event: OfficeEvent): OfficeState {
  if (office.seen.includes(event.id)) return office;
  const key = agentKey(event);
  const previous = office.agents.find(a => a.key === key);
  const seen = [...office.seen.slice(-1023), event.id];
  const tools = { ...previous?.tools };
  const toolMarks = { ...previous?.toolMarks };
  const late = !!previous && event.at < previous.at;
  // A late finish still closes its own tool. Per-call timestamps prevent delayed starts
  // from resurrecting an already completed tool; terminal events cannot be resurrected.
  if (event.toolCallId && event.at >= (toolMarks[event.toolCallId] ?? 0)) {
    if (event.phase === 'start' && !(late && ['done', 'idle', 'offline'].includes(previous.state))) tools[event.toolCallId] = { state: event.state, activity: event.activity, tool: event.tool || '', at: event.at };
    if (event.phase === 'finish') delete tools[event.toolCallId];
    toolMarks[event.toolCallId] = event.at;
  }
  const boundedMarks = Object.fromEntries(Object.entries(toolMarks).sort((a, b) => b[1] - a[1]).slice(0, 128));
  if (late) return { ...office, seen, agents: office.agents.map(a => a.key === key ? { ...a, tools, toolMarks: boundedMarks } : a) };
  if (['done', 'offline', 'idle'].includes(event.state)) for (const id of Object.keys(tools)) delete tools[id];
  const pending = Object.values(tools).sort((a, b) => b.at - a.at)[0];
  const agent: Agent = {
    ...previous, ...event, key, joinedAt: previous?.joinedAt ?? event.at, tools, toolMarks: boundedMarks,
    task: event.task ?? previous?.task,
    parentAgentId: event.parentAgentId ?? previous?.parentAgentId,
    collaboration: event.collaboration,
    ...(event.phase === 'finish' && pending ? { state: pending.state, activity: pending.activity, tool: pending.tool } : {}),
  };
  const agents = previous ? office.agents.map(a => a.key === key ? agent : a) : [...office.agents, agent];
  return { ...office, timeZone: office.timeZone ?? event.timeZone, agents: agents.slice(-160), events: [event, ...office.events].slice(0, 80), seen, revision: office.revision + 1 };
}

export function effectiveState(agent: Agent, now: number): AgentState {
  // Silence is missing telemetry, never evidence that the agent took a break.
  return now - agent.at > 5 * 60_000 && !['done', 'offline', 'idle'].includes(agent.state) ? 'offline' : agent.state;
}

export type Project = OfficeEvent['project'] & { agents: Agent[] };
export function projectsOf(office: OfficeState): Project[] {
  const projects = new Map<string, Project>();
  for (const agent of office.agents) {
    const p = projects.get(agent.project.id) ?? { ...agent.project, agents: [] };
    p.agents.push(agent); projects.set(p.id, p);
  }
  return [...projects.values()];
}

export type TeamStatus = 'working' | 'waiting' | 'blocked' | 'idle' | 'done' | 'offline';
export const teamMeta: Record<TeamStatus, { label: string; color: string }> = {
  working: { label: 'In progress', color: '#64bca6' }, waiting: { label: 'Needs input', color: '#e7b359' },
  blocked: { label: 'Has a blocker', color: '#de8479' }, idle: { label: 'Between tasks', color: '#a8b3b0' },
  done: { label: 'Work complete', color: '#a5c97a' }, offline: { label: 'No recent signal', color: '#8897ad' },
};
export function summarizeAgents(agents: Agent[], now: number) {
  const counts = Object.fromEntries(states.map(s => [s, 0])) as Record<AgentState, number>;
  for (const agent of agents) counts[effectiveState(agent, now)]++;
  const running = counts.coding + counts.thinking + counts.reading + counts.testing;
  const attention = counts.waiting + counts.blocked;
  const status: TeamStatus = counts.blocked ? 'blocked' : counts.waiting ? 'waiting' : running ? 'working'
    : counts.idle ? 'idle' : counts.offline ? 'offline' : counts.done ? 'done' : 'idle';
  return { status, counts, running, attention, total: agents.length, subagents: agents.filter(a => a.parentAgentId).length };
}
export type Session = { key: string; id: string; provider: Provider; name: string; agents: Agent[]; leads: Agent[] };
export function sessionsOf(project: Project): Session[] {
  const groups = new Map<string, Agent[]>();
  for (const agent of project.agents) {
    const key = `${agent.provider}:${agent.instanceId ?? ''}:${agent.sessionId}`;
    groups.set(key, [...(groups.get(key) ?? []), agent]);
  }
  return [...groups].map(([key, members]) => {
    const ids = new Set(members.map(a => a.agentId));
    const leads = members.filter(a => !a.parentAgentId || !ids.has(a.parentAgentId));
    const agents: Agent[] = [], visited = new Set<string>();
    const visit = (agent: Agent) => {
      if (visited.has(agent.key)) return;
      visited.add(agent.key); agents.push(agent);
      for (const child of members.filter(a => a.parentAgentId === agent.agentId)) visit(child);
    };
    // Missing parents and malformed cycles still occupy seats exactly once.
    for (const agent of [...leads, ...members]) visit(agent);
    return { key, id: members[0].sessionId, provider: members[0].provider, name: `${(leads[0] ?? members[0]).name}'s team`, agents, leads };
  });
}
