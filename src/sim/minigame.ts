// The Boss Key spreadsheet as a mini-game: while you look busy, cells get
// flagged with a red comment corner. Fix flagged cells for Salary; fixes in a
// row build a streak. Clicking a cell that's fine, or letting a flag expire,
// breaks the streak. The longer you hide, the shorter flags last and the less
// each fix pays, so hiding stays a break rather than a place to live.

import { SHEET_TABS, SHEET_TUNING as T, TARGETS, type SheetTabId } from './content';
import { mods } from './mods';
import { rand } from './rng';
import type { GameState } from './state';

export function sheetTab(id: SheetTabId) {
  return SHEET_TABS.find((t) => t.id === id)!;
}

export function tabUnlocked(s: GameState, id: SheetTabId) {
  const t = sheetTab(id);
  if (t.unlock.stage && s.stage < t.unlock.stage) return false;
  if (t.unlock.after) {
    const idx = TARGETS.findIndex((x) => x.id === t.unlock.after);
    if (!(s.stage > 2 || s.targetIndex > idx)) return false;
  }
  return true;
}

/** Input column indices that can be flagged on a tab. */
export function flaggableColumns(id: SheetTabId) {
  return sheetTab(id)
    .columns.map((c, i) => (c.kind === 'input' ? i : -1))
    .filter((i) => i >= 0);
}

function hiddenFor(s: GameState) {
  return s.sheet.hiddenSince === null ? 0 : s.time - s.sheet.hiddenSince;
}

export function flagLifetime(s: GameState) {
  return Math.max(T.lifetimeMin, T.lifetimeStart - T.lifetimeShrink * hiddenFor(s));
}

/** Pay multiplier from fatigue: 1 at first, falling after a while hidden. */
export function fatigue(s: GameState) {
  const over = hiddenFor(s) - T.fatigueAfter;
  return over <= 0 ? 1 : Math.max(T.fatigueFloor, 1 - over * T.fatigueRate);
}

export function streakMult(streak: number) {
  return 1 + T.streakBonus * Math.min(streak, T.streakCap);
}

/** Called from the main step every tick. */
export function stepSheet(s: GameState) {
  const sh = s.sheet;
  if (!s.lookBusy) {
    if (sh.hiddenSince !== null) {
      sh.hiddenSince = null;
      sh.flags = [];
    }
    return;
  }
  if (sh.hiddenSince === null) {
    sh.hiddenSince = s.time;
    sh.nextFlagAt = s.time + 0.3;
  }
  // Expired flags break the streak.
  const before = sh.flags.length;
  sh.flags = sh.flags.filter((f) => f.expiresAt > s.time);
  if (sh.flags.length < before) {
    if (sh.streak > 0) s.events.push({ type: 'sheetMiss', reason: 'expired' });
    sh.streak = 0;
  }
  if (s.time >= sh.nextFlagAt && sh.flags.length < T.maxFlags) {
    sh.nextFlagAt = s.time + T.spawnEvery;
    const tab = sheetTab(sh.tab);
    const cols = flaggableColumns(sh.tab);
    for (let tries = 0; tries < 6; tries++) {
      const row = Math.floor(rand(s) * tab.rows.length);
      const col = cols[Math.floor(rand(s) * cols.length)];
      if (!sh.flags.some((f) => f.row === row && f.col === col)) {
        sh.flags.push({ id: s.seq++, row, col, expiresAt: s.time + flagLifetime(s) });
        break;
      }
    }
  }
}

export type FixResult = { ok: true; pay: number; streak: number; hustle: boolean } | { ok: false };

/** Player clicked a cell on the spreadsheet. */
export function fixCell(s: GameState, row: number, col: number): FixResult {
  const sh = s.sheet;
  if (!s.lookBusy) return { ok: false };
  const i = sh.flags.findIndex((f) => f.row === row && f.col === col);
  if (i < 0) {
    if (sh.streak > 0) s.events.push({ type: 'sheetMiss', reason: 'wrong' });
    sh.streak = 0;
    return { ok: false };
  }
  sh.flags.splice(i, 1);
  sh.streak++;
  sh.best = Math.max(sh.best, sh.streak);
  sh.fixes++;
  const hustle = s.time <= sh.hustleUntil;
  const pay = mods(s).workPay * sheetTab(sh.tab).payMult * streakMult(sh.streak) * fatigue(s) * (hustle ? 2 : 1);
  s.salary += pay;
  s.suspicion = Math.max(0, s.suspicion - T.fixCool);
  s.stats.workEarned += pay;
  // A fixed cell makes room for the next flag a little sooner.
  sh.nextFlagAt = Math.min(sh.nextFlagAt, s.time + 0.35);
  s.events.push({ type: 'fix', row, col, pay, streak: sh.streak, hustle });
  return { ok: true, pay, streak: sh.streak, hustle };
}

export function setSheetTab(s: GameState, id: SheetTabId) {
  if (!tabUnlocked(s, id)) return false;
  s.sheet.tab = id;
  s.sheet.flags = [];
  s.sheet.streak = 0;
  s.sheet.nextFlagAt = s.time + 0.4;
  return true;
}
