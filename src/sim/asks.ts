// Your team leads' calls: every few minutes one of the people you've hired messages you
// with a little problem and two ways to handle it. Each choice says what it does. Wait
// too long and they go with the safe one themselves. Nothing here can get you caught or
// cost more than you have.
//
// A call shows up as a card (wherever you are: at war, at your computer or on your floor)
// and in that person's Messenger conversation.

import { addReview, reviewNeed, TOP_RANK } from './career';
import { chatPost } from './chat';
import { ASKS, TEAMS, type TeamId } from './content';
import { mods } from './mods';
import { rand, randRange } from './rng';
import { pushTicker, type GameState } from './state';
import { leadName, seats, staffPayPerMin } from './staff';
import { payGrade } from './work';

/** What a choice does. */
export type Effect =
  | { cash: number } // minutes of your team's pay: a cost when negative
  | { susp: number } // Suspicion (never pushes you past 90)
  | { perf: number } // a share of your next promotion
  | { boost: number; secs: number; who?: TeamId | 'all'; after?: number } // a team works ×boost (0: paused); default: the caller's team
  | { work: number } // seconds of double pay for your own work
  | { walkby: number } // seconds Mr. Feeney's next walk-by is pushed back
  | { bands: number } // seconds of your band income
  | { scratch: number } // ear scratches toward Bailey's tricks
  | { watch: number }; // seconds someone watches the supply closet

export interface Choice {
  label: string;
  does: Effect[];
  then: string;
}

export interface Ask {
  id: string;
  team: TeamId;
  text: string;
  choices: [Choice, Choice];
  /** The one they pick if you don't answer in time. */
  safe: 0 | 1;
  when?: (s: GameState) => boolean;
}

