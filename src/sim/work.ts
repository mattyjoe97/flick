// Your actual job, done at your computer. Four kinds of work, each played as a short
// round with a clock and a grade (A to F) at the end:
//
//   Mail      a burst of emails: Reply (and pick the reply), Forward to the right
//             department, or Delete
//   Phone     one caller: transfer them to the right extension (the directory changes
//             every day), take it yourself, or hang up on a prank
//   Expenses  a report of receipts: stamp each Approve or Deny by today's rule
//   Sheet     Accounting's printout next to your copy of the sheet: click the cells
//             that were typed wrong (no math, just spot the difference)
//
// Every item done right pays, cools Suspicion and builds the combo; a clean, quick round
// earns a grade bonus on top. Both add Performance toward your next promotion, and each
// promotion multiplies everything work pays. Nothing
// is overdue: a round's clock only runs while you're looking at it.
//
// Everything here is headless and deterministic so the pacing bots can play it.

import { CAREER, COMBO, MOMENTS, PAY_GRADES, POLITICS, SHEET_TABS, TARGETS, WAR, type SheetTabId, type TypoKind } from './content';
import { ballPayMult } from './ball';
import { addReview } from './career';
import { chatEvent } from './chat';
import { has, mods } from './mods';
import { rand, randRange } from './rng';
import { deptPerk, earnPd, type GameState } from './state';
import {
  CALLERS,
  DEPARTMENTS,
  EXPENSE_EXCEPTIONS,
  EXPENSE_RULES,
  MAIL,
  PEOPLE,
  RECEIPTS,
  SUBMITTERS,
  type Department,
  type MailAct,
} from './workdata';

export type WorkKind = 'mail' | 'call' | 'expense' | 'sheet';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface MailItem {
  idx: number; // which email from MAIL
  order: number[]; // how its replies are shuffled on screen (reply emails)
  state: 'open' | 'right' | 'wrong';
  text?: string; // what happened
}

export interface Receipt {
  item: string;
  cat: string;
  amount: number;
  by: string; // who submitted it
  yours?: boolean; // your own rubber band order
  state: 'open' | 'approved' | 'denied';
  right?: boolean;
}

export interface SheetRow {
  label: string;
  cells: number[]; // the printout's numbers (the truth): the parts, then the Total
}

/** A number typed wrong into your copy. */
export interface SheetTypo {
  row: number;
  col: number;
  shown: number; // what your copy says
  found: boolean;
}

export interface SheetCell {
  row: number;
  col: number;
}

export interface Round {
  id: number;
  kind: WorkKind;
  limit: number; // seconds on the clock
  used: number; // seconds used (only ticks while you're looking at it)
  items: number; // things to get right
  done: number;
  right: number;
  mistakes: number;
  earned: number;
  mail?: MailItem[];
  caller?: number; // index into CALLERS
  receipts?: Receipt[];
  rule?: { rule: number; except: number | null };
  sheet?: { tab: SheetTabId; rows: SheetRow[]; typos: SheetTypo[]; misses: SheetCell[] };
}

export interface RoundResult {
  id: number;
  kind: WorkKind;
  grade: Grade;
  right: number;
  items: number;
  pay: number; // everything the round paid, bonus included
  bonus: number;
  at: number;
}

export interface ItemResult {
  ok: boolean;
  pay: number;
  text: string;
  bonusBands?: number;
}

export interface WorkState {
  focus: WorkKind | null; // the app you're looking at (set by the UI)
  rounds: Record<WorkKind, Round | null>;
  mailWaiting: number; // unread work emails
  nextMailAt: number;
  autoAt: number; // Auto-Reply's next email
  expenseAt: number; // the next expense report is ready at this time
  sheetAt: number; // the next spreadsheet is ready at this time
  ringing: { caller: number; until: number } | null;
  nextCallAt: number;
  hustleUntil: number; // Mr. Feeney just walked past: work pays double for a moment
  combo: number; // things done right back to back
  comboAt: number; // when the last one was done
  fraudAt: number[]; // game times you approved your own receipt
  sheetTab: SheetTabId;
  last: RoundResult | null; // the last finished round (the UI shows its grade)
  seq: number;
}

