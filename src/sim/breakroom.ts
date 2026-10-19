// The Break Room: somewhere to go that isn't your desk.
//
//   Coffee maker     pour a cup and you're Caffeinated for a minute and a half: your flicks
//                    reload faster and Suspicion cools faster. Then the pot takes a few
//                    minutes to brew again (half that once the room is yours).
//   Vending machine  a few minutes' pay buys a random snack, and every snack is a boost for
//                    a few minutes. Sometimes it gets stuck: shake the machine to get it
//                    loose (which is not quiet).
//   Corkboard        your résumé perks, bought with Reputation and kept forever, plus three
//                    that make the coffee and the snacks better.
//
// It opens in Stage 2 of your first job and from day one after that. In Stage 4 the Coffee
// Club barricades it until you take it from Gail.

import { rand } from './rng';
import { payGrade } from './work';
import { jobPayMult } from './job';
import { staffPayPerMin } from './staff';
import { perk, pushTicker, roomTaken, type GameState } from './state';

export type SnackId = 'pretzels' | 'gummies' | 'energy' | 'mints';

export const BREAK = {
  coffeeSeconds: 90,
  brewSeconds: 300,
  brewTaken: 0.5, // the pot brews this much faster once the room is yours
  reload: 1 / 1.5, // Caffeinated: your flicks reload 50% faster (in this much of the time)
  cool: 1.25, // and Suspicion cools this much faster
  snackSeconds: 180,
  snackMinutes: 3, // of your team's steady pay
  snackMin: 150, // times your pay grade
  stuckChance: 1 / 6,
  shakes: 3,
  shakeNoise: 3,
  // Corkboard perks, per level:
  mug: 30, // seconds longer Caffeinated
  beans: 0.8, // the pot brews in this much of the time
  change: { price: 0.2, seconds: 60 }, // snacks cost 20% less and last a minute longer
};

export const SNACKS: { id: SnackId; name: string; does: string }[] = [
  { id: 'pretzels', name: 'Pretzels', does: 'Your bands hit 30% harder.' },
  { id: 'gummies', name: 'Gummy Worms', does: 'Weak spots turn up twice as often.' },
  { id: 'energy', name: 'Energy Drink', does: 'The Barrage reloads twice as fast.' },
  { id: 'mints', name: 'Breath Mints', does: 'Your shots are 30% quieter.' },
];

export interface BreakState {
  /** When the pot is ready to pour. */
  coffeeAt: number;
  /** Caffeinated until. */
  coffeeUntil: number;
  snack: { id: SnackId; until: number } | null;
  /** A snack stuck in the machine: shake it loose. */
  stuck: { id: SnackId; shakes: number } | null;
  cups: number;
}

export function newBreak(): BreakState {
  return { coffeeAt: 0, coffeeUntil: -999, snack: null, stuck: null, cups: 0 };
}

export type BreakResult = { ok: true; text: string } | { ok: false; reason: string };

// ---------------------------------------------------------------- the room

/** Can you go in at all (the room exists for you yet)? */
export function breakUnlocked(s: GameState) {
  return s.stage >= 2 || (s.job?.runs ?? 0) >= 1;
}

/** The Coffee Club has barricaded it (Stage 4, until you take it). */
export function breakBarricaded(s: GameState) {
  return s.stage === 4 && !roomTaken(s, 'breakroom');
}

/** It's yours: you took it from Gail (or you're past that point in the war). */
export function breakYours(s: GameState) {
  return roomTaken(s, 'breakroom') || s.stage >= 5;
}

/** Why you can't go in right now (null when you can). */
export function breakClosed(s: GameState): string | null {
  if (!breakUnlocked(s)) return 'The break room is for people who’ve been here more than a week.';
  if (breakBarricaded(s)) return 'The Coffee Club has barricaded the break room. Take it from Gail first (the map, M).';
  if (s.walkby.arrivesAt !== null) return 'Not now: Mr. Feeney is coming. Get on your computer (Esc).';
  return null;
}

// ---------------------------------------------------------------- coffee

export function brewSeconds(s: GameState) {
  return BREAK.brewSeconds * Math.pow(BREAK.beans, perk(s, 'beans')) * (breakYours(s) ? BREAK.brewTaken : 1);
}

export function coffeeSeconds(s: GameState) {
  return BREAK.coffeeSeconds + BREAK.mug * perk(s, 'mug');
}

/** Seconds until the pot is ready (0: pour away). */
export function coffeeWait(s: GameState) {
  return Math.max(0, (s.breakroom?.coffeeAt ?? 0) - s.time);
}

export function coffeeReady(s: GameState) {
  return breakUnlocked(s) && !breakBarricaded(s) && coffeeWait(s) <= 0;
}

/** Seconds of Caffeinated left. */
export function caffeinated(s: GameState) {
  return Math.max(0, (s.breakroom?.coffeeUntil ?? -999) - s.time);
}

export function pourCoffee(s: GameState): BreakResult {
  const closed = breakClosed(s);
  if (closed) return { ok: false, reason: closed };
  const wait = coffeeWait(s);
  if (wait > 0) return { ok: false, reason: `The pot’s still brewing: ${Math.ceil(wait / 60)} min.` };
  const b = s.breakroom;
  b.coffeeUntil = s.time + coffeeSeconds(s);
  b.coffeeAt = s.time + brewSeconds(s);
  b.cups++;
  s.stats.cups = (s.stats.cups ?? 0) + 1;
  s.events.push({ type: 'coffee' });
  return { ok: true, text: `Caffeinated for ${Math.round(coffeeSeconds(s))} s: your flicks reload faster and Suspicion cools faster.` };
}

