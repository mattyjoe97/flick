import { cutFloss, objectionOn, snared } from '../src/sim/tenants';
import { COWORKERS, TEAMS, TUNING, UPGRADES, WEAPONS } from '../src/sim/content';
import { promote, reviewReady } from '../src/sim/career';
import { hire, seatCap, seatCost, seats, teamUnlocked, train, trainCost } from '../src/sim/staff';
import { wind } from '../src/sim/ball';
import { BARRAGE } from '../src/sim/content';
import {
  barrage,
  barrageSize,
  canBarrage,
  buyUpgrade,
  buyWeapon,
  coworkerAvailable,
  flick,
  openBox,
  orderSupplies,
  recruit,
  scrounge,
  setLookBusy,
  step,
  walkbyCountdown,
} from '../src/sim/engine';
import {
  answerCall,
  answerMail,
  answerPhone,
  checkCell,
  correctCall,
  correctMail,
  correctStamp,
  focusApp,
  stampReceipt,
  startRound,
  typosLeft,
  type WorkKind,
} from '../src/sim/work';
import { mods, weapon } from '../src/sim/mods';
import { chaseRaid, fightingDept } from '../src/sim/war';
import { fightingRoom, holdLine, sabotage, sabotageCost, sabotaged } from '../src/sim/siege';
import { canSendMemo, coach, sendMemo } from '../src/sim/politics';
import { buyExec, buyPerk, execCost, offers, perkCost, startNewJob } from '../src/sim/job';
import { buyRenovation, buyStock, renoCost, renovationsOpen } from '../src/sim/ladder';
import { EXEC_PERKS, RENOVATIONS } from '../src/sim/content';
import { memoOn } from '../src/sim/state';
import { fight } from '../src/sim/war';
import { DEPARTMENTS, PERKS, type MemoId } from '../src/sim/content';
import { assign } from '../src/sim/engine';
import { newGame, type GameState } from '../src/sim/state';

export interface BotStyle {
  name: string;
  /** Uses Barrages and winds spare bands onto the ball (off: plays like before they existed). */
  ball?: boolean;
  /** Keeps ordering supplies to stockpile for Barrages (a player who buys bands to throw). */
  stockpile?: boolean;
  /** Keeps fighting after the first slice (the Department War, rematches) instead of only working. */
  war3?: boolean;
  /** Stage 4: puts someone on guard duty, and sabotages the rooms when it can afford to. */
  guards?: boolean;
  sabotage?: boolean;
  /** Stage 5: sends memos when it can (on by default), and whether it fights HR or only plays politics. */
  memos?: boolean;
  politicsOnly?: boolean;
  /** Once the floor is yours: quit for the next job (buying résumé perks). */
  quit?: boolean;
  actionsPerSecond: number;
  hideAbove: number; // Suspicion level that makes the bot hide
  resumeBelow: number;
  workAbove: number; // Suspicion level where it does work instead of firing
  reactsToWalkbys: boolean;
  /** How often it gets a work task right, and how long a task takes it (seconds per kind). */
  accuracy: number;
  doesWork: boolean;
}

/** Tests can look at each step's events before the bot clears them. */
export const BOT_WATCH: { fn: ((s: GameState) => void) | null } = { fn: null };

export const STYLES: BotStyle[] = [
  { name: 'careful', actionsPerSecond: 3, hideAbove: 70, resumeBelow: 20, workAbove: 50, reactsToWalkbys: true, accuracy: 0.92, doesWork: true },
  { name: 'aggressive', actionsPerSecond: 4, hideAbove: 95, resumeBelow: 40, workAbove: 90, reactsToWalkbys: true, accuracy: 0.85, doesWork: true },
  { name: 'oblivious', actionsPerSecond: 3, hideAbove: 101, resumeBelow: 0, workAbove: 101, reactsToWalkbys: false, accuracy: 0.6, doesWork: false },
];

/** Seconds a bot spends on one item of each kind (a human reads, thinks, taps). */
const ITEM_TIME: Record<WorkKind, number> = { mail: 3.5, call: 5, expense: 2.5, sheet: 7 };

interface BotMind {
  busyUntil: number;
  job: (() => void) | null; // what it does when it's done thinking
  coin: number; // deterministic pseudo-random for mistakes
}

