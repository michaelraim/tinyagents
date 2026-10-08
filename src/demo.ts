import { applyEvent, emptyOffice, type OfficeEvent, type OfficeState, type AgentState } from '../shared/protocol';

const projects = [
  { id: 'orbit', name: 'Orbit web', theme: 'studio' as const },
  { id: 'infra', name: 'Cloud kitchen', theme: 'lab' as const },
  { id: 'bloom', name: 'Bloom app', theme: 'garden' as const },
];
const cast = [
  ['milo', 'Milo', 0, 'codex', 'coding', 'Building the new dashboard', 'Polish the Orbit dashboard'],
  ['cleo', 'Cleo', 0, 'claude', 'reading', 'Exploring the component library', 'Find reusable navigation patterns'],
  ['pip', 'Pip', 0, 'codex', 'testing', 'Running component tests', 'Check keyboard navigation'],
  ['nova', 'Nova', 0, 'codex', 'thinking', 'Thinking through the layout', 'Review the dashboard architecture'],
  ['remy', 'Remy', 0, 'codex', 'coding', 'Building accessible menus', 'Make navigation keyboard friendly'],
  ['tess', 'Tess', 0, 'claude', 'reading', 'Reading the design tokens', 'Audit the component library'],
  ['odie', 'Odie', 0, 'codex', 'idle', 'Waiting for the next task', 'Explore a new landing page'],
  ['atlas', 'Atlas', 1, 'claude', 'coding', 'Wiring up the event stream', 'Build the realtime event pipeline'],
  ['bean', 'Bean', 1, 'claude', 'waiting', 'Needs approval to run a migration', 'Migrate the event schema'],
  ['luna', 'Luna', 1, 'claude', 'testing', 'Checking reconnect behavior', 'Verify WebSocket recovery'],
  ['sage', 'Sage', 1, 'claude', 'blocked', 'The migration fixture is missing', 'Validate the database upgrade'],
  ['fern', 'Fern', 2, 'claude', 'coding', 'Making the onboarding feel right', 'Build a friendlier first run'],
  ['chip', 'Chip', 2, 'claude', 'idle', 'Waiting for the next task', 'Review the color palette'],
] as const;
export function createDemo(): OfficeState {
  return cast.reduce((office, [id, name, p, provider, state, activity, task], i) => applyEvent(office, {
    version: 1, id: `demo-${i}`, at: Date.now() - (cast.length - i) * 1400, provider, project: projects[p],
    sessionId: ['milo', 'pip', 'nova','remy'].includes(id) ? 'orbit-main' : ['cleo','tess'].includes(id)?'orbit-design':p === 1 ? 'infra-main' : p===2?'bloom-main':`${id}-session`,
    agentId: id, parentAgentId: ['pip', 'nova','remy'].includes(id) ? 'milo' : ['bean', 'luna','sage'].includes(id) ? 'atlas' : id==='tess'?'cleo':id==='chip'?'fern':undefined,
    name, state, activity, task, phase: 'state',
  }), emptyOffice());
}
const cycles: Partial<Record<string, [AgentState, string][]>> = {
  milo: [['coding', 'Building the new dashboard'], ['thinking', 'Working out the edge cases'], ['coding', 'Adding a tiny finishing touch']],
  cleo: [['reading', 'Exploring the component library'], ['thinking', 'Comparing two approaches'], ['done', 'Component exploration complete']],
  pip: [['testing', 'Running component tests'], ['done', 'All checks passed. Nice!'], ['idle', 'Stretching after a good test run']],
  nova: [['thinking', 'Thinking through the layout'], ['reading', 'Reviewing the dashboard structure'], ['coding', 'Writing up the recommendations']],
  atlas: [['coding', 'Wiring up the event stream'], ['testing', 'Checking the connection'], ['thinking', 'Planning the next little step']],
  luna: [['testing', 'Checking reconnect behavior'], ['blocked', 'Found a reconnect edge case'], ['coding', 'Fixing the retry logic']],
  fern: [['coding', 'Making the onboarding feel right'], ['reading', 'Reviewing the welcome flow'], ['done', 'A warmer welcome, shipped']],
  chip: [['idle', 'Taking a well-earned coffee break'], ['reading', 'Looking over the color palette'], ['idle', 'Thinking about another coffee']],
  bean: [['waiting', 'Needs approval to run a migration']],
  sage: [['blocked','The migration fixture is missing'],['reading','Reviewing the migration fixture'],['testing','The fixture is ready; running the check'],['done','Migration checks passed']],
  remy: [['coding','Building accessible menus'],['testing','Checking keyboard focus'],['done','Keyboard navigation works'],['idle','Ready for the next task']],
  tess: [['reading','Reading the design tokens'],['thinking','Comparing spacing rules'],['done','Design token audit complete']],
  odie: [['idle','Waiting for the next task'],['thinking','Sketching the page structure'],['coding','Building the landing page'],['done','Landing page is ready']],
};
export function nextDemoEvent(office: OfficeState, tick: number): OfficeEvent {
  const eligible = office.agents;
  const agent = eligible[tick % eligible.length];
  const cycle = cycles[agent.agentId] ?? [['thinking', 'Thinking']];
  const [state, activity] = cycle[(1 + Math.floor(tick / eligible.length)) % cycle.length];
  return { version: 1, id: `demo-live-${tick}-${Date.now()}`, at: Date.now(), provider: agent.provider,
    project: agent.project, sessionId: agent.sessionId, agentId: agent.agentId, parentAgentId: agent.parentAgentId,
    name: agent.name, state, activity, task: agent.task, phase: 'state' };
}
