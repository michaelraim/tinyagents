import { describe, expect, it } from 'vitest';
import { applyEvent, emptyOffice, eventSchema, effectiveState, projectsOf, sessionsOf, summarizeAgents, type OfficeEvent } from '../shared/protocol';
import { normalizeHook } from '../bridge/normalize.mjs';
import { digest, matches, viewerCookie, viewerFromCookie, validEventTime } from '../shared/security';
const event = (overrides: Partial<OfficeEvent> = {}): OfficeEvent => ({ version: 1, id: 'e1', at: 1000, provider: 'codex', project: { id: 'p1', name: 'Orbit', theme: 'studio' }, sessionId: 's1', agentId: 'a1', name: 'Milo', state: 'coding', activity: 'Building', phase: 'state', ...overrides });

describe('honest office state', () => {
  it('deduplicates retries and rejects stale state transitions', () => {
    const first = applyEvent(emptyOffice(), event());
    expect(applyEvent(first, event())).toBe(first);
    const late = applyEvent(first, event({ id: 'old', at: 500, state: 'idle' }));
    expect(late.agents[0].state).toBe('coding');
    expect(late.revision).toBe(1);
  });
  it('keeps a concurrently running tool active when another finishes', () => {
    let office = applyEvent(emptyOffice(), event({ id: 'a', phase: 'start', toolCallId: 't1', state: 'testing', at: 1000 }));
    office = applyEvent(office, event({ id: 'b', phase: 'start', toolCallId: 't2', state: 'reading', at: 1200 }));
    office = applyEvent(office, event({ id: 'c', phase: 'finish', toolCallId: 't2', state: 'thinking', at: 1300 }));
    expect(office.agents[0].state).toBe('testing');
    expect(Object.keys(office.agents[0].tools)).toEqual(['t1']);
  });
  it('closes late tool results without rewinding newer state or resurrecting calls', () => {
    let office = applyEvent(emptyOffice(), event({ id: 'a', phase: 'start', toolCallId: 't1', at: 1000 }));
    office = applyEvent(office, event({ id: 'b', phase: 'start', toolCallId: 't2', at: 1400, state: 'reading' }));
    office = applyEvent(office, event({ id: 'c', phase: 'finish', toolCallId: 't1', at: 1300, state: 'thinking' }));
    office = applyEvent(office, event({ id: 'd', phase: 'start', toolCallId: 't1', at: 1100 }));
    expect(Object.keys(office.agents[0].tools)).toEqual(['t2']);
    expect(office.agents[0].state).toBe('reading');
  });
  it('preserves work labels and hierarchy across tool calls', () => {
    const first = applyEvent(emptyOffice(), event({ task: 'Audit UI', parentAgentId: 'lead' }));
    const next = applyEvent(first, event({ id: 'e2', at: 2000, state: 'reading' }));
    expect(next.agents[0]).toMatchObject({ task: 'Audit UI', parentAgentId: 'lead' });
  });
  it('does not confuse providers or sessions sharing IDs', () => {
    let office = applyEvent(emptyOffice(), event());
    office = applyEvent(office, event({ id: 'e2', provider: 'claude' }));
    office = applyEvent(office, event({ id: 'e3', sessionId: 's2' }));
    expect(office.agents).toHaveLength(3);
  });
  it('marks stale work as unconfirmed/away, never idle', () => {
    const office = applyEvent(emptyOffice(), event());
    expect(effectiveState(office.agents[0], 302_000)).toBe('offline');
    expect(effectiveState(office.agents[0], 2000)).toBe('coding');
  });
  it('bounds retained history and retry IDs', () => {
    let office = emptyOffice();
    for (let i = 1; i < 1100; i++) office = applyEvent(office, event({ id: `e${i}`, at: i }));
    expect(office.events).toHaveLength(80); expect(office.seen).toHaveLength(1024);
  });
  it('aggregates attention without hiding concurrently running work', () => {
    let office = applyEvent(emptyOffice(), event());
    office = applyEvent(office, event({id:'e2',agentId:'child',parentAgentId:'a1',state:'waiting'}));
    expect(summarizeAgents(office.agents,2000)).toMatchObject({status:'waiting',running:1,attention:1,total:2,subagents:1});
    expect(summarizeAgents(office.agents,400000)).toMatchObject({status:'offline',running:0,attention:0});
  });
  it('groups sessions by provider and orders leads beside descendants', () => {
    let office = emptyOffice();
    for (const e of [event({id:'c',agentId:'child',parentAgentId:'a1'}),event(),event({id:'other',provider:'claude'}),event({id:'orphan',agentId:'orphan',parentAgentId:'missing'})]) office=applyEvent(office,e);
    const sessions=sessionsOf(projectsOf(office)[0]);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].agents.map(a=>a.agentId)).toEqual(['a1','child','orphan']);
    expect(sessions[0].leads.map(a=>a.agentId)).toEqual(['a1','orphan']);
  });
});