export const ASK_LIST: Ask[] = [
  // Adam, the Temp (and Muffins)
  {
    id: 'muffins-coffee', team: 'temp', safe: 0,
    text: 'Muffins knocked my coffee into the printer. What do I do?',
    choices: [
      { label: 'Clean it up', does: [{ cash: -2 }], then: 'The printer gets mopped out. Muffins watches, unrepentant.' },
      { label: 'Blame Gary', does: [{ susp: 8 }], then: 'Gary gets the blame. Gary is used to it. Mr. Feeney is suspicious anyway.' },
    ],
  },
  {
    id: 'inbox', team: 'temp', safe: 1,
    text: 'The team inbox has 400 unread. Can we just mark them all as read?',
    choices: [
      { label: 'Do it', does: [{ boost: 1.6, secs: 180 }, { susp: 5 }], then: 'Inbox zero, technically. IT noticed.' },
      { label: 'Read them properly', does: [{ perf: 0.03 }], then: 'Every one gets read. Mr. Feeney notices the tidy replies.' },
    ],
  },
  {
    id: 'headphones', team: 'temp', safe: 0,
    text: 'Can the team wear headphones? We work faster with music.',
    choices: [
      { label: 'Sure', does: [{ boost: 1.3, secs: 300 }], then: 'Lo-fi beats fill the temp pod.' },
      { label: 'No. Look busy.', does: [{ susp: -10 }], then: 'Everyone looks extremely busy.' },
    ],
  },
  {
    id: 'muffins-nap', team: 'temp', safe: 1,
    text: 'Muffins is asleep on my keyboard. Should I move him?',
    choices: [
      { label: 'Move him', does: [{ boost: 1.2, secs: 120 }], then: 'Muffins relocates to the scanner. Emails resume.' },
      { label: 'Let him sleep', does: [{ boost: 0, secs: 60 }, { susp: -12 }], then: 'Work stops for a minute. Something about a sleeping cat calms the whole floor.' },
    ],
  },
  // Danielle, the Receptionist (and Joey)
  {
    id: 'client', team: 'receptionist', safe: 1,
    text: 'A big client is on line 2. Want to take it yourself?',
    choices: [
      { label: 'Put them through', does: [{ work: 90 }, { perf: 0.03 }], then: 'You charm the client. Your own work pays double for a bit.' },
      { label: 'You handle it', does: [{ boost: 1.5, secs: 180 }], then: 'She handles it beautifully. The front desk is on a roll.' },
    ],
  },
  {
    id: 'joey-fedex', team: 'receptionist', safe: 0,
    text: 'Joey ate a FedEx envelope. It was addressed to Mr. Feeney.',
    choices: [
      { label: 'Order a new one', does: [{ cash: -2 }], then: 'A replacement is on its way. Joey is not sorry.' },
      { label: 'It never came', does: [{ susp: 8 }], then: 'Nobody saw anything. Mr. Feeney keeps asking about it.' },
    ],
  },
  {
    id: 'feeney-hold', team: 'receptionist', safe: 0,
    text: 'Mr. Feeney is on line 1 for you. Should I say you’re in a meeting?',
    choices: [
      { label: 'I’m in a meeting', does: [{ walkby: 60 }], then: 'You’re in a very important meeting. He’ll come by later.' },
      { label: 'Put him through', does: [{ perf: 0.04 }], then: 'You take the call and say all the right things.' },
    ],
  },
  {
    id: 'lunch', team: 'receptionist', safe: 1,
    text: 'Can I order lunch for everyone? On the company card.',
    choices: [
      { label: 'Order lunch', does: [{ cash: -3 }, { boost: 1.3, secs: 240, who: 'all' }], then: 'Sandwiches for the whole floor. Everyone works faster.' },
      { label: 'Brown bag it', does: [{ susp: -5 }], then: 'Brown bags all round. Very frugal. Very professional.' },
    ],
  },
  {
    id: 'playdate', team: 'receptionist', safe: 0,
    text: 'Joey misses Bailey. Playdate?',
    choices: [
      { label: 'Playdate!', does: [{ scratch: 1 }, { susp: -8 }], then: 'Joey and Bailey chase each other around your chair. Everyone cheers up.' },
      { label: 'Not today', does: [{ boost: 1.15, secs: 180 }], then: 'Joey naps under the front desk instead. A lot gets done.' },
    ],
  },
  {
    id: 'closet-watch', team: 'receptionist', safe: 0, when: (s) => s.stage === 3,
    text: 'I can see the supply closet from the front desk. Want me to keep an eye on it?',
    choices: [
      { label: 'Please do', does: [{ watch: 300 }], then: 'Anyone who tries to raid the closet in the next 5 minutes gets caught at the front desk.' },
      { label: 'Eyes on the phones', does: [{ boost: 1.3, secs: 180 }], then: 'The phones get answered. The closet is on its own.' },
    ],
  },
  // Harold, the Bookkeeper
  {
    id: 'audit', team: 'bookkeeper', safe: 1,
    text: 'Accounting wants to audit our receipts. I can make some of them… disappear.',
    choices: [
      { label: 'Make them disappear', does: [{ cash: 4 }, { susp: 10 }], then: 'He shreds with a craftsman’s care. Some money turns up.' },
      { label: 'Let them audit', does: [{ perf: 0.04 }, { boost: 0.6, secs: 120 }], then: 'The audit finds nothing. The bookkeepers spend a while on paperwork.' },
    ],
  },
  {
    id: 'petty-cash', team: 'bookkeeper', safe: 1,
    text: 'I found money in a petty cash ledger from 1987. Finders keepers?',
    choices: [
      { label: 'Keep it', does: [{ cash: 3 }, { susp: 6 }], then: 'Into the drawer it goes.' },
      { label: 'Return it', does: [{ perf: 0.03 }], then: 'Accounting is touched. Someone almost smiles.' },
    ],
  },
  {
    id: 'nap', team: 'bookkeeper', safe: 0,
    text: 'I require a short nap. I am eighty-one.',
    choices: [
      { label: 'Of course', does: [{ boost: 0, secs: 90 }, { boost: 1.6, secs: 240, after: 90 }], then: 'Exactly ninety seconds of sleep, then he works like a man of sixty.' },
      { label: 'Coffee instead', does: [{ boost: 1.2, secs: 120 }], then: 'He drinks the coffee with great disapproval.' },
    ],
  },
  // Priya, the Analyst
  {
    id: 'macro', team: 'analyst', safe: 1,
    text: 'I wrote a macro that fixes our typos for us. Run it?',
    choices: [
      { label: 'Run it', does: [{ boost: 2, secs: 180 }, { susp: 6 }], then: 'The macro runs. IT has questions.' },
      { label: 'Do it by hand', does: [{ perf: 0.03 }], then: 'Hand-checked. Mr. Feeney likes hand-checked.' },
    ],
  },
  {
    id: 'dashboard', team: 'analyst', safe: 1,
    text: 'Want a dashboard of the whole team? It’ll take me a couple of minutes.',
    choices: [
      { label: 'Build it', does: [{ boost: 0, secs: 120 }, { boost: 1.25, secs: 360, who: 'all', after: 120 }], then: 'The dashboard goes up. Everyone works faster when they’re being measured.' },
      { label: 'Keep fixing typos', does: [{ boost: 1.2, secs: 180 }], then: 'Typos get fixed at speed.' },
    ],
  },
  {
    id: 'forecast', team: 'analyst', safe: 0,
    text: 'Rick’s old forecast is off by a zero. Tell Mr. Feeney, or fix it quietly?',
    choices: [
      { label: 'Tell him', does: [{ perf: 0.05 }], then: 'Mr. Feeney is grateful. Rick, working from home, is not.' },
      { label: 'Fix it quietly', does: [{ cash: 3 }], then: 'Fixed. The bonus pool grows a zero, and some of it finds you.' },
    ],
  },
  // Chad, the Assistant Manager
  {
    id: 'offsite', team: 'manager', safe: 1,
    text: 'I booked a team offsite. Bowling. It’s already paid for. By you.',
    choices: [
      { label: 'Approve it', does: [{ cash: -5 }, { boost: 1.5, secs: 300, who: 'all' }], then: 'Everyone bowls. Chad bowls a 74. Morale soars anyway.' },
      { label: 'Veto', does: [{ boost: 0.9, secs: 60, who: 'all' }], then: 'Chad sulks. Everyone’s a little slower for a minute.' },
    ],
  },
  {
    id: 'standup', team: 'manager', safe: 1,
    text: 'Daily standup? Fifteen minutes, everyone, standing.',
    choices: [
      { label: 'Fine', does: [{ boost: 0, secs: 30, who: 'all' }, { boost: 1.25, secs: 300, who: 'all', after: 30 }], then: 'Everyone stands. Everyone says “no blockers.” Then they get going.' },
      { label: 'Skip it', does: [{ susp: -6 }], then: 'No standup. Mr. Feeney thinks everyone’s heads-down.' },
    ],
  },
  {
    id: 'banner', team: 'manager', safe: 1,
    text: 'Can I hang a SYNERGY banner over the floor? It’s very on brand.',
    choices: [
      { label: 'Hang it', does: [{ cash: -1 }, { susp: -12 }], then: 'SYNERGY. Mr. Feeney nods at it every time he walks past.' },
      { label: 'Absolutely not', does: [{ boost: 1.1, secs: 120, who: 'all' }], then: 'Chad takes it well. He makes a smaller banner for his own office.' },
    ],
  },
  {
    id: 'war-help', team: 'manager', safe: 1, when: (s) => s.stage >= 2,
    text: 'The team wants to help with the war. Should they bring you their rubber bands?',
    choices: [
      { label: 'Bring me bands', does: [{ bands: 60 }, { boost: 0.5, secs: 120, who: 'all' }], then: 'Everyone empties their desk drawers onto yours, then gets back to work. Slowly.' },
      { label: 'Back to work', does: [{ boost: 1.15, secs: 180, who: 'all' }], then: 'Heads down. The war can wait.' },
    ],
  },
];

