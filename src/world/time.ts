/** Local hour (with fractions) in a time zone, falling back to the viewer's clock. */
export function localHour(now: number, timeZone?: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(now));
    const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0), m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
    return h + m / 60;
  } catch {
    const d = new Date(now);
    return d.getHours() + d.getMinutes() / 60;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 0 at night, 1 in full daylight, easing through dawn (6–8) and dusk (18–20). */
export function daylightAt(hour: number) {
  if (hour >= 8 && hour <= 18) return 1;
  if (hour > 6 && hour < 8) return smooth((hour - 6) / 2);
  if (hour > 18 && hour < 20) return smooth(1 - (hour - 18) / 2);
  return 0;
}

export function clockLabel(now: number, timeZone?: string) {
  try {
    const date = new Date(now);
    const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
    const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
    return { day, time };
  } catch {
    return { day: '', time: '' };
  }
}
