// Corporate Challenges: three goals for each real-world day, sized for a good session of play.
// Each one done pays a bonus straight away; all three done on the same day pays Reputation,
// more for every day in a row you've done it (up to a week). They come with you from job to
// job, and they count whatever happens while the game is open.
//
// The sim never reads the clock: the UI hands over today's date as 'YYYY-MM-DD' (local time)
// with newDay(), and the day's three are picked from that date, so they're the same however
// many times you reload.

import { jobPayMult } from './job';
import { staffPayPerMin } from './staff';
import { pushEmail, pushTicker, type GameState } from './state';
import { payGrade } from './work';

type Stat = keyof GameState['stats'];

export interface ChallengeDef {
  id: string;
  text: string;
  target: number;
  stat: Stat;
  /** Only offered from this stage on (stages don't go backwards, except on a new job). */
  stage?: number;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'perfect', text: 'Land 20 Perfect flicks', target: 20, stat: 'perfect' },
  { id: 'hides', text: 'Be at your computer for 8 of Mr. Feeney’s walk-bys', target: 8, stat: 'hides' },
  { id: 'rounds', text: 'Finish 10 rounds of work', target: 10, stat: 'rounds' },
  { id: 'gradeA', text: 'Get 6 A grades on your work', target: 6, stat: 'gradeA' },
  { id: 'goals', text: 'Finish 5 goals on Mr. Feeney’s sticky note', target: 5, stat: 'goals' },
  { id: 'pets', text: 'Scratch Bailey’s ears 10 times', target: 10, stat: 'pets' },
  { id: 'moments', text: 'Grab 3 office moments', target: 3, stat: 'moments' },
  { id: 'goldens', text: 'Grab 4 golden staplers', target: 4, stat: 'goldens' },
  { id: 'finds', text: 'Find 4 things in your drawer', target: 4, stat: 'finds' },
  { id: 'barrages', text: 'Call 8 Barrages', target: 8, stat: 'barrages', stage: 2 },
  { id: 'chaos', text: 'Live through 2 office chaos events', target: 2, stat: 'chaos', stage: 2 },
];

export const DAILY = {
  count: 3,
  cashMinutes: 10, // of your team's steady pay, for each challenge done
  cashMin: 300, // times your pay grade (early on)
  rep: 0.01, // of all the Reputation you've ever earned, for all three in a day...
  repMin: 5,
  streakCap: 7, // ...times the days in a row, up to a week
};

export interface DailyState {
  /** The day these are for ('' before the first one). */
  day: string;
  list: { id: string; done: number; paid: boolean }[];
  /** Days in a row with all three done, and the last such day. */
  streak: number;
  lastFull: string;
  /** All-three days ever, and challenges done ever. */
  fullDays: number;
  total: number;
  /** What each stat read last step (they reset with each new job, so we count the climb). */
  seen: Partial<Record<Stat, number>>;
  /** The UI hasn't shown today's yet. */
  fresh: boolean;
}

export function newDaily(): DailyState {
  return { day: '', list: [], streak: 0, lastFull: '', fullDays: 0, total: 0, seen: {}, fresh: false };
}

export function challenge(id: string) {
  return CHALLENGES.find((c) => c.id === id);
}

/** A small, stable hash of the date: the same day always picks the same three. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The day before 'YYYY-MM-DD'. */
export function dayBefore(day: string) {
  const t = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t - 86400000).toISOString().slice(0, 10) : '';
}

