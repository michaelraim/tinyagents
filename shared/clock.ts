import { z } from 'zod';

const validZones = new Map<string, boolean>();
export function validTimeZone(value: string): boolean {
  const known=validZones.get(value);if(known!==undefined)return known;
  let valid=false;try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); valid=true; } catch { /* Invalid IANA name. */ }
  if(validZones.size<512)validZones.set(value,valid);return valid;
}
export const timeZoneSchema = z.string().min(1).max(80).refine(validTimeZone, 'Choose a valid IANA time zone.');
export const clockSettingsSchema = z.object({ timeZone: timeZoneSchema }).strict();
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localTimeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
export function officeClock(timeZone: string | undefined, now: number) {
  const zone = timeZone && validTimeZone(timeZone) ? timeZone : 'UTC';
  let formatter = formatters.get(zone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); formatters.set(zone, formatter); }
  const parts = formatter.formatToParts(now), hour = Number(parts.find(p=>p.type==='hour')?.value), minute = Number(parts.find(p=>p.type==='minute')?.value);
  const hours = hour + minute / 60;
  const daylight = Math.min(1, Math.max(0, (hours - 5.5) / 1.5), Math.max(0, (19.5 - hours) / 2));
  const phase = hours < 5.5 || hours >= 19.5 ? 'Night shift' : hours < 7 ? 'Sunrise' : hours >= 17.5 ? 'Golden hour' : 'Day shift';
  return { timeZone: zone, time: formatter.format(now), place: zone.split('/').pop()!.replaceAll('_', ' '), daylight, phase, icon: daylight < .25 ? '🌙' : daylight < .85 ? '🌅' : '☀️' };
}