/** Caffeinated: your flicks reload in less time. */
export function coffeeReload(s: GameState) {
  return caffeinated(s) > 0 ? BREAK.reload : 1;
}

/** Caffeinated: Suspicion cools faster. */
export function coffeeCool(s: GameState) {
  return caffeinated(s) > 0 ? BREAK.cool : 1;
}

// ---------------------------------------------------------------- the vending machine

export function snackPrice(s: GameState) {
  const base = Math.max(BREAK.snackMin * payGrade(s).mult * jobPayMult(s), staffPayPerMin(s, true) * BREAK.snackMinutes);
  return Math.round(base * (1 - BREAK.change.price * perk(s, 'change')));
}

export function snackSeconds(s: GameState) {
  return BREAK.snackSeconds + BREAK.change.seconds * perk(s, 'change');
}

/** The snack you're on right now (null when none). */
export function snackOn(s: GameState): SnackId | null {
  const sn = s.breakroom?.snack;
  return sn && s.time < sn.until ? sn.id : null;
}

export function snackLeft(s: GameState) {
  const sn = s.breakroom?.snack;
  return sn ? Math.max(0, sn.until - s.time) : 0;
}

export const snackName = (id: SnackId) => SNACKS.find((x) => x.id === id)!.name;

function eat(s: GameState, id: SnackId): BreakResult {
  s.breakroom.snack = { id, until: s.time + snackSeconds(s) };
  s.stats.snacks = (s.stats.snacks ?? 0) + 1;
  s.events.push({ type: 'snack', id });
  const sn = SNACKS.find((x) => x.id === id)!;
  return { ok: true, text: `${sn.name}! ${sn.does} (${Math.round(snackSeconds(s) / 60)} min)` };
}

export function buySnack(s: GameState): BreakResult {
  const closed = breakClosed(s);
  if (closed) return { ok: false, reason: closed };
  const b = s.breakroom;
  if (b.stuck) return { ok: false, reason: `Your ${snackName(b.stuck.id)} is stuck. Shake the machine.` };
  const price = snackPrice(s);
  if (s.salary < price) return { ok: false, reason: `A snack costs $${price.toLocaleString('en-US')}.` };
  s.salary -= price;
  const id = SNACKS[Math.floor(rand(s) * SNACKS.length)].id;
  if (rand(s) < BREAK.stuckChance) {
    b.stuck = { id, shakes: 0 };
    s.events.push({ type: 'snackStuck', id });
    return { ok: true, text: `The ${snackName(id)} is stuck on the spiral. Shake the machine (it’s noisy)!` };
  }
  return eat(s, id);
}

/** Shake the machine: three good shakes and the snack drops (each one is noisy). */
export function shakeMachine(s: GameState, addNoise: (amount: number) => boolean): BreakResult {
  const closed = breakClosed(s);
  if (closed) return { ok: false, reason: closed };
  const st = s.breakroom.stuck;
  if (!st) return { ok: false, reason: 'Nothing’s stuck.' };
  if (!addNoise(BREAK.shakeNoise)) return { ok: false, reason: 'Too loud right now: let Suspicion cool off first.' };
  st.shakes++;
  if (st.shakes < BREAK.shakes) return { ok: true, text: st.shakes === 1 ? 'It wobbles. Again!' : 'Almost…' };
  s.breakroom.stuck = null;
  if (s.stats) s.stats.shook = (s.stats.shook ?? 0) + 1;
  pushTicker(s, 'Somebody is shaking the vending machine in the break room. Again.');
  return eat(s, st.id);
}

/** Pretzels: your bands hit harder. */
export function snackDamage(s: GameState) {
  return snackOn(s) === 'pretzels' ? 1.3 : 1;
}

/** Gummy Worms: weak spots turn up twice as often (the gap between them, times this). */
export function snackWeakGap(s: GameState) {
  return snackOn(s) === 'gummies' ? 0.5 : 1;
}

/** Energy Drink: the Barrage reloads twice as fast. */
export function snackBarrage(s: GameState) {
  return snackOn(s) === 'energy' ? 0.5 : 1;
}

/** Breath Mints: your shots are quieter. */
export function snackQuiet(s: GameState) {
  return snackOn(s) === 'mints' ? 0.7 : 1;
}

// ---------------------------------------------------------------- saves

/** Saves: timers keep their game time (they run out while you're away); nothing odd survives. */
export function breakForLoad(saved: Partial<BreakState> | undefined): BreakState {
  const b = { ...newBreak(), ...(saved ?? {}) };
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  b.coffeeAt = num(b.coffeeAt, 0);
  b.coffeeUntil = num(b.coffeeUntil, -999);
  b.cups = Math.max(0, Math.floor(num(b.cups, 0)));
  const ok = (id: unknown): id is SnackId => SNACKS.some((x) => x.id === id);
  b.snack = b.snack && ok(b.snack.id) ? { id: b.snack.id, until: num(b.snack.until, 0) } : null;
  b.stuck = b.stuck && ok(b.stuck.id) ? { id: b.stuck.id, shakes: Math.max(0, Math.min(BREAK.shakes - 1, Math.floor(num(b.stuck.shakes, 0)))) } : null;
  return b;
}
