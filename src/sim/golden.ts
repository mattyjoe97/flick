// The golden stapler: every few minutes something shiny turns up somewhere in the office for a
// few seconds. Tap it in time for a random bonus:
//
//   Frenzy     your bands (and your Shooters') hit three times as hard for half a minute
//   Windfall   a few minutes of your pay, right now
//   Band storm a pile of bands, and your Barrage is ready again
//   Overtime   your team works three times as fast for half a minute
//   Clean slate Suspicion to zero, and Mr. Feeney takes the long way round
//
// It only turns up while you're at your desk (not at your computer), and never while Mr.
// Feeney is on his way. Miss it and it's gone until next time.

import { BARRAGE } from './content';
import { jobPayMult } from './job';
import { mods } from './mods';
import { rand, randRange } from './rng';
import { staffPayPerMin } from './staff';
import { pushTicker, type GameState } from './state';
import { payGrade } from './work';

export type GoldenKind = 'frenzy' | 'windfall' | 'storm' | 'overtime' | 'clean';

export const GOLDEN = {
  first: 240, // seconds into a job before the first one
  gap: [180, 360] as [number, number], // between one and the next
  seconds: 9, // how long it stays
  frenzy: { damage: 3, seconds: 30 },
  overtime: { team: 3, seconds: 30 },
  windfallMinutes: 5, // of your team's steady pay (or a little cash early on)
  windfallMin: 150, // times your pay grade
  stormMin: 300, // bands
  stormSeconds: 120, // of your band income
  cleanDelay: 120, // seconds Mr. Feeney's next walk is put off
};

export interface GoldenState {
  nextAt: number;
  /** On screen now: where (fractions of the office picture) and until when. */
  shown: { until: number; x: number; y: number } | null;
  /** A timed bonus running now. */
  boost: { kind: 'frenzy' | 'overtime'; until: number } | null;
}

export function newGolden(): GoldenState {
  return { nextAt: GOLDEN.first, shown: null, boost: null };
}

const NAMES: Record<GoldenKind, string> = {
  frenzy: 'Frenzy',
  windfall: 'Windfall',
  storm: 'Band storm',
  overtime: 'Overtime',
  clean: 'Clean slate',
};

export function goldenName(kind: GoldenKind) {
  return NAMES[kind];
}

/** Is a Frenzy on? (your bands hit harder) */
export function goldenDamage(s: GameState) {
  const b = s.golden?.boost;
  return b && b.kind === 'frenzy' && s.time < b.until ? GOLDEN.frenzy.damage : 1;
}

/** Is Overtime on? (your team works faster) */
export function goldenTeam(s: GameState) {
  const b = s.golden?.boost;
  return b && b.kind === 'overtime' && s.time < b.until ? GOLDEN.overtime.team : 1;
}

/** Seconds left on the running bonus (0 when none). */
export function goldenBoostLeft(s: GameState) {
  const b = s.golden?.boost;
  return b ? Math.max(0, b.until - s.time) : 0;
}

/** Every step: it turns up when it's time (at your desk, with nobody coming), and leaves if you miss it. */
export function stepGolden(s: GameState) {
  const g = s.golden;
  if (!g) return;
  if (g.boost && s.time >= g.boost.until) g.boost = null;
  if (g.shown) {
    if (s.time >= g.shown.until || s.lookBusy) {
      g.shown = null;
      g.nextAt = s.time + randRange(s, GOLDEN.gap[0], GOLDEN.gap[1]);
      s.events.push({ type: 'goldenGone' });
    }
    return;
  }
  if (s.time < g.nextAt || s.lookBusy || s.walkby.arrivesAt !== null) return;
  g.shown = { until: s.time + GOLDEN.seconds, x: randRange(s, 0.18, 0.82), y: randRange(s, 0.22, 0.62) };
  s.events.push({ type: 'goldenSpawn' });
}

/** You tapped it. Returns what you got (null if it wasn't there). */
export function claimGolden(s: GameState): GoldenKind | null {
  const g = s.golden;
  if (!g?.shown || s.time >= g.shown.until) return null;
  g.shown = null;
  g.nextAt = s.time + randRange(s, GOLDEN.gap[0], GOLDEN.gap[1]);
  s.stats.goldens = (s.stats.goldens ?? 0) + 1;
  const hasTeam = staffPayPerMin(s, true) > 0;
  const weights: [GoldenKind, number][] = [
    ['frenzy', 30],
    ['windfall', 25],
    ['storm', s.stage >= 2 ? 20 : 10],
    ['overtime', hasTeam ? 15 : 0],
    ['clean', s.suspicion > 40 ? 30 : 10],
  ];
  const total = weights.reduce((n, [, w]) => n + w, 0);
  let r = rand(s) * total;
  let kind: GoldenKind = 'frenzy';
  for (const [k, w] of weights) {
    if ((r -= w) < 0) {
      kind = k;
      break;
    }
  }
  let text = '';
  if (kind === 'frenzy') {
    g.boost = { kind: 'frenzy', until: s.time + GOLDEN.frenzy.seconds };
    text = `Frenzy! Your bands hit ${GOLDEN.frenzy.damage}× as hard for ${GOLDEN.frenzy.seconds} seconds.`;
  } else if (kind === 'overtime') {
    g.boost = { kind: 'overtime', until: s.time + GOLDEN.overtime.seconds };
    text = `Overtime! Your team works ${GOLDEN.overtime.team}× as fast for ${GOLDEN.overtime.seconds} seconds.`;
  } else if (kind === 'windfall') {
    const cash = Math.round(Math.max(GOLDEN.windfallMin * payGrade(s).mult * jobPayMult(s), staffPayPerMin(s, true) * GOLDEN.windfallMinutes));
    s.salary += cash;
    s.events.push({ type: 'pay', amount: cash, source: 'bounty', note: 'a golden stapler' });
    text = `Windfall! Someone left an envelope in the stapler: +$${cash.toLocaleString('en-US')}.`;
  } else if (kind === 'storm') {
    const bands = Math.round(Math.max(GOLDEN.stormMin, mods(s).bandsPerSec * GOLDEN.stormSeconds, BARRAGE.perPerson * 2));
    s.bands += bands;
    if (s.stage >= 2) s.barrageAt = Math.min(s.barrageAt, s.time);
    text = `Band storm! +${bands.toLocaleString('en-US')} bands${s.stage >= 2 ? ', and your Barrage is ready' : ''}.`;
  } else {
    s.suspicion = 0;
    if (s.walkby.arrivesAt === null) s.walkby.nextAt = Math.max(s.walkby.nextAt, s.time) + GOLDEN.cleanDelay;
    text = 'Clean slate! Suspicion gone, and Mr. Feeney takes the long way round.';
  }
  pushTicker(s, text);
  s.events.push({ type: 'golden', kind });
  return kind;
}

/** Saves: a stapler on screen doesn't wait while the game is closed. */
export function goldenForLoad(saved: Partial<GoldenState> | undefined, time: number): GoldenState {
  const base = newGolden();
  const g = { ...base, ...(saved ?? {}), shown: null };
  if (!Number.isFinite(g.nextAt)) g.nextAt = time + GOLDEN.first;
  if (g.boost && !(Number.isFinite(g.boost.until) && (g.boost.kind === 'frenzy' || g.boost.kind === 'overtime'))) g.boost = null;
  return g;
}
