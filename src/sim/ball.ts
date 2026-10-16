// Your rubber band ball: spare bands wound onto a ball on your desk.
//
// It turns up early in the war (a few spare bands knotted together) and you grow it by
// tapping it: each tap winds on a quarter of your loose bands. It grows through four
// sizes, and each size is a permanent perk. Bands you wind on are gone for good, so
// there's a choice: keep them for the war (and the Barrage), or wind them on.
//
// The Barrage itself lives in the engine with the rest of the shooting.

import { chatEvent } from './chat';
import { BALL } from './content';
import { pushTicker, type GameState } from './state';

/** Has the ball turned up on your desk yet? */
export function ballUnlocked(s: GameState) {
  return s.ball?.found || s.stage >= 2 || s.targetIndex >= BALL.unlockTarget;
}

/** How many sizes the ball has reached (0: just a knot of bands, 4: The Monster). */
export function ballSize(s: GameState) {
  const wound = s.ball?.wound ?? 0;
  let n = 0;
  for (const z of BALL.sizes) if (wound >= z.at) n++;
  return n;
}

/** The size it's growing toward, or null once it's The Monster. */
export function nextBallSize(s: GameState) {
  return BALL.sizes[ballSize(s)] ?? null;
}

/** How far along to the next size (0 to 1; 1 once it's as big as it gets). */
export function ballProgress(s: GameState) {
  const i = ballSize(s);
  const next = BALL.sizes[i];
  if (!next) return 1;
  const from = i > 0 ? BALL.sizes[i - 1].at : 0;
  return Math.min(1, Math.max(0, (s.ball.wound - from) / (next.at - from)));
}

/** Bands one tap winds on right now. */
export function windAmount(s: GameState) {
  const have = Math.floor(s.bands);
  if (have <= 0) return 0;
  return Math.min(have, Math.max(BALL.windMin, Math.floor(have * BALL.windShare)));
}

export type WindResult = { ok: true; amount: number; size: number; grew: boolean } | { ok: false; reason: string };

/** Wind some of your loose bands onto the ball. */
export function wind(s: GameState): WindResult {
  if (!ballUnlocked(s)) return { ok: false, reason: 'You don’t have a rubber band ball yet.' };
  const amount = windAmount(s);
  if (amount <= 0) return { ok: false, reason: 'No loose bands to wind on. Scrounge your drawer or order supplies.' };
  const before = ballSize(s);
  s.bands -= amount;
  s.ball.wound += amount;
  s.stats.winds = (s.stats.winds ?? 0) + amount;
  const size = ballSize(s);
  const grew = size > before;
  s.events.push({ type: 'wound', amount, size, grew });
  if (grew) {
    const z = BALL.sizes[size - 1];
    pushTicker(s, size === 4 ? `Your rubber band ball has become The Monster. ${z.why} ${z.perk}.` : `Your rubber band ball is the size of a ${z.name.toLowerCase()} now. ${z.why} ${z.perk}.`);
    chatEvent(s, `ball:${size}`);
  }
  return { ok: true, amount, size, grew };
}

/** The ball turns up on your desk (once). */
export function stepBall(s: GameState) {
  if (s.ball.found || !ballUnlocked(s)) return;
  s.ball.found = true;
  s.events.push({ type: 'ballReady' });
  pushTicker(s, 'You knot a few spare bands together. It’s the start of a rubber band ball.');
}

// ------------------------------------------------------------------ perks

/** Golf ball: Suspicion cools faster. */
export const ballCoolMult = (s: GameState) => (ballSize(s) >= 1 ? BALL.cool : 1);
/** Softball: Barrages throw twice as many bands. */
export const ballBarrageMult = (s: GameState) => (ballSize(s) >= 2 ? 2 : 1);
/** Basketball: your team works faster. */
export const ballTeamMult = (s: GameState) => (ballSize(s) >= 3 ? BALL.team : 1);
/** The Monster: everything you earn is worth more. */
export const ballPayMult = (s: GameState) => (ballSize(s) >= 4 ? BALL.pay : 1);
