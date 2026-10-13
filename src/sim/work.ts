// Your actual job. Tasks land in your queue on their own: emails to answer, a
// ringing phone, budget sheets to check, expense reports to approve. Each one is
// a short mini-game. Doing them well pays Salary and lowers Suspicion; letting
// them pile up (or letting the phone ring out) makes you look like a slacker.
//
// While a task is open you're genuinely working: you can't flick, but a walk-by
// counts as hidden. Everything here is headless and deterministic so the pacing
// bots can play it too.

import { has, mods, rolePower } from './mods';
import { rand, randRange } from './rng';
import { pushTicker, type GameState } from './state';

export type TaskKind = 'email' | 'call' | 'sheet' | 'expense';

export interface EmailData {
  idx: number; // which prompt from EMAILS
  order: number[]; // how its replies are shuffled on screen
}
export interface CallData {
  caller: number; // which request from CALLERS
  ringUntil: number; // game time the phone stops ringing
  answeredAt: number | null;
}
export interface SheetRow {
  name: string;
  budget: number;
  actual: number;
}
export interface Receipt {
  item: string;
  cat: string;
  amount: number;
  yours?: boolean; // your own rubber band order
}

export type WorkTask =
  | { id: number; kind: 'email'; arrivedAt: number; data: EmailData }
  | { id: number; kind: 'call'; arrivedAt: number; data: CallData }
  | { id: number; kind: 'sheet'; arrivedAt: number; data: { rows: SheetRow[] } }
  | { id: number; kind: 'expense'; arrivedAt: number; data: { receipts: Receipt[] } };

export type TaskAnswer =
  | { kind: 'email'; choice: number } // position on screen (0-2)
  | { kind: 'call'; ext: number }
  | { kind: 'sheet'; flagged: number[] } // row positions
  | { kind: 'expense'; approve: boolean[] }; // one per receipt, in order

export interface TaskResult {
  ok: boolean;
  pay: number;
  suspicion: number; // change applied (negative = relief)
  text: string;
  bonusBands?: number;
}

export interface WorkState {
  queue: WorkTask[];
  nextAt: number;
  activeId: number | null;
  activeSince: number;
  seq: number;
  coverTimer: number;
  fraudAt: number[]; // game times you approved your own receipt
}

export function newWorkState(): WorkState {
  return { queue: [], nextAt: WORK.firstTaskAt, activeId: null, activeSince: 0, seq: 1, coverTimer: 0, fraudAt: [] };
}

// ---------------------------------------------------------------- tuning

export const WORK = {
  firstTaskAt: 6,
  gapStage1: [14, 22] as [number, number],
  gapStage2: [12, 20] as [number, number],
  maxQueue: 6,
  overdueAfter: 75, // seconds a task can wait before people notice
  overdueRate: 0.1, // Suspicion per second per overdue task (and no cooling while any are overdue)
  overdueCountCap: 3,
  droppedNoise: 2, // a task pushed out of a full queue
  ringSeconds: 9,
  missedCallNoise: 4,
  hangUpNoise: 2,
  wrongNoise: 3,
  replyAllNoise: 8,
  // Pay at Stage 1 (times stageMult), and Suspicion relief, per task done right.
  pay: { email: 5, call: 6, sheet: 9, expense: 8 } as Record<TaskKind, number>,
  relief: { email: 10, call: 11, sheet: 15, expense: 13 } as Record<TaskKind, number>,
  fast: { email: 5, call: 6, sheet: 10, expense: 12 } as Record<TaskKind, number>, // seconds for the speed bonus
  fastBonus: 0.5,
  stageMult: [1, 1, 2.5, 2.5],
  workingCountsFor: 45, // an open task hides you from a walk-by for this long
  autoReplyAfter: 20, // Email Auto-Reply answers emails that wait this long (half pay)
  coverEvery: 40, // each point of Cover clears one task this often (half pay)
  fraudBands: 150, // bands per stage when you approve your own rubber band receipt
  fraudNoise: 3, // Suspicion, times the number of recent approvals
  fraudMemory: 600,
};

// ---------------------------------------------------------------- content

export interface EmailPrompt {
  from: string;
  subject: string;
  body: string;
  /** Exactly one reply is right; a Reply All is always a mistake. */
  replies: { text: string; ok?: boolean; replyAll?: boolean; result: string }[];
}

