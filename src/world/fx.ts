/**
 * Shared, mutable "office happenings" state. 3D components read it every frame;
 * the HUD subscribes for changes. Kept outside React so effects stay cheap.
 */
export type Floater = { id: number; text: string; x: number; z: number; color: string; at: number };

export const fx = {
  raining: false,
  flickerUntil: 0,
  coffeeBroken: false,
  pizzaUntil: 0,
  cakeUntil: 0,
  shakeUntil: 0,
  cat: false,
  /** Shop upgrade: neon strips cycle through the rainbow. */
  rainbow: false,
  floaters: [] as Floater[],
  version: 0,
};

const listeners = new Set<() => void>();
export function subscribeFx(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function touchFx() { fx.version++; for (const fn of listeners) fn(); }

let nextFloater = 1;
/** A number or emoji that pops up above someone and floats away ("+3 ⭐"). */
export function floatText(text: string, x: number, z: number, color = '#ffd23f') {
  fx.floaters = [...fx.floaters.filter(f => performance.now() - f.at < 2000), { id: nextFloater++, text, x, z, color, at: performance.now() }];
  touchFx();
}
export function shake(ms = 350) { fx.shakeUntil = performance.now() + ms; }
