import { dayKey, emptyGame, type GameState } from '../../shared/game';
export * from '../../shared/game';

/**
 * Local game state for the demo and for visits. A connected office keeps its economy in
 * Cloudflare (see useGame); only the cosmetic moods are cached here.
 */
export function loadGame(officeKey: string, now = Date.now()): GameState {
  try {
    const saved = JSON.parse(localStorage.getItem(`ta.game.${officeKey}`) ?? 'null') as GameState | null;
    // The demo starts rich so visitors can try the shop.
    if (!saved) return { ...emptyGame(now), coins: officeKey === 'demo' ? 500 : 120 };
    saved.unlocked ??= [];
    return saved.day === dayKey(now) ? saved : { ...saved, day: dayKey(now), today: emptyGame(now).today };
  } catch { return emptyGame(now); }
}
export function saveGame(officeKey: string, game: GameState) {
  try { localStorage.setItem(`ta.game.${officeKey}`, JSON.stringify(game)); } catch { /* Storage may be disabled. */ }
}