export const EMAILS: EmailPrompt[] = [
  {
    from: 'Mr. Feeney', subject: 'Status?', body: 'Where are we on the Q3 deck?',
    replies: [
      { text: 'Almost done. You’ll have it by end of day.', ok: true, result: 'Mr. Feeney replies with a thumbs up.' },
      { text: 'What Q3 deck?', result: 'Mr. Feeney books a meeting titled "Q3 Deck (Urgent)".' },
      { text: 'lol no idea', replyAll: true, result: 'Reply All. 212 people now know you have no idea.' },
    ],
  },
  {
    from: 'IT Security', subject: 'Action required', body: 'Please confirm your password by replying to this email.',
    replies: [
      { text: 'Report it as phishing and delete it.', ok: true, result: 'IT thanks you for passing the phishing test.' },
      { text: 'Sure! It’s Gary123.', result: 'That was a phishing test. You failed it. So did Gary.' },
      { text: 'Is this real??', replyAll: true, result: 'Reply All. Forty people reply "Is this real??" too.' },
    ],
  },
  {
    from: 'Accounting', subject: 'Missing receipt', body: 'We are missing a receipt for $4.99 from March.',
    replies: [
      { text: 'Attached. Sorry for the delay!', ok: true, result: 'Accounting closes the ticket.' },
      { text: 'It was a stapler. Let it go.', result: 'Accounting does not let it go.' },
      { text: 'Who cares about $4.99', replyAll: true, result: 'Reply All. Accounting cares. Everyone now knows Accounting cares.' },
    ],
  },
  {
    from: 'HR', subject: 'Employee Happiness Survey', body: 'Please complete the 45-minute Employee Happiness Survey by Friday.',
    replies: [
      { text: 'Done! Thanks for asking.', ok: true, result: 'HR marks you as "happy".' },
      { text: 'Too busy being happy.', result: 'HR schedules a 1:1 about your happiness.' },
      { text: 'Is this anonymous?', replyAll: true, result: 'Reply All. It is no longer anonymous.' },
    ],
  },
  {
    from: 'All-Staff', subject: 'The stapler', body: 'Whoever took the stapler from the 3rd floor kitchen: please return it.',
    replies: [
      { text: 'Not me, but I hope it turns up!', ok: true, result: 'Nobody suspects you. This time.' },
      { text: 'I know who it was ;)', result: 'You are now a witness. HR would like a statement.' },
      { text: 'It was Gary.', replyAll: true, result: 'Reply All. Gary has seen it. Gary will remember this.' },
    ],
  },
  {
    from: 'Janet', subject: 'Printer', body: 'Can you send me the file again? The printer ate it.',
    replies: [
      { text: 'Re-sent. Fingers crossed!', ok: true, result: 'The printer accepts your offering.' },
      { text: 'Have you tried hitting it?', result: 'Janet hit it. Facilities is on the way.' },
      { text: 'PRINTER IS BROKEN AGAIN', replyAll: true, result: 'Reply All. The whole floor walks over to look at the printer.' },
    ],
  },
  {
    from: 'Facilities', subject: 'Thermostat', body: 'Please stop adjusting the thermostat. It is set to a temperature that is fair to everyone.',
    replies: [
      { text: 'Understood. I’ll leave it alone.', ok: true, result: 'Facilities logs your cooperation.' },
      { text: 'It was 61 degrees, Doug.', result: 'Doug lowers it to 60.' },
      { text: 'IT IS FREEZING IN HERE', replyAll: true, result: 'Reply All. A thermostat debate begins. It will outlive us all.' },
    ],
  },
  {
    from: 'Kevin', subject: 'question', body: 'is it ok if i take a 2 hour lunch',
    replies: [
      { text: 'Check with Mr. Feeney, but probably not.', ok: true, result: 'Kevin takes a 58-minute lunch.' },
      { text: 'Take three. Live your life.', result: 'Kevin took four. Mr. Feeney wants to know who approved it.' },
      { text: 'who is this', replyAll: true, result: 'Reply All. Kevin is hurt.' },
    ],
  },
  {
    from: 'Accounting', subject: 'Supply order', body: 'Why did your department order 40,000 rubber bands this month?',
    replies: [
      { text: 'Bulk discount. Very cost-effective.', ok: true, result: 'Accounting is impressed by your thrift.' },
      { text: 'What rubber bands?', result: 'Accounting attaches the invoice. And a photo.' },
      { text: 'No comment.', replyAll: true, result: 'Reply All. "No comment" is the most suspicious reply possible.' },
    ],
  },
  {
    from: 'HR', subject: 'Diane’s card', body: 'Please sign Diane’s birthday card at the front desk by 3 PM.',
    replies: [
      { text: 'Signed! Happy birthday, Diane.', ok: true, result: 'Diane is delighted.' },
      { text: 'Who is Diane?', result: 'Diane sits next to you.' },
      { text: 'Is there cake?', replyAll: true, result: 'Reply All. There was cake.' },
    ],
  },
  {
    from: 'Mr. Feeney', subject: 'Team culture', body: 'Send me three words that describe our team.',
    replies: [
      { text: 'Collaborative, focused, resilient.', ok: true, result: 'Mr. Feeney puts your words on a poster.' },
      { text: 'Armed. Dangerous. Elastic.', result: 'Mr. Feeney reads it twice.' },
      { text: 'synergy synergy synergy', replyAll: true, result: 'Reply All. It becomes the team motto. Against your will.' },
    ],
  },
  {
    from: 'IT', subject: 'Restart required', body: 'Your computer will restart in 5 minutes to install updates.',
    replies: [
      { text: 'Saving my work now. Thanks!', ok: true, result: 'The restart goes smoothly.' },
      { text: 'Postpone (forever)', result: 'It restarts anyway, mid-sentence, during a call.' },
      { text: 'NO', replyAll: true, result: 'Reply All. Everyone’s computer restarts out of spite.' },
    ],
  },
  {
    from: 'Marketing', subject: 'Office newsletter', body: 'Any fun news from your floor for this week’s newsletter?',
    replies: [
      { text: 'Nothing to report! Quiet week.', ok: true, result: 'The newsletter features a cat photo instead.' },
      { text: 'Huge rubber band war on Floor 4!', result: 'The newsletter runs it. With a diagram.' },
      { text: 'Gary has a fan now', replyAll: true, result: 'Reply All. Gary’s fan gets its own newsletter section.' },
    ],
  },
  {
    from: 'Mr. Feeney', subject: 'Saturday', body: 'Any chance you could come in this Saturday?',
    replies: [
      { text: 'I can’t Saturday, but I’ll wrap it up Friday.', ok: true, result: 'Mr. Feeney respects the boundary. Mostly.' },
      { text: 'Absolutely not.', result: 'Mr. Feeney writes "attitude?" on a sticky note.' },
      { text: 'Is it paid?', replyAll: true, result: 'Reply All. Now everyone is asking if it’s paid.' },
    ],
  },
  {
    from: 'Facilities', subject: 'Fridge cleanout', body: 'Is the yogurt labeled "DO NOT TOUCH" yours?',
    replies: [
      { text: 'Not mine. I’ll ask around.', ok: true, result: 'The yogurt’s owner remains a mystery.' },
      { text: 'It’s Gary’s. Throw it out.', result: 'It was Brad’s. Brad is furious.' },
      { text: 'It’s been there since March', replyAll: true, result: 'Reply All. The yogurt is now famous.' },
    ],
  },
  {
    from: 'Brad', subject: 'Quick favor', body: 'Can you cover my 2 PM client call? I’m "at the dentist".',
    replies: [
      { text: 'Sorry, I’m booked at 2. Ask Linda?', ok: true, result: 'Brad goes to "the dentist" anyway.' },
      { text: 'Sure, what’s the client’s name?', result: 'There is no client. There was never a client.' },
      { text: 'Brad is golfing', replyAll: true, result: 'Reply All. Brad is no longer golfing.' },
    ],
  },
];

