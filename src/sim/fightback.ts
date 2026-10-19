// Bosses fight back. Every half a minute or so, whoever you're fighting winds up and throws
// something at you: a stress ball, a mug, a stapler, a binder... You get a moment's warning.
//
//   Duck in time    it sails past, and your next flick is Payback: three times as hard
//                   (five if you ducked at the last moment). Payback waits a few seconds.
//   Too slow        it hits you: you see stars for a couple of seconds (no flicking), your
//                   streak ends, and the clatter adds a little Suspicion.
//   Paper airplane  now and then it's a paper airplane instead, drifting across the office:
//                   catch it for a Perfect Payback and the bands taped to it. Miss it and
//                   nothing happens.
//
// Nobody throws anything while you're at your computer (you'd be hiding), during a walk-by,
// or in a Fire Drill (everyone's outside). Being at your computer when it lands also works.

import { rand, randRange } from './rng';
import { mods } from './mods';
import { chaosOn } from './chaos';
import { streakEnd } from './feel';
import { currentTarget, pushTicker, type GameState } from './state';

export type Throwable = 'ball' | 'mug' | 'stapler' | 'binder' | 'package' | 'keyboard' | 'calculator' | 'gavel' | 'toothbrush' | 'bottle' | 'plane';

export const FIGHTBACK = {
  first: 75, // seconds into a job before the first
  gap: [24, 40] as [number, number],
  windup: 1.8, // seconds from the warning to it landing
  late: 0.5, // duck in the last this-many seconds for a Perfect dodge
  plane: 0.22, // chance it's a paper airplane instead
  planeSeconds: 3,
  planeBands: 60, // seconds of your bands per second, taped to it (at least 100)
  payback: 3,
  perfect: 5,
  paybackSeconds: 6,
  stun: 2.5,
  noise: 4,
};

/** What each boss throws (a couple each, picked at random). */
const THROWS: Record<string, Throwable[]> = {
  gary: ['ball', 'stapler'],
  brad: ['mug', 'ball'],
  printer: ['stapler', 'package'],
  taskforce: ['binder', 'calculator'],
  rick: ['binder', 'mug'],
  it: ['keyboard', 'stapler'],
  accounting: ['calculator', 'binder'],
  mailroom: ['package', 'stapler'],
  marketing: ['ball', 'mug'],
  breakroom: ['mug', 'mug'],
  conference: ['binder', 'stapler'],
  hr: ['binder', 'binder'],
  law: ['gavel', 'binder'],
  dental: ['toothbrush', 'mug'],
  startup: ['bottle', 'keyboard'],
};

export const THROW_NAME: Record<Throwable, string> = {
  ball: 'a stress ball',
  mug: 'a coffee mug',
  stapler: 'a stapler',
  binder: 'a binder',
  package: 'a parcel',
  keyboard: 'a keyboard',
  calculator: 'a calculator',
  gavel: 'a gavel',
  toothbrush: 'an electric toothbrush',
  bottle: 'a kombucha bottle',
  plane: 'a paper airplane',
};

export interface FightbackState {
  nextAt: number;
  /** Something on its way: what, and when it lands (or flies off, for a plane). */
  incoming: { what: Throwable; at: number; from: number } | null;
  /** Your next flick is Payback (times this) until then. */
  payback: { mult: number; until: number } | null;
  stunUntil: number;
}

export function newFightback(): FightbackState {
  return { nextAt: FIGHTBACK.first, incoming: null, payback: null, stunUntil: 0 };
}

export type FightResult = { ok: true; text: string } | { ok: false; reason: string };

function who(s: GameState) {
  const t = currentTarget(s);
  if (!t) return null;
  return t.stage === 1 ? 'gary' : t.id;
}

/** Can anyone throw something at you right now? */
function canThrow(s: GameState) {
  return !!currentTarget(s) && !s.lookBusy && s.walkby.arrivesAt === null && chaosOn(s) !== 'drill' && !s.feeney?.inside;
}