export const askById = (id: string) => ASK_LIST.find((a) => a.id === id);
const team = (id: TeamId) => TEAMS.find((t) => t.id === id)!;
/** The caller's first name (they can be renamed). */
export const askerName = (s: GameState, id: TeamId) => leadName(s, team(id)).split(' ')[0];

/** What a cash effect is worth right now: minutes of your team's steady pay (at least a little). */
function cashFor(s: GameState, minutes: number) {
  const v = Math.max(25 * payGrade(s).mult, staffPayPerMin(s, true) * Math.abs(minutes));
  const step = v >= 1000 ? 50 : v >= 100 ? 10 : 1;
  return Math.round(v / step) * step;
}

const mins = (secs: number) => (secs % 60 === 0 ? `${secs / 60} min` : `${secs} s`);
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** A choice's effects in a few words each ("−$400", "+8 Suspicion", "Adam's team ×1.5 for 3 min"). */
export function describe(s: GameState, ask: Ask, c: Choice): string[] {
  const who = (w?: TeamId | 'all') => (w === 'all' ? 'everyone' : `${askerName(s, w ?? ask.team)}’s team`);
  const out: string[] = [];
  for (const e of c.does) {
    if ('cash' in e) out.push(`${e.cash < 0 ? '−' : '+'}${money(cashFor(s, e.cash))}`);
    else if ('susp' in e) out.push(`${e.susp > 0 ? '+' : '−'}${Math.abs(e.susp)} Suspicion`);
    else if ('perf' in e) out.push('Performance');
    else if ('boost' in e) {
      if (e.after) out.push(e.boost >= 1 ? `then ×${e.boost} for ${mins(e.secs)}` : `then slower for ${mins(e.secs)}`);
      else if (e.boost === 0) out.push(`${who(e.who)} stops for ${mins(e.secs)}`);
      else if (e.boost < 1) out.push(`${who(e.who)} slower for ${mins(e.secs)}`);
      else out.push(`${who(e.who)} ×${e.boost} for ${mins(e.secs)}`);
    } else if ('work' in e) out.push(`your work pays double for ${mins(e.work)}`);
    else if ('walkby' in e) out.push(`Mr. Feeney comes by ${mins(e.walkby)} later`);
    else if ('bands' in e) out.push(`+${Math.round(Math.max(30, mods(s).bandsPerSec * e.bands)).toLocaleString('en-US')} bands`);
    else if ('scratch' in e) out.push('an ear scratch for Bailey');
    else if ('watch' in e) out.push(`the closet is watched for ${mins(e.watch)}`);
  }
  return out;
}

