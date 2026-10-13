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
  work,
} from '../src/sim/engine';
import { mods, weapon } from '../src/sim/mods';
import { newGame, type GameState } from '../src/sim/state';

export interface BotStyle {
  name: string;
  actionsPerSecond: number;
  hideAbove: number; // Suspicion level that makes the bot hide
  resumeBelow: number;
  workAbove: number; // Suspicion level where it does work instead of firing
  reactsToWalkbys: boolean;
}

export const STYLES: BotStyle[] = [
  { name: 'careful', actionsPerSecond: 3, hideAbove: 70, resumeBelow: 20, workAbove: 50, reactsToWalkbys: true },
  { name: 'aggressive', actionsPerSecond: 4, hideAbove: 95, resumeBelow: 40, workAbove: 90, reactsToWalkbys: true },
  { name: 'oblivious', actionsPerSecond: 3, hideAbove: 101, resumeBelow: 0, workAbove: 101, reactsToWalkbys: false },
];

/** Plays the game headlessly and returns the final state. */
export function playBot(style: BotStyle, maxSeconds = 4 * 3600, seed = 12345): GameState {
  const s = newGame(seed);
  const actionEvery = 1 / style.actionsPerSecond;
  let nextAction = 0;
  const steps = Math.round(maxSeconds / TUNING.stepSeconds);
  for (let i = 0; i < steps && s.stage < 3; i++) {
    step(s, TUNING.stepSeconds);
    s.events.length = 0;
    if (s.time >= nextAction) {
      nextAction = s.time + actionEvery;
      act(s, style);
    }
  }
  return s;
}

function act(s: GameState, style: BotStyle) {
  const countdown = walkbyCountdown(s);
  // Reaction time of about a second.
  if (style.reactsToWalkbys && countdown !== null && countdown < mods(s).warning - 1) {
    if (!s.lookBusy) setLookBusy(s, true);
    work(s);
    return;
  }
  if (s.lookBusy) {
    if (s.suspicion < style.resumeBelow && countdown === null) setLookBusy(s, false);
    else {
      work(s);
      return;
    }
  }
  if (s.suspicion > style.hideAbove) {
    setLookBusy(s, true);
    return;
  }
  if (shop(s)) return;

  const w = weapon(s);
  if (s.bands < w.burst) {
    const o = mods(s).order;
    if (s.salary >= o.price + 5) orderSupplies(s);
    else if (s.salary < 20 && s.stage === 1) scrounge(s);
    else scrounge(s);
    return;
  }
  if (s.suspicion > style.workAbove) {
    work(s);
    return;
  }
  // Keep some salary flowing early.
  if (s.salary < 5 && s.ownedWeapons.length < 2 && s.time > 20) {
    work(s);
    return;
  }
  if (!flick(s).ok) work(s);
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