/** Plays the game headlessly and returns the final state (by default, until the first slice is done). */
export function playBot(style: BotStyle, maxSeconds = 4 * 3600, seed = 12345, until: (s: GameState) => boolean = (s) => s.stage >= 3): GameState {
  const s = newGame(seed);
  runBot(s, style, maxSeconds, until, seed);
  return s;
}

/** Keeps a bot playing an existing game for up to `seconds` (or until `until` says stop). */
export function runBot(s: GameState, style: BotStyle, seconds: number, until: (s: GameState) => boolean = () => false, seed = 12345) {
  const mind: BotMind = { busyUntil: 0, job: null, coin: seed % 997 };
  const actionEvery = 1 / style.actionsPerSecond;
  let nextAction = s.time;
  const steps = Math.round(seconds / TUNING.stepSeconds);
  for (let i = 0; i < steps && !until(s); i++) {
    // A new job starts the clock over: forget what it was in the middle of.
    if (s.time + 1 < nextAction - actionEvery || (mind.job && s.time + 1 < mind.busyUntil - 60)) {
      mind.job = null;
      nextAction = s.time;
    }
    step(s, TUNING.stepSeconds);
    BOT_WATCH.fn?.(s);
    s.events.length = 0;
    if (mind.job) {
      // Busy with an item: do it when the time is up.
      if (s.time >= mind.busyUntil) {
        const job = mind.job;
        mind.job = null;
        job();
      }
      continue;
    }
    if (s.time >= nextAction) {
      nextAction = s.time + actionEvery;
      act(s, style, mind);
    }
  }
}

function rightThisTime(style: BotStyle, mind: BotMind) {
  mind.coin = (mind.coin * 9301 + 49297) % 233280;
  return mind.coin / 233280 < style.accuracy;
}

function later(s: GameState, mind: BotMind, kind: WorkKind, job: () => void) {
  mind.job = job;
  mind.busyUntil = s.time + ITEM_TIME[kind];
}

/** Works on one item: a ringing phone first, then whatever round is open or ready. */
function doTask(s: GameState, style: BotStyle, mind: BotMind): boolean {
  if (!style.doesWork) return false;
  const w = s.work;
  if (w.ringing && !w.rounds.call) answerPhone(s);
  const call = w.rounds.call;
  if (call) {
    focusApp(s, 'call');
    const right = rightThisTime(style, mind);
    later(s, mind, 'call', () => {
      const a = correctCall(s, call.caller!);
      answerCall(s, right ? a : a.act === 'hangup' ? { act: 'self' } : { act: 'hangup' });
    });
    return true;
  }
  setLookBusy(s, true);
  const ready = (['mail', 'expense', 'sheet'] as const).find((k) => w.rounds[k]) ??
    (w.mailWaiting > 0 ? 'mail' : s.time >= w.expenseAt ? 'expense' : s.time >= w.sheetAt ? 'sheet' : null);
  if (!ready) return false;
  focusApp(s, ready);
  const r = startRound(s, ready);
  if (!r) return false;
  const right = rightThisTime(style, mind);
  if (ready === 'mail') {
    const i = r.mail!.findIndex((m) => m.state === 'open');
    const a = correctMail(r.mail![i]);
    later(s, mind, 'mail', () => answerMail(s, i, right ? a : a.act === 'delete' ? { act: 'reply', choice: 0 } : { act: 'delete' }));
  } else if (ready === 'expense') {
    const i = r.receipts!.findIndex((x) => x.state === 'open');
    const ok = correctStamp(r, i);
    later(s, mind, 'expense', () => stampReceipt(s, i, right || r.receipts![i].yours ? ok : !ok));
  } else {
    // Right: click a typo. Wrong: click a cell that actually matched the printout.
    const sh = r.sheet!;
    const target = right
      ? typosLeft(r)[0]
      : sh.rows
          .flatMap((row, i) => row.cells.map((_, col) => ({ row: i, col })))
          .find((c) => !sh.typos.some((t) => t.row === c.row && t.col === c.col) && !sh.misses.some((m) => m.row === c.row && m.col === c.col))!;
    later(s, mind, 'sheet', () => checkCell(s, target.row, target.col));
  }
  return true;
}

/** Saving up for the first weapon early on. */
const needsMoney = (s: GameState) => s.salary < 15 && s.ownedWeapons.length < 2 && s.time > 3;

