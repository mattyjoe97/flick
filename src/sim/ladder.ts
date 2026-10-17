// The career ladder, and two late-game things to spend money on.
//
// Ladder      Every company has offices at every level: Regional Office (where you start),
//             Head Office, Global HQ, then Global HQ II, III... Close HR's case at enough
//             jobs in one tier and the next one starts recruiting you. Up there everyone is
//             tougher (their Resolve, as you see it, is bigger; inside, your hits count for
//             less), the work pays better, and a job is worth more Reputation.
// Renovations Repeatable office upgrades on Dale's Procurement clipboard from the
//             Department War on: each level costs more than the last. They belong to the
//             office, so they stay behind when you leave.
// Stock       Shares in the company, bought with money once you know you can leave. Each adds
//             1% to the Reputation the job earns you; the price climbs with every share.

import { LADDER, RENOVATIONS, STOCK, type RenovationId } from './content';
import { pushEmail, pushTicker, type GameState } from './state';

// ---------------------------------------------------------------- the ladder

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n: number) => (n < ROMAN.length ? ROMAN[n] : String(n));

/** A tier's name: Regional Office, Head Office, Global HQ, Global HQ II... */
export function tierName(tier: number) {
  const named = LADDER.tiers.length;
  if (tier < named) return LADDER.tiers[tier].name;
  return `${LADDER.tiers[named - 1].name} ${roman(tier - named + 2)}`;
}

/** Which floor the office is on at a tier (Floor 4 at the Regional Office). */
export function tierFloor(tier: number) {
  const named = LADDER.tiers.length;
  if (tier < named) return LADDER.tiers[tier].floor;
  return LADDER.tiers[named - 1].floor + LADDER.floorsAfter * (tier - named + 1);
}

/** The tier of the job you're at. */
export function tier(s: GameState) {
  return s.job?.tier ?? 0;
}

/** How much tougher everyone is at this job's tier: Resolve (and walls) look this many times bigger. */
export function toughness(s: GameState) {
  return Math.pow(LADDER.toughness, tier(s));
}

/** Work pays this much more at this job's tier. */
export function tierPay(s: GameState) {
  return Math.pow(LADDER.pay, tier(s));
}

/** A job at this tier is worth this many times the Reputation. */
export function tierRep(t: number) {
  return Math.pow(LADDER.rep, t);
}

/** Cases closed at a tier. */
export function closedAt(s: GameState, t: number) {
  return s.job.closed[t] ?? 0;
}

/** You closed HR's case: count it, and if that's enough at your highest tier, the next one calls. */
export function recordClose(s: GameState) {
  const t = tier(s);
  const j = s.job;
  while (j.closed.length <= t) j.closed.push(0);
  j.closed[t] += 1;
  if (t === j.top && j.closed[t] >= LADDER.closes) {
    j.top = t + 1;
    const next = tierName(j.top);
    pushEmail(
      s,
      'Recruiter (LinkedUp)',
      `${next} is asking about you`,
      `Three closed investigations in a row. People at ${next} have noticed (Floor ${tierFloor(j.top)}, the good coffee). Everyone there is tougher, the pay is better, and a job there counts for a lot more. Open Job Search when you're ready.`,
      'story',
    );
    pushTicker(s, `${next} is recruiting you. Open Job Search to see the offers.`);
    s.events.push({ type: 'climb', tier: j.top });
  }
}

/** Old saves: count the cases they'd already closed at the Regional Office. */
export function ladderForOldSave(s: GameState) {
  const closes = s.job.history.filter((h) => h.stage >= 6).length + (s.stage >= 6 ? 1 : 0);
  s.job.closed = [closes];
  s.job.tier = 0;
  s.job.top = closes >= LADDER.closes ? 1 : 0;
}

// ---------------------------------------------------------------- renovations

const reno = (id: RenovationId) => RENOVATIONS.find((r) => r.id === id)!;

export function renoLevel(s: GameState, id: RenovationId) {
  return s.renovations?.[id] ?? 0;
}

/** All the renovation levels you've bought here. */
export function renoTotal(s: GameState) {
  return RENOVATIONS.reduce((n, r) => n + renoLevel(s, r.id), 0);
}

/** Renovations open with the Department War. */
export function renovationsOpen(s: GameState) {
  return s.stage >= 3;
}

/** What the next level costs (null when it can't go higher). */
export function renoCost(s: GameState, id: RenovationId): number | null {
  const r = reno(id);
  const lv = renoLevel(s, id);
  if (lv >= r.max) return null;
  return Math.round(r.cost * Math.pow(r.growth, lv));
}

export type LadderResult = { ok: true } | { ok: false; reason: string };

export function buyRenovation(s: GameState, id: RenovationId): LadderResult {
  if (!renovationsOpen(s)) return { ok: false, reason: 'Facilities only renovates for department heads. Win the Department War first.' };
  const cost = renoCost(s, id);
  if (cost === null) return { ok: false, reason: 'It can’t get any quieter in here.' };
  if (s.salary < cost) return { ok: false, reason: `That costs $${cost.toLocaleString('en-US')}.` };
  s.salary -= cost;
  s.renovations[id] = renoLevel(s, id) + 1;
  s.stats.renovations = (s.stats.renovations ?? 0) + 1;
  return { ok: true };
}

/** Window Office: how much harder your bands hit. */
export function renoDamage(s: GameState) {
  return 1 + reno('window').each * renoLevel(s, 'window');
}

/** Espresso Machine: how much faster your team works. */
export function renoTeam(s: GameState) {
  return 1 + reno('espresso').each * renoLevel(s, 'espresso');
}

/** Standing Desks: how much more all work pays. */
export function renoPay(s: GameState) {
  return 1 + reno('desks').each * renoLevel(s, 'desks');
}

/** Acoustic Panels: everything is this much as loud. */
export function renoQuiet(s: GameState) {
  return Math.pow(1 - reno('panels').each, renoLevel(s, 'panels'));
}

// ---------------------------------------------------------------- company stock

/** Can you buy shares? Once you know you can leave, from the Department War on. */
export function stockOpen(s: GameState) {
  return s.job.unlocked && s.stage >= STOCK.minStage;
}

/** What the next share costs. */
export function stockPrice(s: GameState) {
  return Math.round(STOCK.price * Math.pow(STOCK.growth, s.stock ?? 0));
}

/** How much your shares add to the Reputation a job earns you (each one +1%). */
export function stockBonus(s: GameState) {
  return (s.stock ?? 0) * STOCK.rep;
}

/** Buy up to `n` shares (as many as you can afford). Returns how many you bought. */
export function buyStock(s: GameState, n = 1): number {
  if (!stockOpen(s)) return 0;
  let bought = 0;
  while (bought < n && s.salary >= stockPrice(s)) {
    s.salary -= stockPrice(s);
    s.stock = (s.stock ?? 0) + 1;
    bought++;
  }
  if (bought) s.stats.shares = Math.max(s.stats.shares ?? 0, s.stock);
  return bought;
}
