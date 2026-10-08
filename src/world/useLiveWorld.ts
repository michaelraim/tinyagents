import { useEffect, useMemo, useRef } from 'react';
import { planBuilding, emptyMemory, type Building } from '../../shared/building';
import { projectsOf, sameSession, type Agent, type OfficeState } from '../../shared/protocol';
import { World } from './sim';

export type Role = 'lead' | 'sub' | 'solo';

export function rolesOf(agents: Agent[]) {
  const roles = new Map<string, Role>();
  for (const agent of agents) {
    const leads = agents.some(a => sameSession(a, agent) && a.parentAgentId === agent.agentId);
    roles.set(agent.key, leads ? 'lead' : agent.parentAgentId ? 'sub' : 'solo');
  }
  return roles;
}

/** Plans the building, runs the life simulation and tracks state timers for one office. */
export function useLiveWorld(office: OfficeState, now: number) {
  const agents = office.agents;
  const projects = useMemo(() => projectsOf(office), [office]);
  // Re-plan only when membership changes, not on every state change.
  const memory = useRef(emptyMemory());
  const signature = projects.map(p => `${p.id}:${p.name}:${p.agents.map(a => `${a.key}>${a.parentAgentId ?? ''}`).join(',')}`).join('|');
  const plan: Building = useMemo(() => planBuilding(projects, memory.current), [signature]);
  const worldRef = useRef<World | null>(null);
  if (!worldRef.current) worldRef.current = new World(plan);
  const world = worldRef.current;
  useEffect(() => { world.setBuilding(plan); }, [plan]);
  useEffect(() => { world.sync(agents, now); }, [agents, now, plan]);

  // When each agent entered its current state, for "Coding 4m" timers.
  const stateSince = useRef(new Map<string, number>());
  const lastState = useRef(new Map<string, string>());
  for (const agent of agents) {
    if (lastState.current.get(agent.key) !== agent.state) {
      lastState.current.set(agent.key, agent.state);
      stateSince.current.set(agent.key, agent.at);
    }
  }
  const roles = useMemo(() => rolesOf(agents), [agents]);
  return { plan, world, agents, roles, stateSince: stateSince.current };
}