describe('plugin privacy and event semantics', () => {
  it('strips private fields before transmission and classifies tests locally', () => {
    const normalized = normalizeHook({ session_id: 'sensitive-id', cwd: 'C:\\Secret\\Project', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test --token SECRET_TOKEN' }, prompt: 'secret prompt', tool_response: 'private code', transcript_path: '/secret/transcript' }, 'codex', { projectName: 'Safe alias' }, 1000);
    const text = JSON.stringify(normalized);
    expect(text).not.toMatch(/SECRET_TOKEN|secret prompt|private code|Secret|transcript|sensitive-id/);
    expect(normalized?.state).toBe('testing'); expect(eventSchema.safeParse(normalized).success).toBe(true);
  });
  it('maps actual waiting and subagent lifecycle events', () => {
    const base = { session_id: 's', cwd: '/workspace/app' };
    const child = normalizeHook({ ...base, hook_event_name: 'SubagentStart', agent_id: 'child' }, 'claude');
    const root = normalizeHook({ ...base, hook_event_name: 'PermissionRequest' }, 'claude');
    expect(child?.parentAgentId).toBe(root?.agentId); expect(root?.state).toBe('waiting');
    expect(normalizeHook({ ...base, hook_event_name: 'SubagentStop', agent_id: 'child' }, 'claude')?.state).toBe('done');
  });
  it('ignores unrelated notifications and unknown hooks', () => {
    expect(normalizeHook({ session_id: 's', hook_event_name: 'Notification', notification_type: 'auth_success' }, 'claude')).toBeNull();
    expect(normalizeHook({ session_id: 's', hook_event_name: 'MadeUpEvent' }, 'codex')).toBeNull();
  });
  it('groups worktrees only when explicitly given the same project identity', () => {
    const base = { session_id: 's', hook_event_name: 'SessionStart' };
    expect(normalizeHook({ ...base, cwd: '/a' }, 'codex', { projectId: 'shared' })?.project.id).toBe(normalizeHook({ ...base, cwd: '/b' }, 'claude', { projectId: 'shared' })?.project.id);
  });
  it('keeps case-sensitive project directories distinct', () => {
    const base = { session_id: 's', hook_event_name: 'SessionStart' };
    expect(normalizeHook({ ...base, cwd: '/workspace/App' }, 'codex')?.project.id).not.toBe(normalizeHook({ ...base, cwd: '/workspace/app' }, 'codex')?.project.id);
  });
  it('rejects payload additions, dangerous IDs, and overlong fields', () => {
    expect(eventSchema.safeParse({ ...event(), sourceCode: 'private' }).success).toBe(false);
    expect(eventSchema.safeParse(event({ toolCallId: '__proto__' })).success).toBe(false);
    expect(eventSchema.safeParse(event({ activity: 'x'.repeat(200) })).success).toBe(false);
  });
});

describe('office credentials', () => {
  it('separates key verification and scopes viewer cookies to one office', async () => {
    const hash = await digest('correct');
    expect(await matches('correct', hash)).toBe(true); expect(await matches('wrong', hash)).toBe(false);
    const cookie = viewerCookie('one', 'key', true);
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure');
    expect(viewerFromCookie(cookie, 'one')).toBe('key'); expect(viewerFromCookie(cookie, 'two')).toBe('');
  });
  it('bounds clock skew and offline retries', () => {
    expect(validEventTime(10_000, 10_000)).toBe(true); expect(validEventTime(80_000, 10_000)).toBe(false);
    expect(validEventTime(10_000, 10_000 + 8 * 86400_000)).toBe(false);
  });
});
