// The Spreadsheet app on your computer as a mini-game: while it's open, cells get
// flagged with a red comment corner. Fix flagged cells for Salary; fixes in a
// row build your work combo. Clicking a cell that's fine, or letting a flag expire,
// breaks it. The longer you stay, the shorter flags last.

import { SHEET_TABS, SHEET_TUNING as T, TARGETS, type SheetTabId } from './content';
import { mods } from './mods';
import { comboMult, payGrade, workCombo } from './work';
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
  // Flags only appear while the Spreadsheet app is open on your computer.
  if (!sh.open) {
    sh.flags = [];
    return;
  }
  // Expired flags break the streak.
  const before = sh.flags.length;
  sh.flags = sh.flags.filter((f) => f.expiresAt > s.time);
  if (sh.flags.length < before) {
    if (sh.streak > 0) s.events.push({ type: 'sheetMiss', reason: 'expired' });
    sh.streak = 0;
    workCombo(s, false);
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
  if (!s.lookBusy || !sh.open) return { ok: false };
  const i = sh.flags.findIndex((f) => f.row === row && f.col === col);
  if (i < 0) {
    if (sh.streak > 0) s.events.push({ type: 'sheetMiss', reason: 'wrong' });
    sh.streak = 0;
    workCombo(s, false);
    return { ok: false };
  }
  sh.flags.splice(i, 1);
  sh.streak++;
  sh.best = Math.max(sh.best, sh.streak);
  sh.fixes++;
  const hustle = s.time <= sh.hustleUntil;
  workCombo(s, true);
  const pay = T.fixPay * payGrade(s).mult * mods(s).workPay * sheetTab(sh.tab).payMult * comboMult(s) * (hustle ? 2 : 1);
  s.salary += pay;
  s.suspicion = Math.max(0, s.suspicion - T.fixCool);
  s.stats.workEarned += pay;
  // A fixed cell makes room for the next flag a little sooner.
  sh.nextFlagAt = Math.min(sh.nextFlagAt, s.time + 0.35);
  s.events.push({ type: 'fix', row, col, pay, streak: sh.streak, hustle });
  s.events.push({ type: 'pay', amount: pay, source: 'work', combo: s.work.combo });
  return { ok: true, pay, streak: sh.streak, hustle };
}

/** The Spreadsheet app was opened or closed on your computer. */
export function setSheetOpen(s: GameState, open: boolean) {
  const sh = s.sheet;
  if (sh.open === open) return;
  sh.open = open;
  sh.flags = [];
  sh.streak = 0;
  sh.nextFlagAt = s.time + 0.4;
}

export function setSheetTab(s: GameState, id: SheetTabId) {
  if (!tabUnlocked(s, id)) return false;
  s.sheet.tab = id;
  s.sheet.flags = [];
  s.sheet.streak = 0;
  s.sheet.nextFlagAt = s.time + 0.4;
  return true;
}
