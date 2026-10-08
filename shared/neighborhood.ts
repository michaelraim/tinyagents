import type { OfficeState } from './protocol';
import type { PublicOffice } from './public-office';
export type Neighbor = { id: string; view: PublicOffice };
export const VISITOR_LIMIT = 24;
export function neighborhood(own: OfficeState, neighbors: Neighbor[]): OfficeState {
  return { ...own, agents: [...own.agents.map(a => ({ ...a, officeName: 'Your office' })), ...neighbors.slice(0, 3).flatMap(({ id, view }) =>
    view.office.agents.slice(0, VISITOR_LIMIT).map(a => ({ ...a,
      key: `${id}:${a.key}`, project: { ...a.project, id: `${id}:${a.project.id}` },
      sessionId: `${id}:${a.sessionId}`, agentId: `${id}:${a.agentId}`, parentAgentId: a.parentAgentId ? `${id}:${a.parentAgentId}` : undefined,
      visitingOfficeId: id, officeName: view.profile.name,
    })))] };
}
export function publicLinkId(value: string, origin: string): string {
  const url = new URL(value);
  const id = url.searchParams.get('visit') ?? '';
  if (url.origin !== origin || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) || url.username || url.password) throw new Error('Paste a public office link from this website.');
  return id;
}
export const hangouts = {
  coffee: { icon: '☕', name: 'Coffee summit', line: 'Two offices. One espresso machine. Zero actionable takeaways.' },
  duck: { icon: '🦆', name: 'Rubber-duck debate', line: 'The duck has requested a second opinion from another duck.' },
  standup: { icon: '🎤', name: 'Competitive stand-up', line: 'Yesterday: shipped. Today: also shipped. Blockers: humility.' },
  arcade: { icon: '🕹️', name: 'Arcade rivalry', line: 'A friendly benchmark. The loser blames the keyboard.' },
} as const;
export type Hangout = { kind: keyof typeof hangouts; at: number };