export function stepFightback(s: GameState) {
  const f = s.fightback;
  if (!f) return;
  if (f.payback && s.time >= f.payback.until) f.payback = null;
  const inc = f.incoming;
  if (inc) {
    if (s.time < inc.at) return;
    f.incoming = null;
    f.nextAt = s.time + randRange(s, FIGHTBACK.gap[0], FIGHTBACK.gap[1]);
    if (inc.what === 'plane') {
      s.events.push({ type: 'thrown', what: inc.what, result: 'gone' });
      return;
    }
    // At your computer (or the target's gone): it sails over your head.
    if (s.lookBusy || !currentTarget(s)) {
      s.events.push({ type: 'thrown', what: inc.what, result: 'missed' });
      return;
    }
    f.stunUntil = s.time + FIGHTBACK.stun;
    streakEnd(s);
    // The clatter: a little noise (never enough on its own to get you called in).
    const add = Math.min(FIGHTBACK.noise, Math.max(0, 99 - s.suspicion));
    s.suspicion += add;
    s.stats.thrownHit = (s.stats.thrownHit ?? 0) + 1;
    s.events.push({ type: 'thrown', what: inc.what, result: 'hit' });
    pushTicker(s, `${capital(THROW_NAME[inc.what])} bounces off your head. You see stars.`);
    return;
  }
  if (s.time < f.nextAt) return;
  if (!canThrow(s)) {
    // Try again soon after whatever's in the way is over.
    f.nextAt = s.time + 5;
    return;
  }
  const boss = who(s)!;
  const plane = rand(s) < FIGHTBACK.plane;
  const pool = THROWS[boss] ?? ['ball', 'stapler'];
  const what: Throwable = plane ? 'plane' : pool[Math.floor(rand(s) * pool.length) % pool.length];
  f.incoming = { what, from: s.time, at: s.time + (plane ? FIGHTBACK.planeSeconds : FIGHTBACK.windup) };
  s.events.push({ type: 'incoming', what });
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Duck (or catch the paper airplane). */
export function duck(s: GameState): FightResult {
  const f = s.fightback;
  const inc = f?.incoming;
  if (!inc) return { ok: false, reason: '' };
  f.incoming = null;
  f.nextAt = s.time + randRange(s, FIGHTBACK.gap[0], FIGHTBACK.gap[1]);
  if (inc.what === 'plane') {
    const bands = Math.round(Math.max(100, mods(s).bandsPerSec * FIGHTBACK.planeBands));
    s.bands += bands;
    f.payback = { mult: FIGHTBACK.perfect, until: s.time + FIGHTBACK.paybackSeconds };
    s.stats.planes = (s.stats.planes ?? 0) + 1;
    s.events.push({ type: 'thrown', what: inc.what, result: 'caught' });
    return { ok: true, text: `Caught it! ${bands.toLocaleString('en-US')} bands taped inside, and your next flick is a ×${FIGHTBACK.perfect} Payback.` };
  }
  const perfect = inc.at - s.time <= FIGHTBACK.late;
  const mult = perfect ? FIGHTBACK.perfect : FIGHTBACK.payback;
  f.payback = { mult, until: s.time + FIGHTBACK.paybackSeconds };
  s.stats.dodges = (s.stats.dodges ?? 0) + 1;
  if (perfect) s.stats.perfectDodges = (s.stats.perfectDodges ?? 0) + 1;
  s.events.push({ type: 'thrown', what: inc.what, result: perfect ? 'perfect' : 'dodged' });
  return { ok: true, text: `${perfect ? 'Perfect dodge!' : 'Dodged!'} Your next flick is a ×${mult} Payback.` };
}

/** Seeing stars: no flicking for a moment. */
export function stunned(s: GameState) {
  return s.time < (s.fightback?.stunUntil ?? 0);
}

/** Your next flick: Payback's multiplier (1 when there's none). */
export function paybackMult(s: GameState) {
  const p = s.fightback?.payback;
  return p && s.time < p.until ? p.mult : 1;
}

/** Your flick landed: Payback's spent. */
export function paybackUsed(s: GameState) {
  const f = s.fightback;
  if (!f?.payback || s.time >= f.payback.until) return;
  s.events.push({ type: 'payback', mult: f.payback.mult });
  f.payback = null;
}

/** Saves: nothing is mid-air when you load. */
export function fightbackForLoad(saved: Partial<FightbackState> | undefined, time: number): FightbackState {
  const f = { ...newFightback(), ...(saved ?? {}), incoming: null, payback: null, stunUntil: 0 };
  f.nextAt = typeof f.nextAt === 'number' && Number.isFinite(f.nextAt) ? Math.max(f.nextAt, time + 30) : time + FIGHTBACK.first;
  return f;
}