export const DIRECTORY: { name: string; ext: number }[] = [
  { name: 'Facilities', ext: 2 },
  { name: 'Sales', ext: 3 },
  { name: 'Accounting', ext: 4 },
  { name: 'HR', ext: 5 },
  { name: 'Mailroom', ext: 6 },
  { name: 'IT', ext: 7 },
];

export const CALLERS: { line: string; dept: string }[] = [
  { line: 'My paycheck is one cent short. Again.', dept: 'Accounting' },
  { line: 'I need a reimbursement form for a stapler.', dept: 'Accounting' },
  { line: 'There’s water dripping from the ceiling tile above my desk.', dept: 'Facilities' },
  { line: 'The vending machine ate my dollar.', dept: 'Facilities' },
  { line: 'I’d like to report a coworker for "elastic misconduct".', dept: 'HR' },
  { line: 'I need to update my emergency contact.', dept: 'HR' },
  { line: 'My screen says PC LOAD LETTER. What does that mean?', dept: 'IT' },
  { line: 'I forgot my password. I also forgot my username.', dept: 'IT' },
  { line: 'I have a package for Floor 4. It rattles.', dept: 'Mailroom' },
  { line: 'Where do I deliver forty boxes of rubber bands?', dept: 'Mailroom' },
  { line: 'I’d like to buy 500 of whatever you sell.', dept: 'Sales' },
  { line: 'Is Brad there? He promised me a discount.', dept: 'Sales' },
];