export function newWorkState(): WorkState {
  return {
    focus: null,
    rounds: { mail: null, call: null, expense: null, sheet: null },
    mailWaiting: 0,
    nextMailAt: WORK.firstMailAt,
    autoAt: 0,
    expenseAt: WORK.firstExpenseAt,
    sheetAt: 0,
    ringing: null,
    nextCallAt: WORK.firstCallAt,
    hustleUntil: -999,
    combo: 0,
    comboAt: -999,
    fraudAt: [],
    sheetTab: 'forecast',
    last: null,
    seq: 1,
  };
}

// ---------------------------------------------------------------- tuning

export const WORK = {
  // Mail
  firstMailAt: 4,
  mailGap: [9, 15] as [number, number], // a new work email lands this often
  mailSoon: 0.6, // looking at Mail with nothing to do: a fresh burst lands this fast
  mailMax: 10,
  mailSeconds: 7, // on the clock per email
  // The phone
  firstCallAt: 50,
  callGap: [60, 110] as [number, number],
  ringSeconds: 9,
  callSeconds: 12, // how long a caller waits on the line
  bossRelief: 15, // Mr. Feeney calls and you answer properly
  bossNoise: 8,
  // Expenses
  firstExpenseAt: 15,
  expenseGap: 6,
  receiptSeconds: 5,
  // Spreadsheet
  sheetGap: 4,
  sheetMissNoise: 1, // clicking a cell that matched the printout (a small slip, not a scandal)
  // Pay per item done right, before your pay grade, the chair and the combo.
  pay: { mail: 3, call: 12, expense: 2.4, sheet: 7 } as Record<WorkKind, number>,
  relief: { mail: 3, call: 6, expense: 2, sheet: 3 } as Record<WorkKind, number>,
  wrongNoise: 3,
  replyAllNoise: 8,
  // A round with no mistakes, done with this share of the clock or less, is an A.
  fastShare: 0.6,
  gradeBonus: { A: 0.3, B: 0.1, C: 0, D: 0, F: 0 } as Record<Grade, number>,
  autoReplyEvery: 20, // Email Auto-Reply answers one waiting email this often (half pay)
  autoReplyShare: 0.5,
  fraudBands: 150, // bands per stage when you approve your own rubber band receipt
  fraudNoise: 3, // Suspicion, times the number of recent approvals
  fraudMemory: 600,
  hustleWindow: 2.5, // seconds after Mr. Feeney passes where work pays double
  dayLength: 480, // seconds in an office day (the phone directory and the expense rule change daily)
};

/** Emails in a burst: three at first, five once you're Senior Associate. */
export function burstSize(s: GameState) {
  return 3 + Math.min(2, Math.floor(payGradeIndex(s) / 2));
}

/** Receipts in a report: four, five once you're Senior Associate. */
function receiptCount(s: GameState) {
  return payGradeIndex(s) >= 3 ? 5 : 4;
}

// ---------------------------------------------------------------- pay grade and combo

export function payGradeIndex(s: GameState) {
  return Math.min(PAY_GRADES.length - 1, Math.max(0, s.career?.rank ?? 0));
}

/** Your pay grade: up one with every promotion. */
export function payGrade(s: GameState) {
  return PAY_GRADES[payGradeIndex(s)];
}

/** What one item of this kind pays right now, before the combo. */
export function basePay(s: GameState, kind: WorkKind) {
  const tab = kind === 'sheet' ? SHEET_TABS.find((t) => t.id === activeTab(s))!.payMult : 1;
  return WORK.pay[kind] * payGrade(s).mult * mods(s).workPay * tab * ballPayMult(s) * (deptPerk(s, 'accounting') ? WAR.accountingPay : 1);
}

/** The combo still running (it lapses if you go too long without finishing something). */
export function liveCombo(s: GameState) {
  return s.time - s.work.comboAt <= COMBO.window ? s.work.combo : 0;
}

/** ×1 for the first thing, +25% for each one after it in a row, up to ×3. */
export function comboMult(s: GameState) {
  return 1 + COMBO.step * Math.min(COMBO.cap, Math.max(0, liveCombo(s) - 1));
}

/** Something done right keeps the combo going; a mistake ends it. */
export function workCombo(s: GameState, ok: boolean) {
  const w = s.work;
  if (ok) {
    w.combo = liveCombo(s) + 1;
    w.comboAt = s.time;
    s.stats.bestCombo = Math.max(s.stats.bestCombo ?? 0, w.combo);
  } else w.combo = 0;
}

