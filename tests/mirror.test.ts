import { describe, expect, it } from 'vitest';
import { normalizeHook, titleFrom, describeTool } from '../bridge/normalize.mjs';
import { applyEvent as apply, emptyOffice, pruneOffice, type Agent, type OfficeEvent, type OfficeState } from '../shared/protocol';

const applyEvent = (office: OfficeState, event: unknown) => apply(office, event as OfficeEvent);
import { World, moodOf, onSite } from '../src/world/sim';
import { planBuilding } from '../shared/building';
import { projectsOf } from '../shared/protocol';

const base = { session_id: 's1', cwd: '/home/me/work/orbit' };

describe('what the office shows about the work', () => {
  it('turns a prompt into a short, scrubbed task title', () => {
    const event = normalizeHook({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Fix the login redirect after OAuth. Then also update docs at https://example.com/a/b?token=x' }, 'claude');
    expect(event?.task).toBe('Fix the login redirect after OAuth.');
    expect(titleFrom('please email bob@corp.io the key sk-abcdefghijklmnop1234 ok')).not.toMatch(/bob@|sk-abc/);
    expect(titleFrom('```js\nsecret()\n```\nrefactor   the parser')).toBe('Refactor the parser');
    expect(titleFrom('a'.repeat(30) + ' ' + 'b'.repeat(80))!.length).toBeLessThanOrEqual(81);
  });

  it('describes tools by file name or command verb, never their arguments', () => {
    expect(describeTool('Edit', { file_path: 'C:\\repo\\src\\auth\\login.ts' })).toBe('Editing login.ts');
    expect(describeTool('Bash', { command: 'git push origin main --force' })).toBe('Running git push');
    expect(describeTool('Bash', { command: 'curl -H "Authorization: Bearer abc" https://x' })).toBe('Running curl');
    expect(describeTool('Bash', { command: 'npm run build -- --prod' })).toBe('Running npm run build');
    expect(describeTool('WebFetch', { url: 'https://docs.example.com/private/page?id=3' })).toBe('Browsing docs.example.com');
    expect(describeTool('apply_patch', { input: '*** Begin Patch\n*** Update File: src/app.tsx\n@@' })).toBe('Editing app.tsx');
    const test = normalizeHook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npx vitest run tests/a.test.ts' } }, 'claude');
    expect(test?.state).toBe('testing');
    expect(test?.activity).toBe('Running tests (npx vitest)');
  });

  it('gives subagents the description their lead handed them', () => {
    const event = normalizeHook({ ...base, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' }, 'claude', {}, Date.now(), { delegation: 'Find where sessions are created' });
    expect(event?.task).toBe('Find where sessions are created');
    expect(event?.parentAgentId).toBeTruthy();
  });

  it('shares only generic activity when task sharing is off', () => {
    const prompt = normalizeHook({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Secret plan' }, 'claude', { shareTasks: false });
    expect(prompt?.task).toBeUndefined();
    const edit = normalizeHook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/x/secret.ts' } }, 'claude', { shareTasks: false });
    expect(edit?.activity).toBe('Working with tools');
  });

  it('keeps the task title across later events', () => {
    let office = emptyOffice();
    const now = Date.now();
    office = applyEvent(office, normalizeHook({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Ship the new office' }, 'claude', {}, now)!);
    office = applyEvent(office, normalizeHook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/a/b.ts' }, tool_use_id: 't1' }, 'claude', {}, now + 10)!);
    expect(office.agents[0].task).toBe('Ship the new office');
    expect(office.agents[0].activity).toBe('Reading b.ts');
  });
});

describe('liveness', () => {
  const agent = (state: Agent['state'], ago: number, tools = {}) => ({ state, at: Date.now() - ago, tools } as unknown as Agent);
  it('never times out someone waiting for you', () => expect(moodOf(agent('waiting', 3 * 3600_000), Date.now())).toBe('ask'));
  it('keeps a long-running tool busy, but dozes off without one', () => {
    expect(moodOf(agent('testing', 12 * 60_000, { t: {} }), Date.now())).toBe('work');
    expect(moodOf(agent('coding', 12 * 60_000), Date.now())).toBe('doze');
  });
  it('sends idle people home after half an hour', () => {
    expect(moodOf(agent('idle', 10 * 60_000), Date.now())).toBe('break');
    expect(moodOf(agent('done', 40 * 60_000), Date.now())).toBe('leave');
  });
  it('sends home sessions that died mid-task instead of dozing all day', () => {
    expect(moodOf(agent('coding', 40 * 60_000), Date.now())).toBe('leave');
    expect(moodOf(agent('testing', 40 * 60_000, { t: {} }), Date.now())).toBe('leave');
    expect(moodOf(agent('testing', 25 * 60_000, { t: {} }), Date.now())).toBe('work');
  });
  it('gives desks only to people around or just walking out', () => {
    expect(onSite(agent('coding', 2 * 60_000), Date.now())).toBe(true);
    expect(onSite(agent('idle', 31 * 60_000), Date.now())).toBe(true);
    expect(onSite(agent('idle', 3 * 3600_000), Date.now())).toBe(false);
    expect(onSite(agent('offline', 60_000), Date.now())).toBe(true);
    expect(onSite(agent('offline', 10 * 60_000), Date.now())).toBe(false);
    expect(onSite(agent('waiting', 3 * 3600_000), Date.now())).toBe(true);
  });
  it('lets speech bubbles from state changes fade', () => {
    const a = { ...agent('coding', 0), key: 'k', agentId: 'main', sessionId: 's', provider: 'claude', project: { id: 'p', name: 'p' }, joinedAt: 0, toolMarks: {} } as unknown as Agent;
    const world = new World(planBuilding(projectsOf({ agents: [a], events: [], seen: [], revision: 0 })));
    world.sync([a], Date.now());
    world.sync([{ ...a, state: 'testing' }], Date.now());
    expect(world.bodies.get('k')!.bubble).toBeDefined();
    world.update(0.016, performance.now() + 8000);
    expect(world.bodies.get('k')!.bubble).toBeUndefined();
  });
  it('prunes agents silent for a day', () => {
    const now = Date.now();
    let office = applyEvent(emptyOffice(), normalizeHook({ ...base, hook_event_name: 'Stop' }, 'claude', {}, now - 25 * 3600_000)!);
    office = applyEvent(office, normalizeHook({ ...base, session_id: 's2', hook_event_name: 'Stop' }, 'claude', {}, now)!);
    expect(pruneOffice(office, now).agents).toHaveLength(1);
  });
});
