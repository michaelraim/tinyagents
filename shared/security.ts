import { z } from 'zod';
import { eventSchema } from './protocol.ts';
export const batchSchema = z.object({ events: z.array(eventSchema).min(1).max(20) }).strict();
export const officeIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function digest(secret: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function token(): string { return [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join(''); }
export async function matches(secret: string, expected: string): Promise<boolean> {
  if (secret.length > 256 || !expected) return false;
  const actual = await digest(secret);
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  return diff === 0;
}
export async function canView(secret: string, record: { viewerHash: string; ownerHash?: string }): Promise<boolean> {
  return await matches(secret, record.viewerHash) || await matches(secret, record.ownerHash ?? '');
}
export function viewerCookie(officeId: string, key: string, secure: boolean): string {
  return `sidequest=${officeId}.${key}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=2592000${secure ? '; Secure' : ''}`;
}
export function viewerFromCookie(cookie: string, officeId: string): string {
  const value = cookie.split(';').map(v => v.trim()).find(v => v.startsWith('sidequest='))?.slice(10) ?? '';
  const [id, key] = value.split('.');
  return id === officeId ? key ?? '' : '';
}
export function validEventTime(at: number, now = Date.now()): boolean { return at <= now + 60_000 && at >= now - 7 * 24 * 3600_000; }