// ---------------------------------------------------------------- daily rules

function day(s: GameState) {
  return Math.floor(s.time / WORK.dayLength);
}

/** Today's phone directory: department → extension (it gets reshuffled every morning). */
export function directory(s: GameState): Record<Department, number> {
  const offset = (day(s) * 5) % DEPARTMENTS.length;
  const out = {} as Record<Department, number>;
  DEPARTMENTS.forEach((d, i) => (out[d] = 2 + ((i + offset) % DEPARTMENTS.length)));
  return out;
}

/** The department a caller (or a person they asked for) needs. */
export function callerDept(caller: number): Department | null {
  const c = CALLERS[caller];
  return c.dept ?? (c.person ? PEOPLE[c.person] : null);
}

/** Today's expense rule (and, once you're a Specialist, an exception on top). */
export function todaysRule(s: GameState) {
  const d = day(s);
  return { rule: d % EXPENSE_RULES.length, except: payGradeIndex(s) >= 4 ? d % EXPENSE_EXCEPTIONS.length : null };
}

export function ruleText(rule: { rule: number; except: number | null }) {
  const r = EXPENSE_RULES[rule.rule].text;
  return rule.except === null ? `${r} Deny everything else.` : `${r} Deny everything else. ${EXPENSE_EXCEPTIONS[rule.except].text}`;
}

/** By the rule: should this receipt be approved? (Your own receipt never qualifies.) */
export function receiptOk(r: Receipt, rule: { rule: number; except: number | null }) {
  if (r.yours) return false;
  if (rule.except !== null && r.by === EXPENSE_EXCEPTIONS[rule.except].by) return false;
  return EXPENSE_RULES[rule.rule].ok(r);
}

// ---------------------------------------------------------------- the spreadsheet tabs

export function tabUnlocked(s: GameState, id: SheetTabId) {
  const t = SHEET_TABS.find((x) => x.id === id)!;
  if (t.unlock.stage && s.stage < t.unlock.stage) return false;
  if (t.unlock.after) {
    const idx = TARGETS.findIndex((x) => x.id === t.unlock.after);
    if (!(s.stage > 2 || s.targetIndex > idx)) return false;
  }
  return true;
}

function activeTab(s: GameState): SheetTabId {
  const r = s.work.rounds.sheet;
  if (r?.sheet) return r.sheet.tab;
  return tabUnlocked(s, s.work.sheetTab) ? s.work.sheetTab : 'forecast';
}

/** Pick which spreadsheet you'll work on next (harder ones pay more). */
export function setSheetTab(s: GameState, id: SheetTabId) {
  if (!tabUnlocked(s, id) || s.work.rounds.sheet) return false;
  s.work.sheetTab = id;
  return true;
}

// ---------------------------------------------------------------- what's waiting

/** What's ready for you on each app (for badges and the Start buttons). */
export function workReady(s: GameState) {
  const w = s.work;
  return {
    mail: w.mailWaiting,
    call: !!w.ringing,
    expense: !!w.rounds.expense || s.time >= w.expenseAt,
    sheet: !!w.rounds.sheet || s.time >= w.sheetAt,
  };
}

export function ringingCall(s: GameState) {
  return s.work.ringing;
}

// ---------------------------------------------------------------- the step

