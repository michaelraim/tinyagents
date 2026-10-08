import type { Agent } from '../../shared/protocol';
import { fx, floatText, touchFx } from './fx';
import type { GameEvent, GameEventKind } from './game';
import type { World } from './sim';

/**
 * Random office life. Clearly cosmetic (labelled "office life" in the HUD): it never
 * says anything about the real work. It exists so the office feels inhabited between
 * the real events, the way a management sim keeps something happening on screen.
 */
type Ctx = { world: World; agents: Agent[]; daylight: number; emit: (event: GameEvent) => void };

let serial = 0;
const event = (kind: GameEventKind, icon: string, title: string, detail?: string, extra: Partial<GameEvent> = {}): GameEvent =>
  ({ id: `life-${kind}-${serial++}`, kind, at: Date.now(), icon, title, detail, tone: 'fun', cosmetic: true, ...extra });
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function cafeTablePoint(world: World) {
  const cafe = world.plan.rooms.find(r => r.kind === 'cafe');
  if (!cafe) return undefined;
  const inward = -cafe.side;
  return { x: cafe.x - cafe.w / 2 + 2.2 - 0.9, z: cafe.z + inward * 1.2 + 0.9 * inward, facing: Math.PI / 2 };
}

const happenings: Record<string, { weight: number; when?: (c: Ctx) => boolean; run: (c: Ctx) => void }> = {
  pizza: {
    weight: 3, when: c => c.agents.length >= 3,
    run: ({ world, emit }) => {
      const p = cafeTablePoint(world);
      if (!p) return;
      world.summon('npc:courier', p.x, p.z, p.facing, 'pizza', 4);
      setTimeout(() => {
        fx.pizzaUntil = performance.now() + 70_000; touchFx();
        const n = world.gatherAtCafe(['🍕!!', 'PIZZA!', 'free food?!', 'pepperoni 😍', 'save me a slice']);
        emit(event('pizza', '🍕', 'Pizza delivery!', n ? `${n} hungry coworkers rush to the café` : 'The café smells amazing'));
      }, 6000);
    },
  },
  birthday: {
    weight: 1, when: c => c.agents.length >= 2,
    run: ({ world, agents, emit }) => {
      const star = pick(agents);
      fx.cakeUntil = performance.now() + 60_000; touchFx();
      world.gatherAtCafe(['🎂 happy birthday!', '🎉🎉', 'cake!!', `go ${star.name}!`]);
      const body = world.bodies.get(star.key);
      if (body) { world.react(star.key, 'cheer', performance.now()); floatText('🎂 +1 year', body.x, body.z, '#ff9ad8'); }
      emit(event('birthday', '🎂', `It's ${star.name}'s birthday!`, 'Cake in the café. Make a wish.'));
    },
  },
  'coffee-broken': {
    weight: 2, when: () => !fx.coffeeBroken,
    run: ({ world, emit }) => {
      fx.coffeeBroken = true; world.closed.add('coffee'); touchFx();
      emit(event('coffee-broken', '😱', 'The coffee machine broke!', 'Productivity at risk. Someone fix it.', { tone: 'bad' }));
      setTimeout(() => {
        const cafe = world.plan.rooms.find(r => r.kind === 'cafe');
        const fixer = [...world.bodies.values()].find(b => !b.npc && b.phase !== 'gone' && (b.mood === 'break' || b.phase === 'at-spot'));
        const finish = (name?: string) => {
          fx.coffeeBroken = false; world.closed.delete('coffee'); touchFx();
          emit(event('coffee-fixed', '🔧', name ? `${name} fixed the coffee machine!` : 'Coffee machine is back!', 'Crisis averted. ☕', { tone: 'good' }));
        };
        if (!cafe || !fixer) { finish(); return; }
        const s = cafe.side, back = cafe.z + s * cafe.d / 2;
        const x = cafe.x - (cafe.w - 2.4) / 2 + 0.43, z = back - s * 1.4;
        world.visit(fixer.key, x, z, s > 0 ? 0 : Math.PI, 'pace', 7);
        world.say(fixer, pick(['I can fix it 🔧', 'hold my mug', 'have you tried turning it off and on?']), performance.now(), 'emote');
        setTimeout(() => finish(world.bodies.get(fixer.key) ? nameOf(fixer.key) : undefined), 11000);
      }, 40_000);
    },
  },
  rain: {
    weight: 2, when: () => !fx.raining,
    run: ({ emit }) => {
      fx.raining = true; touchFx();
      emit(event('rain', '🌧️', 'Rain outside', 'Perfect weather for shipping code.'));
      setTimeout(() => { fx.raining = false; touchFx(); }, 90_000);
    },
  },
  flicker: {
    weight: 1, when: c => c.daylight < 0.4,
    run: ({ world, emit }) => {
      fx.flickerUntil = performance.now() + 2600;
      // A few startled voices, not a chorus.
      const people = [...world.bodies.values()].filter(b => !b.npc && b.phase !== 'gone').sort(() => Math.random() - 0.5).slice(0, 4);
      for (const b of people) world.say(b, pick(['😨', 'uh oh', 'did we save?!', '⚡?']), performance.now(), 'emote');
      emit(event('flicker', '⚡', 'The lights flickered…', 'Everyone checks if their work was saved.'));
    },
  },
  cat: {
    weight: 2, when: () => !fx.cat,
    run: ({ world, emit }) => {
      fx.cat = true; touchFx();
      const wander = () => {
        if (!fx.cat) return;
        const spots = world.plan.spots;
        const target = pick(spots);
        if (!world.bodies.get('npc:cat')) world.summon('npc:cat', target.x, target.z, target.facing, undefined, 9999);
        else world.visit('npc:cat', target.x + (Math.random() - 0.5), target.z + (Math.random() - 0.5), Math.random() * 6, 'idle', 9999);
        setTimeout(wander, 9000 + Math.random() * 6000);
      };
      wander();
      emit(event('cat', '🐈', 'A cat wandered into the office', 'Click it. You know you want to.'));
      setTimeout(() => {
        fx.cat = false; touchFx();
        const cat = world.bodies.get('npc:cat');
        if (cat) { cat.dwell = 0; cat.timer = 1; }
      }, 150_000);
    },
  },
  duck: {
    weight: 2, when: c => c.agents.length >= 2,
    run: ({ world, emit }) => {
      const free = [...world.bodies.values()].filter(b => !b.npc && b.phase !== 'gone' && b.mood === 'break').slice(0, 2);
      const board = world.plan.spots.find(s => s.kind === 'whiteboard');
      if (free.length < 2 || !board) return;
      free.forEach((b, i) => world.visit(b.key, board.x + (i ? 0.5 : -0.5), board.z, board.facing, 'chat', 14));
      emit(event('duck', '🦆', 'Rubber duck debugging session', `${nameOf(free[0].key)} and ${nameOf(free[1].key)} explain things to a duck.`));
    },
  },
};

let names = new Map<string, string>();
const nameOf = (key: string) => names.get(key) ?? 'Someone';

export class Occurrences {
  private next = performance.now() + 25_000;
  tick(c: Ctx) {
    names = new Map(c.agents.map(a => [a.key, a.name]));
    const now = performance.now();
    if (now < this.next || !c.agents.length) return;
    this.next = now + 55_000 + Math.random() * 65_000;
    const options = Object.values(happenings).filter(h => !h.when || h.when(c));
    const total = options.reduce((n, h) => n + h.weight, 0);
    let roll = Math.random() * total;
    for (const h of options) { roll -= h.weight; if (roll <= 0) { h.run(c); break; } }
  }
  /** For the demo and testing: trigger one by name. */
  trigger(kind: string, c: Ctx) { happenings[kind]?.run(c); }
}
