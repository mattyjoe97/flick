// Mr. Feeney's sticky note on your monitor: three small goals every work day (one day
// is eight minutes of game time). Each one done adds Performance toward your next
// promotion and a little cash; they reset each morning whether you finished or not.
//
// A goal counts things that happen from the moment it's posted: it remembers what its
// counter read at the start of the day.

import { GOALS, TEAMS } from './content';
import { addReview, reviewNeed, TOP_RANK } from './career';
import { ballUnlocked } from './ball';
import { rand } from './rng';
import { currentTarget, pushTicker, type GameState } from './state';
import { staffPayPerMin, teamUnlocked } from './staff';
import { liveCombo, WORK } from './work';

interface GoalDef {
  id: string;
  text: string;
  target: number;
  count: (s: GameState) => number;
  when?: (s: GameState) => boolean;
}

const war = (s: GameState) => !!currentTarget(s);

export const GOAL_DEFS: GoalDef[] = [
  { id: 'mail', text: 'Clear 2 batches of email', target: 2, count: (s) => s.stats.mailRounds ?? 0 },
  { id: 'calls', text: 'Answer 2 calls', target: 2, count: (s) => s.stats.callRounds ?? 0 },
  { id: 'expenses', text: 'File 2 expense reports', target: 2, count: (s) => s.stats.expenseRounds ?? 0 },
  { id: 'sheetA', text: 'Get an A on a spreadsheet', target: 1, count: (s) => s.stats.sheetA ?? 0 },
  { id: 'threeA', text: 'Get 3 A’s', target: 3, count: (s) => s.stats.gradeA ?? 0 },
  { id: 'combo', text: 'Reach an 8 combo', target: 8, count: (s) => s.goals.combo },
  { id: 'pet', text: 'Scratch Bailey’s ears 3 times', target: 3, count: (s) => s.stats.pets ?? 0 },
  { id: 'moment', text: 'Grab an office moment', target: 1, count: (s) => s.stats.moments ?? 0 },
  { id: 'hire', text: 'Hire someone (or add a seat)', target: 1, count: (s) => s.stats.hires ?? 0, when: (s) => teamUnlocked(s, TEAMS[0].id) },
  { id: 'perfect', text: 'Land 3 Perfect flicks', target: 3, count: (s) => s.stats.perfect ?? 0, when: war },
  { id: 'hide', text: 'Hide from Mr. Feeney once', target: 1, count: (s) => s.stats.hides ?? 0, when: war },
  { id: 'scrounge', text: 'Find 15 bands in your drawer', target: 15, count: (s) => s.stats.bandsScrounged ?? 0, when: war },
  { id: 'wind', text: 'Wind 100 bands onto your ball', target: 100, count: (s) => s.stats.winds ?? 0, when: ballUnlocked },
  { id: 'barrage', text: 'Call a Barrage', target: 1, count: (s) => s.stats.barrages ?? 0, when: (s) => s.stage >= 2 && war(s) },
  { id: 'rematch', text: 'Win a rematch', target: 1, count: (s) => s.stats.rematches ?? 0, when: (s) => s.stage >= 6 },
  { id: 'raid', text: 'Stop a raid on the supply closet', target: 1, count: (s) => s.stats.raidsStopped ?? 0, when: (s) => s.stage === 3 },
  { id: 'dent', text: 'Do 30,000 damage to your rivals', target: 30000, count: (s) => s.stats.damage ?? 0, when: (s) => s.stage === 3 || s.stage === 4 },
  { id: 'counter', text: 'Hold off a counterattack', target: 1, count: (s) => s.stats.countersHeld ?? 0, when: (s) => s.stage === 4 },
  { id: 'memo', text: 'Send 2 memos', target: 2, count: (s) => s.stats.memos ?? 0, when: (s) => s.stage === 5 },
  { id: 'coach', text: 'Coach a witness before an HR interview', target: 1, count: (s) => s.stats.coached ?? 0, when: (s) => s.stage === 5 },
];

export function goalDef(id: string) {
  return GOAL_DEFS.find((g) => g.id === id);
}

function today(s: GameState) {
  return Math.floor(s.time / WORK.dayLength);
}

/** A fresh sticky note: three goals that make sense right now. */
function newDay(s: GameState) {
  const g = s.goals;
  g.day = today(s);
  g.combo = 0;
  const pool = GOAL_DEFS.filter((d) => !d.when || d.when(s));
  const picks: GoalDef[] = [];
  while (picks.length < GOALS.perDay && pool.length) picks.push(pool.splice(Math.floor(rand(s) * pool.length) % pool.length, 1)[0]);
  g.list = picks.map((d) => ({ id: d.id, base: d.id === 'combo' ? 0 : d.count(s), done: false }));
  s.events.push({ type: 'goalsNew' });
}

/** How far along a goal is today. */
export function goalProgress(s: GameState, i: number) {
  const item = s.goals.list[i];
  const d = item && goalDef(item.id);
  if (!item || !d) return { text: '', done: 0, target: 1, finished: true };
  const done = Math.min(d.target, Math.max(0, d.count(s) - item.base));
  return { text: d.text, done: item.done ? d.target : done, target: d.target, finished: item.done };
}

/** What finishing one goal is worth right now. */
export function goalReward(s: GameState) {
  const review = s.career.rank < TOP_RANK ? reviewNeed(s.career.rank) * GOALS.review : 0;
  const cash = Math.max(20, staffPayPerMin(s, true) * GOALS.cashMinutes);
  return { review, cash: Math.round(cash) };
}

export function stepGoals(s: GameState) {
  const g = s.goals;
  if (g.day !== today(s)) newDay(s);
  g.combo = Math.max(g.combo, liveCombo(s));
  g.list.forEach((item, i) => {
    if (item.done) return;
    const p = goalProgress(s, i);
    if (p.done < p.target) return;
    item.done = true;
    const r = goalReward(s);
    addReview(s, r.review);
    s.salary += r.cash;
    s.stats.goals = (s.stats.goals ?? 0) + 1;
    const all = g.list.every((x) => x.done);
    const text = `Goal done: ${p.text}. +$${r.cash.toLocaleString('en-US')} and Performance.${all ? ' All three today: Mr. Feeney draws a smiley face.' : ''}`;
    pushTicker(s, text);
    s.events.push({ type: 'goalDone', id: item.id, text, all });
  });
}