/** Advances work: new emails, the phone, round clocks, Auto-Reply. */
export function stepWork(s: GameState, dt: number) {
  const w = s.work;

  // Work email trickles in; sitting in Mail with nothing to do, a fresh burst lands fast.
  const waitingInMail = s.lookBusy && w.focus === 'mail' && !w.rounds.mail && w.mailWaiting < burstSize(s);
  if (waitingInMail) w.nextMailAt = Math.min(w.nextMailAt, s.time + WORK.mailSoon);
  if (s.time >= w.nextMailAt) {
    w.nextMailAt = s.time + (waitingInMail ? WORK.mailSoon : randRange(s, WORK.mailGap[0], WORK.mailGap[1]));
    if (w.mailWaiting < WORK.mailMax) {
      w.mailWaiting++;
      s.events.push({ type: 'workReady', kind: 'mail' });
    }
  }

  // Email Auto-Reply answers emails nobody has opened, now and then, at half pay.
  if (w.mailWaiting === 0 || w.rounds.mail) w.autoAt = s.time + WORK.autoReplyEvery;
  else if (has(s, 'autoreply') && s.time >= w.autoAt) {
    w.autoAt = s.time + WORK.autoReplyEvery;
    w.mailWaiting--;
    const pay = basePay(s, 'mail') * WORK.autoReplyShare;
    s.salary += pay;
    s.stats.workEarned += pay;
    s.stats.tasksAuto++;
    s.events.push({ type: 'taskAuto', kind: 'mail', who: 'Auto-Reply' });
  }

  // The desk phone rings now and then. Letting it ring out costs nothing.
  if (!w.ringing && !w.rounds.call && s.time >= w.nextCallAt) {
    w.nextCallAt = s.time + randRange(s, WORK.callGap[0], WORK.callGap[1]);
    w.ringing = { caller: pickCaller(s), until: s.time + WORK.ringSeconds };
    s.events.push({ type: 'workReady', kind: 'call' });
  }
  if (w.ringing && s.time >= w.ringing.until) {
    w.ringing = null;
    s.stats.callsMissed++;
    s.events.push({ type: 'callMissed' });
  }

  // Round clocks only run while you're looking at that round.
  for (const kind of ['mail', 'call', 'expense', 'sheet'] as WorkKind[]) {
    const r = w.rounds[kind];
    if (!r || !s.lookBusy || w.focus !== kind) continue;
    r.used += dt;
    if (r.used >= r.limit) finishRound(s, kind);
  }

  w.fraudAt = w.fraudAt.filter((t) => s.time - t < WORK.fraudMemory);
}

/** The UI says which app you're looking at. Walking away from the phone ends the call. */
export function focusApp(s: GameState, kind: WorkKind | null) {
  const w = s.work;
  if (w.focus === 'call' && kind !== 'call' && w.rounds.call) {
    w.rounds.call = null;
    s.events.push({ type: 'callMissed' });
  }
  w.focus = kind;
}

// ---------------------------------------------------------------- starting a round

function pick<T>(s: GameState, list: readonly T[]) {
  return list[Math.floor(rand(s) * list.length) % list.length];
}

