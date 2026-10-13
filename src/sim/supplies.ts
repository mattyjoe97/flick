// Bands that aren't shot at you: your desk drawer, and the supply orders you place.
//
// The drawer holds a handful of stray bands. You grab them one at a time (S), and a
// few more turn up every few seconds, so scrounging is a quick top-up rather than a
// way to fund a war. Now and then there's something better in there: a tangle of
// bands, a rubber band ball, or some loose change.
//
// A supply order is paid for right away and arrives as a box on your desk a few
// seconds later. Open it (O) to get the bands. Mr. Feeney notices boxes of rubber
// bands that sit around unopened.

import { chatEvent } from './chat';
import { has, mods } from './mods';
import { rand } from './rng';
import { pushTicker, type GameState } from './state';

export type FindKind = 'tangle' | 'ball' | 'change';

export interface SuppliesState {
  drawer: number; // stray bands lying in your drawer
  refillAt: number; // when the next one turns up
  find: FindKind | null; // something better than a band, if you're lucky
  order: { amount: number; arriveAt: number } | null; // on its way
  box: { amount: number; arrivedAt: number; free: boolean } | null; // on your desk, unopened
}

export const SUPPLIES = {
  drawerCap: 15,
  refillEvery: 3, // seconds per stray band
  findChance: 0.05, // per refill tick, when there's nothing good in the drawer already
  findWeights: { tangle: 6, change: 3, ball: 1 } as Record<FindKind, number>,
  tangle: 5, // bands
  ball: [0, 25, 60, 120], // bands, by stage
  change: [0, 3, 8, 15], // dollars, by stage
  deliverySeconds: 10,
  boxNoise: 6, // Suspicion when Mr. Feeney walks past an unopened box
  bulkAt: 200, // a box this big comes in the huge box
};

export function newSupplies(): SuppliesState {
  return { drawer: SUPPLIES.drawerCap, refillAt: SUPPLIES.refillEvery, find: null, order: null, box: null };
}

/** Rummage Deeper doubles everything about the drawer. */
const deeper = (s: GameState) => (has(s, 'rummage') ? 2 : 1);

export function drawerCap(s: GameState) {
  return SUPPLIES.drawerCap * deeper(s);
}

export function stepSupplies(s: GameState) {
  const p = s.supplies;
  if (s.time >= p.refillAt) {
    p.refillAt = s.time + SUPPLIES.refillEvery / deeper(s);
    if (p.drawer < drawerCap(s)) p.drawer++;
    if (!p.find && rand(s) < SUPPLIES.findChance) {
      const w = SUPPLIES.findWeights;
      let r = rand(s) * (w.tangle + w.change + w.ball);
      p.find = (r -= w.tangle) < 0 ? 'tangle' : (r -= w.change) < 0 ? 'change' : 'ball';
      s.events.push({ type: 'find', kind: p.find });
    }
  }
  if (p.order && s.time >= p.order.arriveAt) {
    deliver(s, p.order.amount, false);
    p.order = null;
  }
}

/** A box of bands lands on your desk (or gets added to the one already there). */
export function deliver(s: GameState, amount: number, free: boolean) {
  const p = s.supplies;
  if (p.box) p.box.amount += amount;
  else p.box = { amount, arrivedAt: s.time, free };
  s.events.push({ type: 'delivery', amount: p.box.amount, free });
  pushTicker(s, free ? `A box turns up addressed to you. Nobody asks. Open it (O).` : `Your supply order is here: a box of ${amount} bands. Open it (O).`);
}

export type GrabResult =
  | { ok: true; item: 'band' | FindKind; bands: number; salary: number }
  | { ok: false; reason: string };

/** Reach into your drawer. Takes the good stuff first unless you say otherwise. */
export function grab(s: GameState, pick: 'band' | 'find' = s.supplies.find ? 'find' : 'band'): GrabResult {
  const p = s.supplies;
  if (pick === 'find' && p.find) {
    const item = p.find;
    p.find = null;
    s.stats.finds++;
    if (item === 'change') {
      const salary = SUPPLIES.change[s.stage];
      s.salary += salary;
      return { ok: true, item, bands: 0, salary };
    }
    if (item === 'ball') chatEvent(s, 'find:ball');
    const bands = item === 'ball' ? SUPPLIES.ball[s.stage] : SUPPLIES.tangle * mods(s).scrounge;
    s.bands += bands;
    s.stats.bandsScrounged += bands;
    return { ok: true, item, bands, salary: 0 };
  }
  if (p.drawer <= 0) return { ok: false, reason: 'Nothing left in your drawer. Strays turn up every few seconds, or order supplies (O).' };
  const bands = Math.min(p.drawer, mods(s).scrounge);
  p.drawer -= bands;
  s.bands += bands;
  s.stats.bandsScrounged += bands;
  return { ok: true, item: 'band', bands, salary: 0 };
}

export function openBox(s: GameState): { ok: true; amount: number; bulk: boolean } | { ok: false; reason: string } {
  const box = s.supplies.box;
  if (!box) return { ok: false, reason: 'There’s no box on your desk.' };
  s.supplies.box = null;
  s.bands += box.amount;
  s.stats.boxesOpened++;
  return { ok: true, amount: box.amount, bulk: box.amount >= SUPPLIES.bulkAt };
}

/** Mr. Feeney walks past your desk: a box of rubber bands is hard to explain. */
export function boxSpotted(s: GameState): number {
  return s.supplies.box ? SUPPLIES.boxNoise : 0;
}

/** Time away: the drawer fills up and orders arrive. */
export function suppliesOffline(s: GameState) {
  const p = s.supplies;
  p.drawer = drawerCap(s);
  p.refillAt = s.time + SUPPLIES.refillEvery;
  if (p.order) {
    deliver(s, p.order.amount, false);
    p.order = null;
  }
}
