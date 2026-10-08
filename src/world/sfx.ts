/**
 * Tiny synthesized sound effects (no audio files). Off until the viewer turns
 * sound on; browsers also require a click before audio may play.
 */
let ctx: AudioContext | null = null;
let enabled = (() => { try { return localStorage.getItem('ta.sound') === 'on'; } catch { return false; } })();

export const soundEnabled = () => enabled;
export function setSound(on: boolean) {
  enabled = on;
  try { localStorage.setItem('ta.sound', on ? 'on' : 'off'); } catch { /* ignore */ }
  if (on) audio();
}

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, length: number, type: OscillatorType = 'square', volume = 0.06, slide = 0) {
  const a = audio();
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime + start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + start + length);
  gain.gain.setValueAtTime(0.0001, a.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, a.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + length);
  osc.connect(gain).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + length + 0.02);
}

export type Sfx = 'coin' | 'star' | 'ring' | 'snag' | 'pop' | 'fanfare' | 'click' | 'whoosh' | 'meow' | 'purr' | 'zap';

export function play(sfx: Sfx) {
  if (!enabled) return;
  try {
    switch (sfx) {
      case 'coin': tone(988, 0, 0.08); tone(1319, 0.07, 0.18); break;
      case 'star': tone(784, 0, 0.1, 'triangle', 0.08); tone(1047, 0.08, 0.1, 'triangle', 0.08); tone(1568, 0.16, 0.25, 'triangle', 0.07); break;
      case 'ring': for (let i = 0; i < 4; i++) { tone(1400, i * 0.12, 0.05, 'square', 0.04); tone(1750, i * 0.12 + 0.05, 0.05, 'square', 0.04); } break;
      case 'snag': tone(220, 0, 0.18, 'sawtooth', 0.05, -80); tone(165, 0.16, 0.3, 'sawtooth', 0.05, -60); break;
      case 'pop': tone(520, 0, 0.09, 'sine', 0.09, 400); break;
      case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, i === 3 ? 0.4 : 0.1, 'square', 0.05)); break;
      case 'click': tone(1800, 0, 0.03, 'square', 0.03); break;
      case 'whoosh': tone(300, 0, 0.25, 'triangle', 0.04, 600); break;
      case 'meow': tone(700, 0, 0.25, 'sine', 0.06, 300); tone(900, 0.18, 0.2, 'sine', 0.05, -400); break;
      case 'purr': for (let i = 0; i < 6; i++) tone(60, i * 0.08, 0.06, 'sawtooth', 0.03); break;
      case 'zap': tone(1200, 0, 0.12, 'sawtooth', 0.04, -1000); break;
    }
  } catch { /* Audio is best-effort. */ }
}