/** Today's date (local time) as 'YYYY-MM-DD'. For the UI; the sim never calls it. */
export function localDay(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A new day: three new challenges (nothing happens if it's still the same day). */
export function newDay(s: GameState, day: string) {
  const d = s.daily;
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(day) || d.day === day) return false;
  // Not while you're still learning the ropes on your very first day.
  if (s.stage < 2 && s.job.runs === 0) return false;
  // Days in a row: miss a day (finish all three today or yesterday) and the streak starts over.
  if (d.lastFull !== day && d.lastFull !== dayBefore(day)) d.streak = 0;
  const pool = CHALLENGES.filter((c) => (c.stage ?? 1) <= Math.max(2, s.stage));
  let h = hash(day);
  const picked: ChallengeDef[] = [];
  while (picked.length < DAILY.count && pool.length) {
    picked.push(pool.splice(h % pool.length, 1)[0]);
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  }
  d.day = day;
  d.list = picked.map((c) => ({ id: c.id, done: 0, paid: false }));
  d.seen = {};
  for (const c of picked) d.seen[c.stat] = (s.stats[c.stat] as number | null) ?? 0;
  d.fresh = true;
  const lines = picked.map((c) => `• ${c.text}`).join('\n');
  pushEmail(
    s,
    'Corporate',
    'Today’s Corporate Challenges',
    `Three for today. Each one pays a bonus; all three pays Reputation${d.streak > 0 ? `, and you’re on a ${d.streak}-day streak` : ''}.\n\n${lines}\n\nProgress is in the Challenges app.`,
    'story',
  );
  s.events.push({ type: 'dailyNew' });
  return true;
}

/** Every step: count what happened toward today's three, and pay for any just finished. */
export function stepDaily(s: GameState) {
  const d = s.daily;
  if (!d?.list.length) return;
  for (const g of d.list) {
    const c = challenge(g.id);
    if (!c) continue;
    const now = (s.stats[c.stat] as number | null) ?? 0;
    const was = d.seen[c.stat] ?? now;
    // A new job starts every count at zero: then whatever it reads now is all new.
    const gained = now >= was ? now - was : now;
    d.seen[c.stat] = now;
    if (gained > 0 && !g.paid) g.done = Math.min(c.target, g.done + gained);
    if (!g.paid && g.done >= c.target) payChallenge(s, g.id);
  }
}

/** What finishing one pays right now. */
export function challengeCash(s: GameState) {
  return Math.round(Math.max(DAILY.cashMin * payGrade(s).mult * jobPayMult(s), staffPayPerMin(s, true) * DAILY.cashMinutes));
}

/** The Reputation all three would pay today (with the streak you'd be on). */
export function fullDayRep(s: GameState) {
  const d = s.daily;
  // Already done today: the streak it paid. Otherwise: the streak finishing today would make.
  const streak = Math.min(DAILY.streakCap, Math.max(1, d.lastFull === d.day ? d.streak : d.streak + 1));
  return Math.max(DAILY.repMin, Math.round(s.job.earned * DAILY.rep)) * streak;
}

function payChallenge(s: GameState, id: string) {
  const d = s.daily;
  const g = d.list.find((x) => x.id === id)!;
  g.paid = true;
  d.total++;
  const cash = challengeCash(s);
  s.salary += cash;
  s.events.push({ type: 'pay', amount: cash, source: 'bounty', note: 'a challenge' });
  const text = pushTicker(s, `Challenge done: ${challenge(id)!.text}. Corporate sends +$${cash.toLocaleString('en-US')}.`);
  s.events.push({ type: 'dailyDone', id, cash, text });
  if (d.list.every((x) => x.paid) && d.lastFull !== d.day) {
    const rep = fullDayRep(s);
    d.streak = Math.min(999, d.streak + 1);
    d.lastFull = d.day;
    d.fullDays++;
    s.job.reputation += rep;
    s.job.earned += rep;
    const all = pushTicker(s, `All three of today’s challenges! +${rep} Reputation${d.streak > 1 ? ` (${d.streak} days in a row)` : ''}.`);
    s.events.push({ type: 'dailyAll', rep, streak: d.streak, text: all });
  }
}

/** Saves: keep everything, but tidy anything odd. */
export function dailyForLoad(saved: Partial<DailyState> | undefined): DailyState {
  const d = { ...newDaily(), ...(saved ?? {}) };
  d.list = Array.isArray(d.list) ? d.list.filter((g) => g && challenge(g.id)).map((g) => ({ id: g.id, done: Math.max(0, Number(g.done) || 0), paid: !!g.paid })) : [];
  for (const k of ['streak', 'fullDays', 'total'] as const) d[k] = Math.max(0, Math.floor(Number(d[k]) || 0));
  if (typeof d.day !== 'string') d.day = '';
  if (typeof d.lastFull !== 'string') d.lastFull = '';
  if (!d.seen || typeof d.seen !== 'object') d.seen = {};
  return d;
}
