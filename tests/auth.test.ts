import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createAuth, type AuthEnv } from '../worker/auth';
import { getMigrations } from 'better-auth/db/migration';

const base = 'https://office.example';
let db: DatabaseSync, auth: ReturnType<typeof createAuth>;
const cookie = (r: Response) => r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
let identity = 1, email = 'owner@example.com';
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync('migrations/0001_auth.sql', 'utf8'));
  db.exec(readFileSync('migrations/0002_office_owners.sql', 'utf8'));
  auth = createAuth({ AUTH_DB: {} as AuthEnv['AUTH_DB'], AUTH_BASE_URL: base, BETTER_AUTH_SECRET: 'test-only-secret-for-auth-integration-at-least-32-characters', GITHUB_CLIENT_ID: 'test-github', GITHUB_CLIENT_SECRET: 'test-github-secret', GITLAB_CLIENT_ID: 'test-gitlab', GITLAB_CLIENT_SECRET: 'test-gitlab-secret' } satisfies AuthEnv, db);
  identity = 1; email = 'owner@example.com';
  vi.stubGlobal('fetch', vi.fn(async (input: string | Request | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://github.com/login/oauth/access_token' || url === 'https://gitlab.com/oauth/token') return Response.json({ access_token: 'provider-secret-token', token_type: 'Bearer', scope: url.includes('github') ? 'read:user,user:email' : 'read_user' });
    if (url === 'https://api.github.com/user') return Response.json({ id: identity, login: 'tiny-owner', name: 'Tiny Owner', email: null });
    if (url === 'https://api.github.com/user/emails') return Response.json([{ email, primary: true, verified: true }]);
    if (url === 'https://gitlab.com/api/v4/user') return Response.json({ id: identity, name: 'Tiny GitLab', username: 'tiny-owner', email, email_verified: true, state: 'active', locked: false });
    throw Error('Unexpected external request: ' + url);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); db.close(); });
async function start(provider: 'github' | 'gitlab', cookies = '', link = false, callbackURL = '/office?welcome=1') {
  const response = await auth.handler(new Request(`${base}/api/auth/${link ? 'link-social' : 'sign-in/social'}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookies }, body: JSON.stringify({ provider, callbackURL, errorCallbackURL: '/office?auth_error=1' }) }));
  const data = await response.json();
  return { response, data, cookies: cookie(response) + (cookies ? '; ' + cookies : '') };
}
async function finish(provider: string, started: Awaited<ReturnType<typeof start>>, state?: string) {
  const expected = new URL(started.data.url).searchParams.get('state')!;
  return auth.handler(new Request(`${base}/api/auth/callback/${provider}?code=test-code&state=${encodeURIComponent(state ?? expected)}`, { headers: { Cookie: started.cookies } }));
}
describe('GitHub and GitLab account login', () => {
  it.each(['github', 'gitlab'] as const)('%s signs in and returns the same account on another browser', async provider => {
    const a = await start(provider);
    expect(a.response.status).toBe(200);
    const authorization = new URL(a.data.url);
    expect(authorization.searchParams.get('redirect_uri')).toBe(`${base}/api/auth/callback/${provider}`);
    expect(authorization.searchParams.get('scope')).not.toMatch(/(^| )repo|api |write/);
    const callback = await finish(provider, a);
    expect(callback.headers.get('location')).toBe('/office?welcome=1');
    expect(cookie(callback)).toContain('__Secure-tinyagents.session_token=');
    const session = await auth.api.getSession({ headers: new Headers({ Cookie: cookie(callback) }) });
    expect(session?.user.email).toBe(email);
    const b = await finish(provider, await start(provider));
    const again = await auth.api.getSession({ headers: new Headers({ Cookie: cookie(b) }) });
    expect(again?.user.id).toBe(session?.user.id);
    const row = db.prepare('SELECT accessToken FROM account').get();
    expect(row?.accessToken).not.toBe('provider-secret-token');
    expect(new Date(String(db.prepare('SELECT expiresAt FROM session LIMIT 1').get()?.expiresAt)).getTime()).toBeGreaterThan(Date.now());
  });
  it('rejects a wrong state and a replayed callback', async () => {
    const flow = await start('github');
    const wrong = await finish('github', flow, 'incorrect-state');
    expect(wrong.headers.get('location')).toContain('error=');
    expect(db.prepare('SELECT count(*) AS n FROM user').get()?.n).toBe(0);
    const valid = await start('github');
    expect((await finish('github', valid)).headers.get('location')).toBe('/office?welcome=1');
    expect((await finish('github', valid)).headers.get('location')).toContain('error=');
    expect(db.prepare('SELECT count(*) AS n FROM session').get()?.n).toBe(1);
  });
  it('requires the browser state cookie', async () => {
    const flow = await start('gitlab');
    expect((await finish('gitlab', { ...flow, cookies: '' })).headers.get('location')).toContain('error=');
    expect(db.prepare('SELECT count(*) AS n FROM user').get()?.n).toBe(0);
  });
  it('does not merge accounts just because their email matches; explicit linking supports both logins', async () => {
    const first = await finish('github', await start('github'));
    const githubSession = await auth.api.getSession({ headers: new Headers({ Cookie: cookie(first) }) });
    const implicit = await finish('gitlab', await start('gitlab'));
    expect(implicit.headers.get('location')).toContain('error=');
    expect(db.prepare('SELECT count(*) AS n FROM account').get()?.n).toBe(1);
    const linked = await finish('gitlab', await start('gitlab', cookie(first), true));
    expect(linked.headers.get('location')).toBe('/office?welcome=1');
    const other = await finish('gitlab', await start('gitlab'));
    const gitlabSession = await auth.api.getSession({ headers: new Headers({ Cookie: cookie(other) }) });
    expect(gitlabSession?.user.id).toBe(githubSession?.user.id);
  });
  it('rejects external redirects and cross-origin login requests', async () => {
    expect((await start('github', '', false, 'https://attacker.example')).response.status).toBe(403);
    const cross = await auth.handler(new Request(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: { Origin: 'https://attacker.example', Cookie: '', 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'github', callbackURL: '/office' }) }));
    expect(cross.status).toBe(403);
  });
  it('sign-out revokes the server session', async () => {
    const signed = await finish('github', await start('github'));
    const headers = new Headers({ Cookie: cookie(signed), Origin: base });
    expect(await auth.api.getSession({ headers })).not.toBeNull();
    expect((await auth.handler(new Request(`${base}/api/auth/sign-out`, { method: 'POST', headers }))).status).toBe(200);
    expect(await auth.api.getSession({ headers })).toBeNull();
  });
  it('the checked-in schema matches the pinned auth library', async () => {
    const plan = await getMigrations(auth.options);
    expect(plan.toBeCreated).toEqual([]); expect(plan.toBeAdded).toEqual([]); expect(plan.toBeAddedIndexes).toEqual([]);
  });
});