/** Calls this person could make right now (their team is hired, and it fits the moment). */
function available(s: GameState) {
  return ASK_LIST.filter((a) => seats(s, a.team) > 0 && (!a.when || a.when(s)));
}

/** A call comes in. */
function startAsk(s: GameState) {
  const pool = available(s);
  if (!pool.length) return;
  let fresh = pool.filter((a) => !s.asks.used.includes(a.id));
  if (!fresh.length) {
    // Everyone's had their say: start over, but not with the last few.
    s.asks.used = s.asks.used.slice(-3);
    fresh = pool.filter((a) => !s.asks.used.includes(a.id));
    if (!fresh.length) fresh = pool;
  }
  const ask = fresh[Math.floor(rand(s) * fresh.length) % fresh.length];
  s.asks.used.push(ask.id);
  s.asks.current = { id: ask.id, until: s.time + ASKS.seconds };
  chatPost(s, `@${ask.team}`, ask.text, false);
  s.events.push({ type: 'ask', id: ask.id });
}

export type AskResult = { ok: true; text: string } | { ok: false; reason: string };

/** Answer the call in front of you (choice 0 or 1). */
export function answerAsk(s: GameState, choice: 0 | 1): AskResult {
  const cur = s.asks.current;
  const ask = cur && askById(cur.id);
  if (!cur || !ask) return { ok: false, reason: 'Nobody’s asking right now.' };
  return settle(s, ask, choice, false);
}

