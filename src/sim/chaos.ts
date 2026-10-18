// Office chaos: every so often something shakes up the whole floor for a minute or so.
//
//   Fire Drill          everyone's out in the parking lot: no walk-bys, nobody hears a thing,
//                       and your bands hit twice as hard (open season)
//   Power Outage        lights out: nobody sees your shots (no noise), but your team's
//                       computers are off too
//   Birthday Cake       the whole floor crowds round the cake: your bands hit 50% harder and
//                       Suspicion builds half as fast
//   Surprise Inspection Mr. Feeney's boss is touring the floor: walk-bys come twice as often,
//                       but every one you're at your computer for pays a bonus
//
// One at a time, from Stage 2 on, never on top of a walk-by or another alert.

import { pushTicker, type GameState } from './state';
import { randRange, rand } from './rng';
import { staffPayPerMin } from './staff';
import { payGrade } from './work';
import { jobPayMult } from './job';

export type ChaosKind = 'drill' | 'outage' | 'cake' | 'inspection';

export const CHAOS = {
  first: 600, // seconds into a job before the first (and Stage 2 at least)
  gap: [480, 900] as [number, number],
  seconds: { drill: 60, outage: 45, cake: 60, inspection: 60 } as Record<ChaosKind, number>,
  drillDamage: 2,
  cakeDamage: 1.5,
  cakeSuspicion: 0.5,
  inspectionWalkby: 0.5, // walk-bys this much further apart (so twice as often)
  inspectionFirst: 15, // the first walk-by comes within this many seconds
  inspectionMinutes: 2, // of your team's steady pay, for each walk-by you hide from
  inspectionMin: 100, // times your pay grade
};

export const CHAOS_INFO: Record<ChaosKind, { name: string; start: string; end: string }> = {
  drill: {
    name: 'Fire Drill',
    start: 'Fire Drill! Everyone’s out in the parking lot. No walk-bys, nobody hears a thing, and your bands hit twice as hard. Open season.',
    end: 'The fire drill’s over. Everyone shuffles back to their desks.',
  },
  outage: {
    name: 'Power Outage',
    start: 'Power Outage! Lights out: nobody can see your shots. Your team’s computers are off too.',
    end: 'The lights flicker back on. The team groans and reboots.',
  },
  cake: {
    name: 'Birthday Cake',
    start: 'Birthday Cake! The whole floor crowds round it. Your bands hit 50% harder, and Suspicion builds half as fast.',
    end: 'The cake is gone. Somebody took the last slice without asking.',
  },
  inspection: {
    name: 'Surprise Inspection',
    start: 'Surprise Inspection! Mr. Feeney’s boss is touring the floor. Walk-bys come twice as often, but every one you’re at your computer for pays a bonus.',
    end: 'The inspection’s over. Mr. Feeney loosens his tie.',
  },
};

export interface ChaosState {
  nextAt: number;
  event: { kind: ChaosKind; until: number } | null;
}

export function newChaos(): ChaosState {
  return { nextAt: CHAOS.first, event: null };
}

/** What's going on right now (null when nothing). */
export function chaosOn(s: GameState): ChaosKind | null {
  const e = s.chaos?.event;
  return e && s.time < e.until ? e.kind : null;
}

export function chaosLeft(s: GameState) {
  const e = s.chaos?.event;
  return e ? Math.max(0, e.until - s.time) : 0;
}

/** Your bands: twice as hard in a Fire Drill, 50% harder with cake about. */
export function chaosDamage(s: GameState) {
  const k = chaosOn(s);
  return k === 'drill' ? CHAOS.drillDamage : k === 'cake' ? CHAOS.cakeDamage : 1;
}

/** Noise: nobody hears a thing in a Fire Drill, nobody sees a thing in the dark. */
export function chaosNoise(s: GameState) {
  const k = chaosOn(s);
  return k === 'drill' || k === 'outage' ? 0 : 1;
}

/** Suspicion builds half as fast while everyone's eating cake. */
export function chaosSuspicion(s: GameState) {
  return chaosOn(s) === 'cake' ? CHAOS.cakeSuspicion : 1;
}

/** Your team: their computers are off in a Power Outage. */
export function chaosTeam(s: GameState) {
  return chaosOn(s) === 'outage' ? 0 : 1;
}

/** Walk-bys: none in a Fire Drill; twice as often in an Inspection. */
export function chaosWalkbys(s: GameState): { paused: boolean; intervalMult: number } {
  const k = chaosOn(s);
  return { paused: k === 'drill', intervalMult: k === 'inspection' ? CHAOS.inspectionWalkby : 1 };
}

/** You were at your computer when Mr. Feeney walked by during an Inspection: a bonus. */
export function chaosHidden(s: GameState) {
  if (chaosOn(s) !== 'inspection') return 0;
  const cash = Math.round(Math.max(CHAOS.inspectionMin * payGrade(s).mult * jobPayMult(s), staffPayPerMin(s, true) * CHAOS.inspectionMinutes));
  s.salary += cash;
  s.events.push({ type: 'pay', amount: cash, source: 'bounty', note: 'the inspection' });
  pushTicker(s, `The inspector nods at your spreadsheet. "Model employee." +$${cash.toLocaleString('en-US')}.`);
  return cash;
}

/** Every step: an event starts when it's time (and nothing else is going on), and ends on its own. */
export function stepChaos(s: GameState) {
  const c = s.chaos;
  if (!c) return;
  if (c.event) {
    if (s.time >= c.event.until) {
      const kind = c.event.kind;
      c.event = null;
      c.nextAt = s.time + randRange(s, CHAOS.gap[0], CHAOS.gap[1]);
      pushTicker(s, CHAOS_INFO[kind].end);
      s.events.push({ type: 'chaosEnd', kind });
    }
    return;
  }
  if (s.stage < 2 || s.time < c.nextAt) return;
  if (s.walkby.arrivesAt !== null || s.war?.closet.raid || s.war?.counter?.attack || s.war?.politics?.interview) return;
  startChaos(s, pickKind(s));
}

function pickKind(s: GameState): ChaosKind {
  const hasTeam = staffPayPerMin(s, true) > 0;
  const options: ChaosKind[] = ['drill', 'cake', 'inspection', ...(hasTeam ? (['outage'] as const) : [])];
  return options[Math.floor(rand(s) * options.length)];
}

/** Starts an event now (exported for tests and the debug panel). */
export function startChaos(s: GameState, kind: ChaosKind) {
  s.chaos.event = { kind, until: s.time + CHAOS.seconds[kind] };
  if (s.walkby.arrivesAt === null) {
    // Mr. Feeney is out in the parking lot with everyone else; or he's showing his boss round.
    if (kind === 'drill') s.walkby.nextAt = Math.max(s.walkby.nextAt, s.time) + CHAOS.seconds.drill;
    if (kind === 'inspection') s.walkby.nextAt = Math.min(s.walkby.nextAt, s.time + CHAOS.inspectionFirst);
  }
  s.stats.chaos = (s.stats.chaos ?? 0) + 1;
  pushTicker(s, CHAOS_INFO[kind].start);
  s.events.push({ type: 'chaosStart', kind });
}

/** Saves: an event doesn't wait while the game is closed. */
export function chaosForLoad(saved: Partial<ChaosState> | undefined, time: number): ChaosState {
  const c = { ...newChaos(), ...(saved ?? {}), event: null };
  // Older saves (from before office chaos): the first one comes ten minutes after you load.
  if (!saved || !Number.isFinite(c.nextAt)) c.nextAt = time + CHAOS.first;
  return c;
}