function act(s: GameState, style: BotStyle, mind: BotMind) {
  // A delivered box gets opened right away (it's on the desk, even from your chair).
  if (s.supplies.box) openBox(s);
  // Reviews get taken as soon as they're ready.
  if (style.doesWork && reviewReady(s)) promote(s);
  // After the first slice there's no one to flick: every spare band goes on the ball.
  if (s.stage > 2 && !style.war3 && style.ball !== false && s.bands >= 10) wind(s);
  if (s.stage > 2 && !style.war3) {
    shop(s);
    setLookBusy(s, true);
    doTask(s, style, mind);
    return;
  }
  // A raid on the supply closet gets chased off (it pops up right in front of you).
  if (s.war.closet.raid && !s.lookBusy && chaseRaid(s).ok) return;
  // Stage 6: take the building's floors first, if this bot is set to.
  if (s.stage >= 6 && s.tenants.taken < BOT_FLAGS.tenants) {
    if (s.war.fighting !== 'tenant') fight(s, 'tenant');
    // Floss on the launcher: tap it off. An Objection: hold fire (do some work instead).
    while (snared(s)) cutFloss(s);
    if (objectionOn(s)) {
      if (style.doesWork) doTask(s, style, mind);
      return;
    }
  } else if (style.quit && s.stage >= 6 && s.job.unlocked) {
    // Whatever money's left goes into company stock on the way out.
    if (!BOT_FLAGS.noStock) buyStock(s, 9999);
    BOT_FLAGS.lastStock = s.stock;
    BOT_FLAGS.lastBounties = s.stats.bounties;
    startNewJob(s, offers(s)[0].id, s.job.top);
    for (;;) {
      const next = PERKS.map((p) => ({ id: p.id, cost: perkCost(s, p.id) })).filter((p) => p.cost !== null && p.cost <= s.job.reputation).sort((a, b) => a.cost! - b.cost!)[0];
      if (!next || !buyPerk(s, next.id).ok) break;
    }
    // Then the executive perks, cheapest first, with whatever's left.
    for (;;) {
      const next = EXEC_PERKS.map((p) => ({ id: p.id, cost: execCost(s, p.id) })).filter((p) => p.cost !== null && p.cost <= s.job.reputation).sort((a, b) => a.cost! - b.cost!)[0];
      if (!next || BOT_FLAGS.noExec || !buyExec(s, next.id).ok) break;
    }
    return;
  }
  if (s.stage === 5) {
    const p = s.war.politics;
    // An HR interview pops up in front of you: coach the witness.
    if (p.interview && !s.lookBusy && coach(s).ok) return;
    // Memos, from your computer (no need to be at it for the sim).
    if (style.memos !== false) {
      const want: MemoId[] = [];
      if (p.evidence >= 40) want.push('retention');
      if (!style.politicsOnly && s.war.fighting === 'hr') want.push('teambuilding');
      if (!style.politicsOnly && memoOn(s, 'teambuilding')) want.push('openplan');
      want.push('synergy');
      if (style.politicsOnly) want.push('casual', 'teambuilding', 'openplan', 'retention');
      for (const id of want) if (canSendMemo(s, id).ok && sendMemo(s, id).ok) return;
    }
    // Win back anything HR took; a politics-only player fights the rematches instead of HR.
    const seized = DEPARTMENTS.find((d) => s.war.depts[d.dept].seized);
    if (seized && s.war.fighting !== seized.dept) fight(s, seized.dept);
    else if (!seized && style.politicsOnly && s.war.fighting !== 'rematch') fight(s, 'rematch');
  }
  if (s.stage === 4) {
    // So does a counterattack on the desks you took.
    if (s.war.counter.attack && !s.lookBusy && holdLine(s).ok) return;
    // One person guards the floor (Kevin, if he's around).
    if (style.guards !== false && !s.allies.some((a) => a.role === 'guard')) {
      const g = s.allies.find((a) => a.id === 'kevin') ?? s.allies.find((a) => a.role === 'gatherer');
      if (g) assign(s, g.id, 'guard');
    }
    // Shut off the room's trick when there's money to spare.
    const r = fightingRoom(s);
    if (style.sabotage !== false && r && !sabotaged(s, r) && s.salary > sabotageCost(s) * 3 && (r === 'conference' || s.war.rooms[r].wall <= 0) && sabotage(s, r).ok) return;
  }
  const countdown = walkbyCountdown(s);
  // A ringing phone gets answered: that's work, and it puts you at your computer.
  if (s.work.ringing && doTask(s, style, mind)) return;
  const danger = style.reactsToWalkbys && countdown !== null && countdown < mods(s).warning - 1;
  if (danger || s.suspicion > style.hideAbove) setLookBusy(s, true);

  if (s.lookBusy) {
    // At the computer: once it's cooled off, go back to the war; until then, work.
    const done = s.suspicion < style.resumeBelow && countdown === null && !needsMoney(s) && !danger;
    if (!done) {
      doTask(s, style, mind);
      return;
    }
    setLookBusy(s, false);
  }
  if (shop(s)) return;

  const w = weapon(s);
  if (style.stockpile && s.stage === 2 && s.bands < 2 * BARRAGE.perPerson * (1 + s.allies.length) && !s.supplies.order && s.salary >= mods(s).order.price * 3) {
    orderSupplies(s);
    return;
  }
  if (s.bands < w.burst) {
    const o = mods(s).order;
    if (!s.supplies.order && s.salary >= o.price + 5) orderSupplies(s);
    else if (s.supplies.drawer > 0 || s.supplies.find) scrounge(s);
    else if (style.doesWork) setLookBusy(s, true); // go earn while the order is on its way
    return;
  }
  // A full Barrage when the team's reloaded and there's room on the Suspicion meter.
  if (style.ball !== false && countdown === null && canBarrage(s).ok) {
    const n = barrageSize(s);
    const full = n >= Math.min(s.bands, BARRAGE.perPerson * (1 + s.allies.filter((a) => a.role === 'shooter').length));
    const noise = BARRAGE.noise + BARRAGE.noisePerBand * n;
    if (full && n >= BARRAGE.min * 2 && s.suspicion + noise < style.workAbove && barrage(s).ok) return;
  }
  if (s.suspicion > style.workAbove || needsMoney(s)) {
    if (style.doesWork) {
      setLookBusy(s, true);
      return;
    }
  }
  // Doris only feels stretched shots: hold each one (about a second a shot).
  if (fightingDept(s) === 'accounting') {
    if (s.time - s.lastShotAt >= 1) flick(s, 1);
    return;
  }
  flick(s);
}

