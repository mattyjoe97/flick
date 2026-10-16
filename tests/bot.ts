import { COWORKERS, TUNING, UPGRADES, WEAPONS } from '../src/sim/content';
import {
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
import { newGame, type GameState } from '../src/sim/state';

export interface BotStyle {
  name: string;
  actionsPerSecond: number;
  hideAbove: number; // Suspicion level that makes the bot hide
  resumeBelow: number;
  workAbove: number; // Suspicion level where it does work instead of firing
  reactsToWalkbys: boolean;
  /** How often it gets a work task right, and how long a task takes it (seconds per kind). */
  accuracy: number;
  doesWork: boolean;
}

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

/** Plays the game headlessly and returns the final state. */
export function playBot(style: BotStyle, maxSeconds = 4 * 3600, seed = 12345): GameState {
  const s = newGame(seed);
  const mind: BotMind = { busyUntil: 0, job: null, coin: seed % 997 };
  const actionEvery = 1 / style.actionsPerSecond;
  let nextAction = 0;
  const steps = Math.round(maxSeconds / TUNING.stepSeconds);
  for (let i = 0; i < steps && s.stage < 3; i++) {
    step(s, TUNING.stepSeconds);
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
  return s;
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
  if (s.bands < w.burst) {
    const o = mods(s).order;
    if (!s.supplies.order && s.salary >= o.price + 5) orderSupplies(s);
    else if (s.supplies.drawer > 0 || s.supplies.find) scrounge(s);
    else if (style.doesWork) setLookBusy(s, true); // go earn while the order is on its way
    return;
  }
  if (s.suspicion > style.workAbove || needsMoney(s)) {
    if (style.doesWork) {
      setLookBusy(s, true);
      return;
    }
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
  return false;
}
