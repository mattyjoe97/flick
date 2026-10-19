// Things that make flicking feel good (and reward actually playing):
//
//   Weak spots   every so often a bullseye pops up on whoever you're fighting for a few
//                seconds. Hit it and that flick lands five times as hard (at full stretch).
//   Hot streak   flicks that land one after another build a streak: from the second, each adds
//                2% damage, up to +30%. Three seconds without a hit, or your computer, ends it.

import { randRange } from './rng';
import { currentTarget, type GameState } from './state';

export const WEAK = { first: 20, gap: [20, 35] as [number, number], seconds: 3, mult: 5 };
export const STREAK = { gap: 3, per: 0.02, max: 15 }; // max: the bonus steps (so 16 hits in a row)

export interface WeakState {
  nextAt: number;
  /** On screen now: where (fractions of the office picture) and until when. */
  shown: { x: number; y: number; until: number } | null;
  /** The flick being thrown at it right now (set only during that flick). */
  boost: boolean;
}

export interface StreakState {
  n: number;
  lastAt: number;
}

export function newWeak(): WeakState {
  return { nextAt: WEAK.first, shown: null, boost: false };
}

export function newStreak(): StreakState {
  return { n: 0, lastAt: -99 };
}

/** Every step: a weak spot turns up now and then while you're at your desk in a fight. */
export function stepWeak(s: GameState) {
  const w = s.weak;
  if (!w) return;
  const fighting = !!currentTarget(s) && !s.lookBusy;
  if (w.shown) {
    if (s.time >= w.shown.until || !fighting) {
      w.shown = null;
      w.nextAt = s.time + randRange(s, WEAK.gap[0], WEAK.gap[1]);
      s.events.push({ type: 'weakGone' });
    }
    return;
  }
  if (!fighting || s.time < w.nextAt || s.walkby.arrivesAt !== null) return;
  w.shown = { x: randRange(s, 0.38, 0.62), y: randRange(s, 0.2, 0.42), until: s.time + WEAK.seconds };
  s.events.push({ type: 'weakSpawn' });
}

/** The extra damage on a flick thrown at a weak spot. */
export function weakMult(s: GameState) {
  return s.weak?.boost ? WEAK.mult : 1;
}

/** It was hit: gone until next time. */
export function weakHit(s: GameState, damage: number) {
  const w = s.weak;
  w.shown = null;
  w.nextAt = s.time + randRange(s, WEAK.gap[0], WEAK.gap[1]);
  s.stats.weakHits = (s.stats.weakHits ?? 0) + 1;
  s.events.push({ type: 'weakHit', damage });
}

/** Your streak right now (0 once it's gone cold). */
export function streakCount(s: GameState) {
  const st = s.streak;
  return st && !s.lookBusy && s.time - st.lastAt <= STREAK.gap ? st.n : 0;
}

export function streakMult(s: GameState) {
  return 1 + STREAK.per * Math.min(STREAK.max, Math.max(0, streakCount(s) - 1));
}

/** A flick of yours landed: the streak goes up one. */
export function streakHit(s: GameState) {
  const st = s.streak;
  if (!st) return;
  // Two hits in the same instant (a weak spot and a flick) count once.
  if (s.time - st.lastAt > 0.05) st.n = streakCount(s) + 1;
  st.lastAt = s.time;
  s.stats.bestStreak = Math.max(s.stats.bestStreak ?? 0, st.n);
  if (st.n === STREAK.max + 1) s.events.push({ type: 'streakMax' });
}

/** Going to your computer cools it off. */
export function streakEnd(s: GameState) {
  if (s.streak) s.streak.n = 0;
}