function shuffled(s: GameState, n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickCaller(s: GameState) {
  // Mr. Feeney only calls once you're worth checking on.
  for (let tries = 0; tries < 6; tries++) {
    const i = Math.floor(rand(s) * CALLERS.length) % CALLERS.length;
    if (!CALLERS[i].boss || s.stats.tasksDone > 10) return i;
  }
  return 0;
}

function newRound(s: GameState, kind: WorkKind, items: number, limit: number): Round {
  return { id: s.work.seq++, kind, limit, used: 0, items, done: 0, right: 0, mistakes: 0, earned: 0 };
}

/** Open the next round of Mail, Expenses or Spreadsheet (if one is ready). */
export function startRound(s: GameState, kind: 'mail' | 'expense' | 'sheet'): Round | null {
  const w = s.work;
  if (w.rounds[kind]) return w.rounds[kind];
  let r: Round;
  if (kind === 'mail') {
    if (w.mailWaiting <= 0) return null;
    const n = Math.min(burstSize(s), w.mailWaiting);
    w.mailWaiting -= n;
    const picks = shuffled(s, MAIL.length).slice(0, n);
    r = newRound(s, 'mail', n, n * WORK.mailSeconds);
    r.mail = picks.map((idx) => ({ idx, order: shuffled(s, 3), state: 'open' }));
  } else if (kind === 'expense') {
    if (s.time < w.expenseAt) return null;
    const rule = todaysRule(s);
    const receipts = makeReceipts(s, receiptCount(s), rule);
    r = newRound(s, 'expense', receipts.filter((x) => !x.yours).length, receipts.length * WORK.receiptSeconds);
    r.receipts = receipts;
    r.rule = rule;
  } else {
    if (s.time < w.sheetAt) return null;
    const tab = SHEET_TABS.find((t) => t.id === activeTab(s))!;
    const sheet = makeSheet(s, tab);
    r = newRound(s, 'sheet', sheet.typos.length, tab.seconds);
    r.sheet = { tab: tab.id, ...sheet, misses: [] };
  }
  w.rounds[kind] = r;
  s.lookBusy = true;
  s.events.push({ type: 'roundStart', kind });
  return r;
}

/** Pick up the ringing phone. That puts you at your computer. */
export function answerPhone(s: GameState): Round | null {
  const w = s.work;
  if (w.rounds.call) return w.rounds.call;
  if (!w.ringing) return null;
  const r = newRound(s, 'call', 1, WORK.callSeconds);
  r.caller = w.ringing.caller;
  w.ringing = null;
  w.rounds.call = r;
  w.focus = 'call';
  s.lookBusy = true;
  s.events.push({ type: 'roundStart', kind: 'call' });
  return r;
}

function makeReceipts(s: GameState, n: number, rule: { rule: number; except: number | null }): Receipt[] {
  // Re-roll until the report has at least one to approve and one to deny.
  let out: Receipt[] = [];
  for (let tries = 0; tries < 8; tries++) {
    out = shuffled(s, RECEIPTS.length)
      .slice(0, n)
      .map((i) => {
        const t = RECEIPTS[i];
        return { item: t.item, cat: t.cat, amount: Math.round(randRange(s, t.lo, t.hi)), by: pick(s, SUBMITTERS), state: 'open' as const };
      });
    const oks = out.filter((r) => receiptOk(r, rule)).length;
    if (oks > 0 && oks < n) break;
  }
  // Sometimes your own rubber band order is in the pile.
  if (rand(s) < 0.4) {
    const count = pick(s, [8000, 12000, 20000, 40000]);
    out.splice(Math.floor(rand(s) * (n + 1)) % (n + 1), 0, {
      item: `Rubber bands, assorted (×${count.toLocaleString('en-US')})`,
      cat: 'Office supplies',
      amount: Math.round(count / 100 + randRange(s, 5, 30)),
      by: 'You',
      yours: true,
      state: 'open',
    });
  }
  return out;
}

function makeSheet(s: GameState, tab: (typeof SHEET_TABS)[number]): { rows: SheetRow[]; typos: SheetTypo[] } {
  const steps = Math.floor((tab.hi - tab.lo) / tab.step);
  const rows: SheetRow[] = tab.rows.map((label) => {
    const parts = tab.parts.map(() => tab.lo + Math.floor(rand(s) * (steps + 1)) * tab.step);
    return { label, cells: [...parts, parts.reduce((a, b) => a + b, 0)] };
  });
  // One typo per row (in different rows), in any column, the Total included.
  const typos: SheetTypo[] = [];
  for (const row of shuffled(s, rows.length).slice(0, tab.typos)) {
    const col = Math.floor(rand(s) * rows[row].cells.length) % rows[row].cells.length;
    const truth = rows[row].cells[col];
    let shown: number | null = null;
    for (const kind of shuffled(s, tab.kinds.length).map((k) => tab.kinds[k])) {
      shown = mistype(s, truth, kind, tab.step);
      if (shown !== null) break;
    }
    typos.push({ row, col, shown: shown ?? mistype(s, truth, 'wrong', tab.step)!, found: false });
  }
  return { rows, typos };
}

/** `v` as someone in a hurry might type it, or null if this kind of typo doesn't fit it. */
export function mistype(s: GameState, v: number, kind: TypoKind, step: number): number | null {
  const digits = String(v).split('');
  let out: number | null = null;
  if (kind === 'wrong') {
    // Clearly different: at least a third off, still a round number like the rest.
    const off = Math.max(step, Math.round((v * (0.35 + rand(s) * 0.5)) / step) * step);
    out = rand(s) < 0.5 && v - off > 0 ? v - off : v + off;
  } else if (kind === 'zero') {
    out = v % 10 === 0 && rand(s) < 0.4 ? v / 10 : v * 10;
  } else if (kind === 'swap') {
    const spots = digits.map((_, i) => i).filter((i) => i + 1 < digits.length && digits[i] !== digits[i + 1] && !(i === 0 && digits[1] === '0'));
    if (!spots.length) return null;
    const i = pick(s, spots);
    [digits[i], digits[i + 1]] = [digits[i + 1], digits[i]];
    out = Number(digits.join(''));
  } else {
    // One digit nudged by 1 or 2 (never the leading digit down to zero).
    const i = Math.floor(rand(s) * digits.length) % digits.length;
    const d = Number(digits[i]);
    const options = [d - 2, d - 1, d + 1, d + 2].filter((x) => x >= (i === 0 ? 1 : 0) && x <= 9);
    if (!options.length) return null;
    digits[i] = String(pick(s, options));
    out = Number(digits.join(''));
  }
  return out !== null && out > 0 && out !== v ? out : null;
}

/** What your copy of the sheet says in a cell right now. */
export function sheetValue(r: Round, row: number, col: number) {
  const t = r.sheet!.typos.find((x) => x.row === row && x.col === col);
  return t && !t.found ? t.shown : r.sheet!.rows[row].cells[col];
}

/** The typos still to find (bots and tests). */
export function typosLeft(r: Round) {
  return r.sheet!.typos.filter((t) => !t.found);
}

// ---------------------------------------------------------------- answering

/** One thing in a round done (right or wrong): pay, combo, Suspicion, and maybe the round's end. */
function itemDone(s: GameState, r: Round, ok: boolean, text: string, extra: { noise?: number; relief?: number; payMult?: number } = {}): ItemResult {
  const w = s.work;
  r.done++;
  if (ok) r.right++;
  else r.mistakes++;
  workCombo(s, ok);
  const hustle = s.time <= w.hustleUntil;
  const pizza = s.time < (s.office?.pizzaUntil ?? -1) ? MOMENTS.pizzaWork : 1;
  const pay = ok ? basePay(s, r.kind) * (extra.payMult ?? 1) * comboMult(s) * (hustle ? 2 : 1) * pizza : 0;
  r.earned += pay;
  s.salary += pay;
  s.stats.workEarned += pay;
  if (ok) {
    s.stats.tasksDone++;
    addReview(s, CAREER.itemPoints * payGrade(s).mult);
    s.suspicion = Math.max(0, s.suspicion - (extra.relief ?? WORK.relief[r.kind]));
  } else {
    s.stats.tasksWrong++;
    bump(s, extra.noise ?? WORK.wrongNoise);
  }
  const shown = hustle && ok ? `${text} (Mr. Feeney saw that: double pay.)` : text;
  s.events.push({ type: 'itemDone', kind: r.kind, ok, pay, text: shown });
  if (pay > 0) s.events.push({ type: 'pay', amount: pay, source: 'work', combo: liveCombo(s) });
  return { ok, pay, text: shown };
}

export type MailAnswer = { act: 'reply'; choice: number } | { act: 'forward'; dept: Department } | { act: 'delete' };

/** Handle email `i` of the burst you have open. For a reply, `choice` is the reply's position on screen. */
export function answerMail(s: GameState, i: number, a: MailAnswer): ItemResult | null {
  const r = s.work.rounds.mail;
  const item = r?.mail?.[i];
  if (!r || !item || item.state !== 'open') return null;
  const m = MAIL[item.idx];
  let ok = false;
  let text = '';
  let noise = WORK.wrongNoise;
  if (m.act === 'reply') {
    if (a.act === 'reply') {
      const reply = m.replies![item.order[a.choice] ?? 0];
      ok = !!reply.ok;
      text = reply.result;
      if (reply.replyAll) noise = WORK.replyAllNoise;
    } else text = a.act === 'delete' ? `You deleted it. ${m.from} is still waiting for an answer.` : `It was for you. ${m.from} forwards it straight back.`;
  } else if (m.act === 'forward') {
    if (a.act === 'forward' && a.dept === m.dept) {
      ok = true;
      text = m.done ?? `Forwarded to ${m.dept}.`;
    } else if (a.act === 'forward') text = `${a.dept} sends it back. It was for ${m.dept}.`;
    else if (a.act === 'delete') text = `You deleted it. It was for ${m.dept}, and now they’re calling about it.`;
    else text = `You replied, confidently and wrongly. It was for ${m.dept}.`;
  } else {
    if (a.act === 'delete') {
      ok = true;
      text = m.done ?? 'Deleted.';
    } else if (a.act === 'reply') text = 'You replied to spam. Now you get twice as much.';
    else text = `You forwarded spam to ${a.dept}. ${a.dept} is not amused.`;
  }
  item.state = ok ? 'right' : 'wrong';
  item.text = text;
  const res = itemDone(s, r, ok, text, { noise });
  if (r.mail!.every((x) => x.state !== 'open')) finishRound(s, 'mail');
  return res;
}

export type CallAnswer = { act: 'transfer'; ext: number } | { act: 'self' } | { act: 'hangup' };

/** Deal with the caller on the line. */
export function answerCall(s: GameState, a: CallAnswer): ItemResult | null {
  const r = s.work.rounds.call;
  if (!r || r.caller === undefined || r.done > 0) return null;
  const c = CALLERS[r.caller];
  const want = callerDept(r.caller);
  const dir = directory(s);
  const got = a.act === 'transfer' ? (Object.keys(dir) as Department[]).find((d) => dir[d] === a.ext) ?? null : null;
  let ok = false;
  let text = '';
  if (c.prank) {
    ok = a.act === 'hangup';
    text = ok ? 'Click. Somewhere on Floor 4, someone sighs.' : 'You played along. Now the prank is about you.';
  } else if (c.self) {
    ok = a.act === 'self';
    if (c.boss) text = ok ? '"Good, good. Keep it up." Mr. Feeney hangs up, satisfied.' : '"Who was that?" Mr. Feeney makes a note.';
    else text = ok ? 'It was for you. Sorted.' : a.act === 'hangup' ? 'You hung up on someone who needed you.' : 'They wanted you. They call back, annoyed.';
  } else if (want) {
    ok = got === want;
    const who = c.person ? `${c.person} (${want})` : want;
    if (ok) text = `Transferred to ${who}. The caller thanks you.`;
    else if (a.act === 'hangup') text = `You hung up on them. They wanted ${who}.`;
    else if (a.act === 'self') text = `You tried to help them yourself. They wanted ${who}.`;
    else text = `You sent them to ${got ?? 'a dial tone'}. They wanted ${who}.`;
  }
  const res = itemDone(s, r, ok, text, c.boss ? { relief: WORK.bossRelief, noise: WORK.bossNoise } : {});
  finishRound(s, 'call');
  return res;
}

/** Stamp receipt `i` of the open report Approved or Denied. */
export function stampReceipt(s: GameState, i: number, approve: boolean): ItemResult | null {
  const r = s.work.rounds.expense;
  const rc = r?.receipts?.[i];
  if (!r || !rc || rc.state !== 'open' || !r.rule) return null;
  rc.state = approve ? 'approved' : 'denied';
  if (rc.yours) {
    let res: ItemResult = { ok: true, pay: 0, text: 'Denied your own rubber bands. Very ethical.' };
    if (approve) {
      // Approving your own rubber band order: free bands, and Accounting notices.
      s.work.fraudAt.push(s.time);
      const bands = WORK.fraudBands * Math.max(1, s.stage);
      s.bands += bands;
      bump(s, WORK.fraudNoise * s.work.fraudAt.length);
      s.stats.receiptsFudged++;
      res = { ok: true, pay: 0, text: `Your rubber band order was "reimbursed": +${bands} bands. Accounting squints.`, bonusBands: bands };
    }
    s.events.push({ type: 'itemDone', kind: 'expense', ok: true, pay: 0, text: res.text });
    if (r.receipts!.every((x) => x.state !== 'open')) finishRound(s, 'expense');
    return res;
  }
  const should = receiptOk(rc, r.rule);
  const ok = approve === should;
  rc.right = ok;
  const res = itemDone(s, r, ok, ok ? (approve ? 'Approved.' : 'Denied.') : `By today’s rule that one should be ${should ? 'approved' : 'denied'}.`);
  if (r.receipts!.every((x) => x.state !== 'open')) finishRound(s, 'expense');
  return res;
}

/**
 * Click a cell of your copy that you think doesn't match the printout. A typo gets fixed
 * (and pays); a cell that was fine counts as a mistake, once per cell.
 */
export function checkCell(s: GameState, row: number, col: number): ItemResult | null {
  const r = s.work.rounds.sheet;
  const sh = r?.sheet;
  if (!r || !sh || !sh.rows[row] || col < 0 || col >= sh.rows[row].cells.length) return null;
  const typo = sh.typos.find((t) => t.row === row && t.col === col);
  if (typo) {
    if (typo.found) return null;
    typo.found = true;
    const res = itemDone(s, r, true, `Fixed: the printout says ${sh.rows[row].cells[col].toLocaleString('en-US')}.`);
    if (sh.typos.every((t) => t.found)) finishRound(s, 'sheet');
    return res;
  }
  if (sh.misses.some((m) => m.row === row && m.col === col)) return null;
  // A slip: it matched. A mistake for the grade and the combo, but not an item.
  sh.misses.push({ row, col });
  r.mistakes++;
  workCombo(s, false);
  s.stats.tasksWrong++;
  bump(s, WORK.sheetMissNoise);
  const text = 'That one matches the printout.';
  s.events.push({ type: 'itemDone', kind: 'sheet', ok: false, pay: 0, text });
  return { ok: false, pay: 0, text };
}

// ---------------------------------------------------------------- the end of a round

function gradeFor(r: Round): Grade {
  const mistakes = r.mistakes + (r.items - r.done);
  if (mistakes === 0) return r.used <= r.limit * WORK.fastShare ? 'A' : 'B';
  const share = mistakes / Math.max(1, r.items);
  return share <= 0.34 ? 'C' : share <= 0.5 ? 'D' : 'F';
}

/** Grades a round (unfinished items count as mistakes) and pays the grade bonus. */
export function finishRound(s: GameState, kind: WorkKind) {
  const w = s.work;
  const r = w.rounds[kind];
  if (!r) return;
  w.rounds[kind] = null;
  if (r.done < r.items) workCombo(s, false); // ran out of time
  const grade = gradeFor(r);
  const bonus = r.earned * WORK.gradeBonus[grade];
  s.salary += bonus;
  s.stats.workEarned += bonus;
  s.stats.rounds = (s.stats.rounds ?? 0) + 1;
  addReview(s, CAREER.gradePoints[grade]);
  // Stage 5: real work earns Plausible Deniability (more for a good grade).
  earnPd(s, POLITICS.pd.grade[grade]);
  const st = s.stats as unknown as Record<string, number>;
  st[`${kind}Rounds`] = (st[`${kind}Rounds`] ?? 0) + 1;
  if (kind === 'sheet' && grade === 'A') s.stats.sheetA = (s.stats.sheetA ?? 0) + 1;
  if (grade === 'A') {
    s.stats.gradeA = (s.stats.gradeA ?? 0) + 1;
    if (kind !== 'call') chatEvent(s, 'grade:A');
  }
  if (kind === 'expense') w.expenseAt = s.time + WORK.expenseGap;
  if (kind === 'sheet') w.sheetAt = s.time + WORK.sheetGap;
  w.last = { id: r.id, kind, grade, right: r.right, items: r.items, pay: r.earned + bonus, bonus, at: s.time };
  s.events.push({ type: 'roundDone', kind, grade, pay: r.earned + bonus, bonus, right: r.right, items: r.items });
  if (bonus > 0) s.events.push({ type: 'pay', amount: bonus, source: 'work', combo: liveCombo(s) });
}

// ---------------------------------------------------------------- right answers (bots and tests)

export function correctMail(item: MailItem): MailAnswer {
  const m = MAIL[item.idx];
  if (m.act === 'reply') return { act: 'reply', choice: item.order.indexOf(m.replies!.findIndex((x) => x.ok)) };
  if (m.act === 'forward') return { act: 'forward', dept: m.dept! };
  return { act: 'delete' };
}

export function correctCall(s: GameState, caller: number): CallAnswer {
  const c = CALLERS[caller];
  if (c.prank) return { act: 'hangup' };
  if (c.self) return { act: 'self' };
  return { act: 'transfer', ext: directory(s)[callerDept(caller)!] };
}

export function correctStamp(r: Round, i: number) {
  const rc = r.receipts![i];
  return rc.yours ? false : receiptOk(rc, r.rule!);
}

/** What a mail item needs (for the UI's hint after it's handled). */
export function mailAct(item: MailItem): MailAct {
  return MAIL[item.idx].act;
}

// ---------------------------------------------------------------- Suspicion

/** Raise Suspicion through the engine (lazily set to avoid an import cycle). */
let suspicionHook: ((s: GameState, amount: number) => void) | null = null;
export function setSuspicionHook(fn: (s: GameState, amount: number) => void) {
  suspicionHook = fn;
}
function bump(s: GameState, amount: number) {
  if (suspicionHook) suspicionHook(s, amount);
  else s.suspicion += amount;
}
