import type { Office } from './index';
import { createAuth, providers, type AuthEnv } from './auth';
import { digest, officeIdPattern, token } from '../shared/security';
import { timeZoneSchema } from '../shared/clock';

export type Session = NonNullable<Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>>;
type AccountEnv = AuthEnv & { OFFICES: DurableObjectNamespace<Office> };
export const accountHeader = 'X-Tinyagents-Account';
export const sessionHeader = 'X-Tinyagents-Session';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function ownedOffice(env: AuthEnv, userId: string) {
  return (await env.AUTH_DB.prepare('SELECT officeId FROM office_owner WHERE userId = ?').bind(userId).first<{officeId: string}>())?.officeId ?? null;
}
export async function accountRoute(request: Request, env: AccountEnv, session: Session | null): Promise<Response> {
  const url = new URL(request.url);
  const officeId = session ? await ownedOffice(env, session.user.id) : null;
  if (request.method === 'GET' && url.pathname === '/api/account') {
    return json({ providers: providers(env), user: session ? { name: session.user.name, email: session.user.email } : null, officeId });
  }
  if (!session) return json({ error: 'Sign in to manage your office.' }, 401);
  // Account mutations use cookies, so they must originate on this website.
  if (request.headers.get('Origin') !== url.origin) return json({ error: 'Origin not allowed' }, 403);
  if (request.method === 'POST' && url.pathname === '/api/account/office') {
    const body = await request.json() as { timeZone?: unknown; officeId?: unknown; ownerKey?: unknown };
    if (body.officeId !== undefined) {
      if (!officeIdPattern.test(String(body.officeId)) || typeof body.ownerKey !== 'string') return json({ error: 'Choose your original owner recovery file.' }, 400);
      if (officeId && officeId !== body.officeId) return json({ error: 'This account already has an office. Sign out to choose a different account.' }, 409);
      const stub = env.OFFICES.get(env.OFFICES.idFromName(String(body.officeId)));
      if (!await stub.proveOwner(body.ownerKey)) return json({ error: 'The owner recovery file is required. Viewer access cannot claim an office.' }, 403);
      await env.AUTH_DB.prepare('INSERT OR IGNORE INTO office_owner (userId, officeId, createdAt) VALUES (?, ?, ?)').bind(session.user.id, body.officeId, Date.now()).run();
      if (await ownedOffice(env, session.user.id) !== body.officeId) return json({ error: 'This office is already attached to another account.' }, 409);
      return json({ officeId: body.officeId });
    }
    const zone = timeZoneSchema.safeParse(body.timeZone);
    if (!zone.success) return json({ error: 'Choose a valid time zone.' }, 400);
    // Reserve the ID first. Concurrent tabs converge on the same record, and
    // retrying after a failed initialization is safe.
    await env.AUTH_DB.prepare('INSERT OR IGNORE INTO office_owner (userId, officeId, createdAt) VALUES (?, ?, ?)').bind(session.user.id, crypto.randomUUID(), Date.now()).run();
    const id = (await ownedOffice(env, session.user.id))!;
    await env.OFFICES.get(env.OFFICES.idFromName(id)).ensureAccountOffice(zone.data);
    return json({ officeId: id });
  }
  if (request.method === 'DELETE' && url.pathname === '/api/account') {
    if (officeId) await env.OFFICES.get(env.OFFICES.idFromName(officeId)).deleteOwnedOffice();
    // Session/account rows and the ownership mapping cascade with the user.
    const signOutHeaders = new Headers(request.headers); signOutHeaders.set('Content-Type', 'application/json');
    const signedOut = await createAuth(env).handler(new Request(new URL('/api/auth/sign-out', url), { method: 'POST', headers: signOutHeaders, body: '{}' }));
    if (!signedOut.ok) return json({ error: 'Sign out failed. Try deleting again.' }, 503);
    await env.AUTH_DB.prepare('DELETE FROM "user" WHERE id = ?').bind(session.user.id).run();
    const headers = new Headers(signedOut.headers);
    headers.append('Set-Cookie', 'sidequest=; HttpOnly; SameSite=Strict; Secure; Path=/api; Max-Age=0');
    return new Response(JSON.stringify({ ok: true }), { headers });
  }
  return json({ error: 'Not found' }, 404);
}
export async function newOfficeSecrets() {
  return Promise.all([digest(token()), digest(token()), digest(token())]);
}