function settle(s: GameState, ask: Ask, choice: 0 | 1, auto: boolean): AskResult {
  const c = ask.choices[choice];
  for (const e of c.does) apply(s, ask, e);
  s.asks.current = null;
  s.asks.nextAt = s.time + randRange(s, ASKS.gap[0], ASKS.gap[1]);
  s.stats.asks = (s.stats.asks ?? 0) + 1;
  const name = askerName(s, ask.team);
  if (!auto) chatPost(s, `@${ask.team}`, c.label, true);
  const text = auto ? `${name} didn’t hear back, so they went with “${c.label}.” ${c.then}` : `${name}: “${c.label}.” ${c.then}`;
  pushTicker(s, text);
  s.events.push({ type: 'askDone', id: ask.id, choice, auto, text });
  return { ok: true, text };
}

function apply(s: GameState, ask: Ask, e: Effect) {
  if ('cash' in e) {
    const v = cashFor(s, e.cash);
    if (e.cash < 0) s.salary = Math.max(0, s.salary - v);
    else {
      s.salary += v;
      s.events.push({ type: 'pay', amount: v, source: 'team', note: '' });
    }
  } else if ('susp' in e) {
    if (e.susp < 0) s.suspicion = Math.max(0, s.suspicion + e.susp);
    else s.suspicion = Math.max(s.suspicion, Math.min(ASKS.suspCap, s.suspicion + e.susp));
  } else if ('perf' in e) {
    if (s.career.rank < TOP_RANK) addReview(s, reviewNeed(s.career.rank) * e.perf);
  } else if ('boost' in e) {
    const from = s.time + (e.after ?? 0);
    s.asks.boosts.push({ team: e.who ?? ask.team, mult: e.boost, from, until: from + e.secs });
  } else if ('work' in e) {
    s.work.hustleUntil = Math.max(s.work.hustleUntil, s.time + e.work);
  } else if ('walkby' in e) {
    if (s.walkby.arrivesAt === null) s.walkby.nextAt += e.walkby;
  } else if ('bands' in e) {
    s.bands += Math.round(Math.max(30, mods(s).bandsPerSec * e.bands));
  } else if ('scratch' in e) {
    s.office.scratches += e.scratch;
  } else if ('watch' in e) {
    s.asks.watchUntil = Math.max(s.asks.watchUntil, s.time + e.watch);
  }
}

/** Seconds left on the call in front of you (or null). */
export function askClock(s: GameState) {
  const cur = s.asks.current;
  return cur ? Math.max(0, cur.until - s.time) : null;
}

export function stepAsks(s: GameState) {
  const a = s.asks;
  if (a.boosts.length && a.boosts.some((b) => b.until <= s.time)) a.boosts = a.boosts.filter((b) => b.until > s.time);
  if (a.current) {
    if (s.time >= a.current.until) {
      const ask = askById(a.current.id);
      if (ask) settle(s, ask, ask.safe, true);
      else a.current = null;
    }
    return;
  }
  if (!TEAMS.some((t) => seats(s, t.id) > 0)) return;
  // The first call comes a couple of minutes after your first hire.
  if (a.nextAt <= 0) {
    a.nextAt = s.time + ASKS.first;
    return;
  }
  if (s.time < a.nextAt) return;
  // Not on top of Dale's deal or a raid on the closet, and not while Mr. Feeney is on his way.
  if (s.dale.deal || s.war?.closet.raid || s.war?.counter?.attack || s.walkby.arrivesAt !== null) return;
  startAsk(s);
}

/** Time away: a call that was waiting gets the safe answer quietly, and nothing new comes in. */
export function asksOffline(s: GameState) {
  const cur = s.asks.current;
  if (cur) {
    const ask = askById(cur.id);
    if (ask) settle(s, ask, ask.safe, true);
    else s.asks.current = null;
  }
  s.asks.nextAt = Math.max(s.asks.nextAt, s.time + 60);
}
