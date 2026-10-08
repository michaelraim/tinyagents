import { digest, token } from '../shared/security';
import { timeZoneSchema } from '../shared/clock';
import { ensureOwnedOffice, ownedOffice, type AccountEnv, type Session } from './accounts';

export const pairingCodePattern = /^[A-F0-9]{12}$/;
type Pairing = { deviceHash: string; code: string; name: string; provider: string; timeZone: string; expiresAt: number; userId: string | null; officeId: string | null; connectedAt: number | null };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
// Re-derive only during the short pairing window. D1 never stores a usable key.
// Domain separation keeps this key unrelated to Better Auth session signing.
async function connectionKey(env: AccountEnv, deviceHash: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.BETTER_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('tinyagents:device-connection:v1:' + deviceHash));
  return [...new Uint8Array(signature)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function pairingRoute(request: Request, env: AccountEnv, session: Session | null): Promise<Response> {
  const url = new URL(request.url), route = url.pathname;
  if (route === '/api/pairing/start' && request.method === 'POST') {
    const body = await request.json() as { name?: unknown; provider?: unknown; timeZone?: unknown };
    const zone = timeZoneSchema.safeParse(body.timeZone);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60 || !['codex', 'claude', 'both'].includes(String(body.provider)) || !zone.success) return json({ error: 'Invalid computer details.' }, 400);
    const deviceSecret = token(), deviceHash = await digest(deviceSecret), code = token().slice(0, 12).toUpperCase(), expiresAt = Date.now() + 15 * 60_000;
    await env.AUTH_DB.prepare('DELETE FROM device_pairing WHERE expiresAt < ?').bind(Date.now()).run();
    await env.AUTH_DB.prepare('INSERT INTO device_pairing (deviceHash, code, name, provider, timeZone, expiresAt) VALUES (?, ?, ?, ?, ?, ?)').bind(deviceHash, code, body.name.trim(), body.provider, zone.data, expiresAt).run();
    return json({ deviceSecret, code, expiresAt, verificationUrl: `${url.origin}/connect?code=${code}`, interval: 5 }, 201);
  }
  const browser = route === '/api/pairing' || route === '/api/pairing/approve';
  if (browser && !session) return json({ error: 'Sign in to connect this computer.' }, 401);
  if (browser && request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return json({ error: 'Origin not allowed' }, 403);
  const body = request.method === 'POST' ? await request.json() as { code?: unknown; deviceSecret?: unknown } : {};
  const code = request.method === 'GET' ? url.searchParams.get('code') : body.code;
  if (browser ? !pairingCodePattern.test(String(code)) : !/^[a-f0-9]{64}$/.test(String(body.deviceSecret))) return json({ error: 'Invalid connection request.' }, 400);
  const hash = browser ? '' : await digest(String(body.deviceSecret));
  const row = await env.AUTH_DB.prepare(browser ? 'SELECT * FROM device_pairing WHERE code = ?' : 'SELECT * FROM device_pairing WHERE deviceHash = ?').bind(browser ? code : hash).first<Pairing>();
  if (!row || row.expiresAt <= Date.now()) return json({ error: 'This link has expired. Ask your coding agent to connect tinyAGENTS again.' }, 410);
  if (browser && row.userId && row.userId !== session!.user.id) return json({ error: 'This computer was approved by a different account.' }, 409);
  if (route === '/api/pairing' && request.method === 'GET') return json({ name: row.name, provider: row.provider, expiresAt: row.expiresAt, status: row.connectedAt ? 'connected' : row.officeId ? 'approved' : 'pending' });
  if (route === '/api/pairing/approve' && request.method === 'POST') {
    // Claim atomically before issuing anything; two accounts cannot approve one request.
    const claimed = await env.AUTH_DB.prepare('UPDATE device_pairing SET userId = ? WHERE code = ? AND expiresAt > ? AND (userId IS NULL OR userId = ?)').bind(session!.user.id, code, Date.now(), session!.user.id).run();
    if (!claimed.meta.changes) return json({ error: 'This request is no longer available.' }, 409);
    if (!row.officeId) {
      const officeId = await ensureOwnedOffice(env, session!.user.id, row.timeZone);
      const stub = env.OFFICES.get(env.OFFICES.idFromName(officeId));
      if (!await stub.installConnection(row.deviceHash, row.name, await digest(await connectionKey(env, row.deviceHash)))) return json({ error: 'Remove an old computer from your account first (20 maximum).' }, 409);
      await env.AUTH_DB.prepare('UPDATE device_pairing SET officeId = ? WHERE deviceHash = ? AND userId = ?').bind(officeId, row.deviceHash, session!.user.id).run();
    }
    return json({ status: 'approved' });
  }
  if (['/api/pairing/poll', '/api/pairing/finish'].includes(route) && request.method === 'POST') {
    if (!row.officeId || !row.userId) return json({ status: 'pending' });
    // Deleted offices and revoked computers must never be restored by a retry.
    if (await ownedOffice(env, row.userId) !== row.officeId || !await env.OFFICES.get(env.OFFICES.idFromName(row.officeId)).hasConnection(row.deviceHash)) return json({ error: 'This connection was removed. Start a new connection.' }, 410);
    if (route === '/api/pairing/finish') {
      await env.AUTH_DB.prepare('UPDATE device_pairing SET connectedAt = ? WHERE deviceHash = ?').bind(Date.now(), row.deviceHash).run();
      return json({ status: 'connected' });
    }
    return json({ status: 'approved', config: { endpoint: `${url.origin}/api/events`, officeId: row.officeId, ingestKey: await connectionKey(env, row.deviceHash) } });
  }
  return json({ error: 'Not found' }, 404);
}