const BUDGET_LINES = [
  'Printer toner', 'Team snacks', 'Conference chairs', 'Software licenses', 'Coffee filters', 'Office plants',
  'Client dinners', 'Paper clips', 'Desk lamps', 'Shipping', 'Whiteboard markers', 'Team offsite', 'Sticky notes',
];

const RECEIPTS: { item: string; cat: string; lo: number; hi: number }[] = [
  { item: 'Stapler', cat: 'Office supplies', lo: 9, hi: 24 },
  { item: 'Printer paper (10 reams)', cat: 'Office supplies', lo: 32, hi: 48 },
  { item: 'Desk organizer', cat: 'Office supplies', lo: 14, hi: 39 },
  { item: 'Ergonomic keyboard', cat: 'Office supplies', lo: 55, hi: 120 },
  { item: 'Whiteboard', cat: 'Office supplies', lo: 60, hi: 140 },
  { item: 'Golf balls (12)', cat: 'Personal', lo: 18, hi: 40 },
  { item: 'Birthday gift for wife', cat: 'Personal', lo: 25, hi: 90 },
  { item: 'Team lunch', cat: 'Food', lo: 120, hi: 380 },
  { item: 'Coffee for the team', cat: 'Food', lo: 14, hi: 42 },
  { item: 'Taxi to the airport', cat: 'Travel', lo: 28, hi: 70 },
  { item: 'Hotel minibar', cat: 'Travel', lo: 22, hi: 65 },
  { item: 'Highlighters (24)', cat: 'Office supplies', lo: 8, hi: 19 },
];

export const EXPENSE_RULE = 'Approve office supplies under $50. Deny everything else.';

// ---------------------------------------------------------------- answers

/** The correct answer for a task (used to check answers, and by the bots). */
export function correctAnswer(t: WorkTask): TaskAnswer {
  switch (t.kind) {
    case 'email': {
      const okIdx = EMAILS[t.data.idx].replies.findIndex((r) => r.ok);
      return { kind: 'email', choice: t.data.order.indexOf(okIdx) };
    }
    case 'call':
      return { kind: 'call', ext: DIRECTORY.find((d) => d.name === CALLERS[t.data.caller].dept)!.ext };
    case 'sheet':
      return { kind: 'sheet', flagged: t.data.rows.flatMap((r, i) => (r.actual > r.budget ? [i] : [])) };
    case 'expense':
      return { kind: 'expense', approve: t.data.receipts.map((r) => receiptOk(r)) };
  }
}

/** By the rules: office supplies under $50. (Your own receipt never qualifies.) */
export function receiptOk(r: Receipt) {
  return !r.yours && r.cat === 'Office supplies' && r.amount < 50;
}

// ---------------------------------------------------------------- arrivals