/** Buys the next sensible thing. Returns true if it bought something. */
function shop(s: GameState): boolean {
  for (const w of WEAPONS) {
    if (!s.ownedWeapons.includes(w.id) && buyWeapon(s, w.id).ok) return true;
  }
  for (const c of COWORKERS) {
    if (!s.allies.some((a) => a.id === c.id) && coworkerAvailable(s, c.id) && recruit(s, c.id).ok) return true;
  }
  for (const u of UPGRADES) {
    if (!s.upgrades.includes(u.id) && buyUpgrade(s, u.id).ok) return true;
  }
  return hireSomeone(s) || renovate(s);
}

/** From the Department War on: the cheapest renovation, with a cushion left over (bots with renovate: false skip them). */
function renovate(s: GameState): boolean {
  if (!renovationsOpen(s) || BOT_FLAGS.noRenovate) return false;
  const next = RENOVATIONS.map((r) => ({ id: r.id, cost: renoCost(s, r.id) })).filter((r) => r.cost !== null).sort((a, b) => a.cost! - b.cost!)[0];
  return !!next && s.salary >= next.cost! * 2 && buyRenovation(s, next.id).ok;
}

/** Switches for experiments (pacing tests turn the new spending off to compare). */
export const BOT_FLAGS = { noRenovate: false, noStock: false, noExec: false, lastStock: 0, lastBounties: 0, tenants: 0 };

/** Grows the team: the cheapest seat or training it can afford with money to spare. */
function hireSomeone(s: GameState): boolean {
  let best: { cost: number; buy: () => boolean } | null = null;
  for (const t of TEAMS) {
    if (!teamUnlocked(s, t.id)) continue;
    const seat = seatCost(s, t.id);
    if (seats(s, t.id) < seatCap(s, t.id) && (!best || seat < best.cost)) best = { cost: seat, buy: () => hire(s, t.id).ok };
    const tc = trainCost(s, t.id);
    if (tc !== null && (!best || tc < best.cost)) best = { cost: tc, buy: () => train(s, t.id).ok };
  }
  // Keep a cushion for weapons, supplies and buy-backs.
  return !!best && s.salary >= best.cost * 1.5 && best.buy();
}
