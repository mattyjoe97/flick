import { COWORKERS, TUNING, UPGRADES, WEAPONS } from '../src/sim/content';
import {
  buyUpgrade,
  buyWeapon,
  coworkerAvailable,
  flick,
  orderSupplies,
  recruit,
  scrounge,
  setLookBusy,
  step,
  walkbyCountdown,
} from '../src/sim/engine';
import { answerTask, correctAnswer, nextTask, putDown, ringingCall, startTask, type TaskAnswer, type WorkTask } from '../src/sim/work';
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

/** Seconds a bot spends on each kind of task (a human reads, thinks, taps). */
const TASK_TIME: Record<WorkTask['kind'], number> = { email: 4, call: 5, sheet: 8, expense: 9 };

interface BotMind {
  busyUntil: number;
  taskId: number | null;
  answer: TaskAnswer | null;
  coin: number; // deterministic pseudo-random for mistakes
}

/** Plays the game headlessly and returns the final state. */
export function playBot(style: BotStyle, maxSeconds = 4 * 3600, seed = 12345): GameState {
  const s = newGame(seed);
  const mind: BotMind = { busyUntil: 0, taskId: null, answer: null, coin: seed % 997 };
  const actionEvery = 1 / style.actionsPerSecond;
  let nextAction = 0;
  const steps = Math.round(maxSeconds / TUNING.stepSeconds);
  for (let i = 0; i < steps && s.stage < 3; i++) {
    step(s, TUNING.stepSeconds);
    s.events.length = 0;
    if (mind.taskId !== null) {
      // Busy with a task: finish it when the time is up (if it's still there).
      if (s.work.activeId !== mind.taskId) mind.taskId = null;
      else if (s.time >= mind.busyUntil) {
        answerTask(s, mind.taskId, mind.answer!);
        mind.taskId = null;
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

/** Picks up the next task (a ringing phone first) and works on it for a while. */
function doTask(s: GameState, style: BotStyle, mind: BotMind): boolean {
  if (!style.doesWork) return false;
  const t = nextTask(s);
  if (!t || !startTask(s, t.id).ok) return false;
  mind.coin = (mind.coin * 9301 + 49297) % 233280;
  const right = mind.coin / 233280 < style.accuracy;
  mind.answer = right ? correctAnswer(t) : wrongAnswer(t);
  mind.taskId = t.id;
  mind.busyUntil = s.time + TASK_TIME[t.kind];
  return true;
}

function wrongAnswer(t: WorkTask): TaskAnswer {
  const a = correctAnswer(t);
  switch (a.kind) {
    case 'email':
      return { kind: 'email', choice: (a.choice + 1) % 3 };
    case 'call':
      return { kind: 'call', ext: a.ext === 2 ? 3 : 2 };
    case 'sheet':
      return { kind: 'sheet', flagged: [] };
    case 'expense':
      return { kind: 'expense', approve: a.approve.map((v, i) => (i === 0 ? !v : v)) };
  }
}

function act(s: GameState, style: BotStyle, mind: BotMind) {
  const countdown = walkbyCountdown(s);
  // A ringing phone gets answered (that's working, so it also covers a walk-by).
  if (ringingCall(s) && doTask(s, style, mind)) return;
  // Reaction time of about a second.
  if (style.reactsToWalkbys && countdown !== null && countdown < mods(s).warning - 1) {
    if (doTask(s, style, mind)) return;
    if (!s.lookBusy) setLookBusy(s, true);
    return;
  }
  if (s.lookBusy) {
    if (s.suspicion < style.resumeBelow && countdown === null) setLookBusy(s, false);
    else {
      doTask(s, style, mind);
      return;
    }
  }
  if (s.suspicion > style.hideAbove) {
    if (doTask(s, style, mind)) return;
    setLookBusy(s, true);
    return;
  }
  if (shop(s)) return;

  const w = weapon(s);
  if (s.bands < w.burst) {
    const o = mods(s).order;
    if (s.salary >= o.price + 5) orderSupplies(s);
    else if (doTask(s, style, mind)) return;
    else scrounge(s);
    return;
  }
  if (s.suspicion > style.workAbove) {
    if (doTask(s, style, mind)) return;
    setLookBusy(s, true);
    return;
  }
  // Keep the queue from piling up, and earn early money for the first weapon.
  const early = s.salary < 15 && s.ownedWeapons.length < 2;
  if ((s.work.queue.length >= 3 || early) && doTask(s, style, mind)) return;
  if (!flick(s).ok) doTask(s, style, mind);
}

export { putDown };

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