function pick<T>(s: GameState, list: T[]) {
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

function chooseKind(s: GameState): TaskKind {
  const early = s.stage === 1 && s.time < 180;
  const weights: [TaskKind, number][] = early
    ? [['email', 0.55], ['call', 0.45]]
    : s.stage === 1
      ? [['email', 0.4], ['call', 0.25], ['sheet', 0.2], ['expense', 0.15]]
      : [['email', 0.3], ['call', 0.25], ['sheet', 0.25], ['expense', 0.2]];
  let r = rand(s);
  for (const [k, w] of weights) {
    if ((r -= w) <= 0) return k;
  }
  return 'email';
}

export function makeTask(s: GameState, kind: TaskKind): WorkTask {
  const id = s.work.seq++;
  const at = s.time;
  switch (kind) {
    case 'email': {
      // Avoid repeating the email you just had.
      const recent = s.work.queue.filter((t) => t.kind === 'email').map((t) => (t.kind === 'email' ? t.data.idx : -1));
      let idx = Math.floor(rand(s) * EMAILS.length) % EMAILS.length;
      for (let n = 0; n < EMAILS.length && recent.includes(idx); n++) idx = (idx + 1) % EMAILS.length;
      return { id, kind, arrivedAt: at, data: { idx, order: shuffled(s, 3) } };
    }
    case 'call':
      return { id, kind, arrivedAt: at, data: { caller: Math.floor(rand(s) * CALLERS.length) % CALLERS.length, ringUntil: at + WORK.ringSeconds, answeredAt: null } };
    case 'sheet': {
      const names = shuffled(s, BUDGET_LINES.length).slice(0, 5).map((i) => BUDGET_LINES[i]);
      const over = new Set(shuffled(s, 5).slice(0, rand(s) < 0.5 ? 1 : 2));
      const rows = names.map((name, i) => {
        const budget = Math.round(randRange(s, 4, 40)) * 50;
        const delta = Math.round(randRange(s, 1, 8)) * 25;
        const actual = over.has(i) ? budget + delta : Math.max(25, budget - delta);
        return { name, budget, actual };
      });
      return { id, kind, arrivedAt: at, data: { rows } };
    }
    case 'expense': {
      const picks = shuffled(s, RECEIPTS.length).slice(0, 3).map((i) => RECEIPTS[i]);
      const receipts: Receipt[] = picks.map((r) => ({ item: r.item, cat: r.cat, amount: Math.round(randRange(s, r.lo, r.hi)) }));
      // Sometimes your own rubber band order is in the pile.
      if (rand(s) < 0.45) {
        const n = pick(s, [8000, 12000, 20000, 40000]);
        receipts.splice(Math.floor(rand(s) * 4) % 4, 0, {
          item: `Rubber bands, assorted (×${n.toLocaleString('en-US')})`,
          cat: 'Office supplies',
          amount: Math.round(n / 100 + randRange(s, 5, 30)),
          yours: true,
        });
      }
      return { id, kind, arrivedAt: at, data: { receipts } };
    }
  }
}

/** Adds a task to your queue, pushing out the oldest non-call if it's full. */
export function addTask(s: GameState, kind: TaskKind) {
  const w = s.work;
  if (w.queue.length >= WORK.maxQueue) {
    const i = w.queue.findIndex((t) => t.kind !== 'call' && t.id !== w.activeId);
    if (i >= 0) {
      w.queue.splice(i, 1);
      bump(s, WORK.droppedNoise);
      pushTicker(s, 'Your inbox overflowed. Something important probably went unanswered.');
    }
  }
  const t = makeTask(s, kind);
  w.queue.push(t);
  s.events.push({ type: 'task', kind, id: t.id });
  return t;
}

// ---------------------------------------------------------------- the step

/** Advances the work queue: arrivals, ringing, overdue pressure, automation. */
export function stepWork(s: GameState, dt: number) {
  const w = s.work;
  if (s.stage > 2) return; // first slice complete: the office is quiet

  if (s.time >= w.nextAt) {
    const [lo, hi] = s.stage === 1 ? WORK.gapStage1 : WORK.gapStage2;
    w.nextAt = s.time + randRange(s, lo, hi);
    addTask(s, w.queue.length === 0 && s.time < 30 ? 'email' : chooseKind(s));
  }

  // Phones ring out.
  for (const t of [...w.queue]) {
    if (t.kind === 'call' && t.data.answeredAt === null && s.time >= t.data.ringUntil) {
      removeTask(s, t.id);
      bump(s, WORK.missedCallNoise);
      pushTicker(s, `Your phone rang out. Everyone heard. Suspicion +${WORK.missedCallNoise}.`);
      s.events.push({ type: 'callMissed' });
    }
  }

  // Work left waiting too long makes you look like a slacker (and Suspicion stops cooling: see the engine).
  const overdue = overdueCount(s);
  if (overdue > 0) bump(s, Math.min(overdue, WORK.overdueCountCap) * WORK.overdueRate * dt);

  // Automation: Auto-Reply answers emails that wait; Cover coworkers clear tasks.
  if (has(s, 'autoreply')) {
    for (const t of [...w.queue]) {
      if (t.kind === 'email' && t.id !== w.activeId && s.time - t.arrivedAt >= WORK.autoReplyAfter) autoComplete(s, t, 'Auto-Reply');
    }
  }
  const cover = rolePower(s, 'cover');
  if (cover > 0) {
    w.coverTimer += dt * cover;
    while (w.coverTimer >= WORK.coverEvery) {
      w.coverTimer -= WORK.coverEvery;
      const t = w.queue.find((x) => x.kind !== 'call' && x.id !== w.activeId);
      if (t) autoComplete(s, t, 'Your Cover');
    }
  } else w.coverTimer = 0;

  w.fraudAt = w.fraudAt.filter((t) => s.time - t < WORK.fraudMemory);
}

/** Tasks that have waited too long. While any are overdue, Suspicion doesn't cool on its own. */
export function overdueCount(s: GameState) {
  const w = s.work;
  return w.queue.filter((t) => t.kind !== 'call' && t.id !== w.activeId && s.time - t.arrivedAt > WORK.overdueAfter).length;
}

function autoComplete(s: GameState, t: WorkTask, who: string) {
  removeTask(s, t.id);
  const pay = basePay(s, t.kind) * 0.5;
  s.salary += pay;
  s.stats.workEarned += pay;
  s.stats.tasksAuto++;
  s.events.push({ type: 'taskAuto', kind: t.kind, who });
}

// ---------------------------------------------------------------- doing tasks

export function findTask(s: GameState, id: number) {
  return s.work.queue.find((t) => t.id === id);
}

/** The task to do next: a ringing phone first, then the oldest in the queue. */
export function nextTask(s: GameState) {
  const q = s.work.queue;
  return q.find((t) => t.kind === 'call' && t.data.answeredAt === null) ?? q[0];
}

export function ringingCall(s: GameState) {
  return s.work.queue.find((t) => t.kind === 'call' && t.data.answeredAt === null) ?? null;
}

/** You're at your desk doing your job (counts as hidden during a walk-by). */
export function isWorking(s: GameState) {
  return s.work.activeId !== null && s.time - s.work.activeSince < WORK.workingCountsFor;
}

/** Opens a task (picking up the phone for a call). */
export function startTask(s: GameState, id: number): { ok: boolean; reason?: string } {
  const t = findTask(s, id);
  if (!t) return { ok: false, reason: 'That task is gone.' };
  s.work.activeId = id;
  s.work.activeSince = s.time;
  if (t.kind === 'call' && t.data.answeredAt === null) t.data.answeredAt = s.time;
  return { ok: true };
}

/**
 * Close a task without finishing it. Emails and paperwork go back in the queue;
 * hanging up on a caller is rude (and noticed).
 */
export function putDown(s: GameState) {
  const id = s.work.activeId;
  s.work.activeId = null;
  if (id === null) return;
  const t = findTask(s, id);
  if (t?.kind === 'call') {
    removeTask(s, id);
    bump(s, WORK.hangUpNoise);
    pushTicker(s, 'You hung up on a caller. They call Mr. Feeney instead.');
  }
}

export function answerTask(s: GameState, id: number, answer: TaskAnswer): TaskResult | null {
  const t = findTask(s, id);
  if (!t || t.kind !== answer.kind) return null;
  const started = s.work.activeId === id ? s.work.activeSince : s.time;
  const fast = s.time - started <= WORK.fast[t.kind];
  removeTask(s, id);
  if (s.work.activeId === id) s.work.activeId = null;

  let ok = false;
  let quality = -1; // share of full pay when not fully right (only expense reports pay partially)
  let noise = 0;
  let text = '';
  let bonusBands = 0;

  switch (t.kind) {
    case 'email': {
      const a = answer as Extract<TaskAnswer, { kind: 'email' }>;
      const reply = EMAILS[t.data.idx].replies[t.data.order[a.choice] ?? 0];
      ok = !!reply.ok;
      text = reply.result;
      if (!ok) noise = reply.replyAll ? WORK.replyAllNoise : WORK.wrongNoise;
      break;
    }
    case 'call': {
      const a = answer as Extract<TaskAnswer, { kind: 'call' }>;
      const want = CALLERS[t.data.caller].dept;
      const got = DIRECTORY.find((d) => d.ext === a.ext)?.name;
      ok = got === want;
      text = ok ? `Transferred to ${want}. The caller thanks you.` : `You transferred them to ${got ?? 'a dial tone'}. They wanted ${want}.`;
      if (!ok) noise = WORK.wrongNoise;
      break;
    }
    case 'sheet': {
      const a = answer as Extract<TaskAnswer, { kind: 'sheet' }>;
      const want = (correctAnswer(t) as Extract<TaskAnswer, { kind: 'sheet' }>).flagged;
      const got = [...new Set(a.flagged)].sort();
      ok = got.length === want.length && got.every((v, i) => v === want[i]);
      text = ok ? 'Budget review done. Every overrun flagged.' : `You flagged the wrong lines. ${want.length === 1 ? 'One line was' : 'Two lines were'} over budget.`;
      if (!ok) noise = WORK.wrongNoise;
      break;
    }
    case 'expense': {
      const a = answer as Extract<TaskAnswer, { kind: 'expense' }>;
      let mistakes = 0;
      t.data.receipts.forEach((r, i) => {
        const approve = !!a.approve[i];
        if (r.yours) {
          if (approve) {
            // Approving your own rubber band order: free bands, and Accounting notices.
            s.work.fraudAt.push(s.time);
            bonusBands = WORK.fraudBands * Math.max(1, s.stage);
            noise += WORK.fraudNoise * s.work.fraudAt.length;
            s.stats.receiptsFudged++;
          }
          return;
        }
        if (approve !== receiptOk(r)) mistakes++;
      });
      ok = mistakes === 0;
      quality = Math.max(0, 1 - 0.34 * mistakes);
      if (!ok) noise += WORK.wrongNoise;
      text = ok
        ? bonusBands
          ? `Report filed. Your rubber band order was "reimbursed": +${bonusBands} bands. Accounting squints.`
          : 'Expense report filed. Accounting has no notes.'
        : `${mistakes} receipt${mistakes > 1 ? 's' : ''} filed wrong. Accounting has notes.`;
      break;
    }
  }

  const share = ok ? 1 : Math.max(0, quality);
  const pay = basePay(s, t.kind) * share * (ok && fast ? 1 + WORK.fastBonus : 1);
  const relief = ok ? WORK.relief[t.kind] : 0;
  s.salary += pay;
  s.stats.workEarned += pay;
  if (bonusBands) s.bands += bonusBands;
  if (ok) s.stats.tasksDone++;
  else s.stats.tasksWrong++;
  const before = s.suspicion;
  s.suspicion = Math.max(0, s.suspicion - relief);
  if (noise) bump(s, noise);
  const result: TaskResult = { ok, pay, suspicion: s.suspicion - before, text: ok && fast ? `${text} (Fast: +50%)` : text, bonusBands };
  s.events.push({ type: 'taskDone', kind: t.kind, ok, pay, text: result.text });
  return result;
}

export function basePay(s: GameState, kind: TaskKind) {
  return WORK.pay[kind] * WORK.stageMult[s.stage] * mods(s).workPay;
}

function removeTask(s: GameState, id: number) {
  const i = s.work.queue.findIndex((t) => t.id === id);
  if (i >= 0) s.work.queue.splice(i, 1);
}

/** Raise Suspicion through the engine (lazily imported to avoid a cycle). */
let suspicionHook: ((s: GameState, amount: number) => void) | null = null;
export function setSuspicionHook(fn: (s: GameState, amount: number) => void) {
  suspicionHook = fn;
}
function bump(s: GameState, amount: number) {
  if (suspicionHook) suspicionHook(s, amount);
  else s.suspicion += amount;
}

