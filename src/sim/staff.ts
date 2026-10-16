// Your team: people you hire once you're senior enough. Each team does one kind of your
// work (the Temp answers email, the Receptionist takes calls, the Bookkeeper stamps
// receipts, the Analyst fixes spreadsheets) at half your pay, all the time, even while
// the game is closed. Their work counts a little toward your Performance too.
//
// A team starts with its lead and grows a seat at a time (each seat costs more than the
// last). Training doubles a whole team's output. The Assistant Manager does no work of
// his own; he makes every other team faster.

import { CAREER, STAFF, TEAMS, type Team, type TeamId } from './content';
import { addReview } from './career';
import { chatEvent } from './chat';
import { pushEmail, pushTicker, type GameState } from './state';
import { basePay, WORK } from './work';

export function team(id: TeamId): Team {
  return TEAMS.find((t) => t.id === id)!;
}

export function teamUnlocked(s: GameState, id: TeamId) {
  return s.career.rank >= team(id).unlockRank;
}

export function seats(s: GameState, id: TeamId) {
  return s.staff[id]?.seats ?? 0;
}

export function trainLevel(s: GameState, id: TeamId) {
  return s.staff[id]?.level ?? 0;
}

/** Seats your headcount budget allows on this team (one more with every promotion). */
export function seatCap(s: GameState, id: TeamId) {
  const t = team(id);
  return s.career.rank < t.unlockRank ? 0 : 1 + STAFF.seatsPerRank * (s.career.rank - t.unlockRank);
}

/** What the next seat on this team costs. */
export function seatCost(s: GameState, id: TeamId) {
  const t = team(id);
  return Math.round(t.cost * Math.pow(t.growth, seats(s, id)));
}

/** What the next round of training costs (null once there's none left, or nobody to train). */
export function trainCost(s: GameState, id: TeamId): number | null {
  const t = team(id);
  const level = trainLevel(s, id);
  if (!t.job || seats(s, id) === 0 || level >= STAFF.training.length) return null;
  return Math.round(t.cost * STAFF.trainCost * Math.pow(STAFF.trainGrowth, level));
}

/** Every other team works this much faster thanks to the Assistant Managers. */
export function managerMult(s: GameState) {
  return 1 + STAFF.managerBoost * seats(s, 'manager');
}

/** Things this team gets done per minute. */
export function teamPerMin(s: GameState, id: TeamId) {
  const t = team(id);
  if (!t.job) return 0;
  return seats(s, id) * t.perMin * Math.pow(STAFF.trainBoost, trainLevel(s, id)) * managerMult(s);
}

/** What one thing this team does pays you. */
function itemPay(s: GameState, t: Team) {
  return t.job ? basePay(s, t.job) * STAFF.quality : 0;
}

/** Salary this team brings in per minute. */
export function teamPayPerMin(s: GameState, id: TeamId) {
  return teamPerMin(s, id) * itemPay(s, team(id));
}

/** Everything your team brings in per minute. */
export function staffPayPerMin(s: GameState) {
  return TEAMS.reduce((sum, t) => sum + teamPayPerMin(s, t.id), 0);
}

/** Performance your team adds per minute. */
export function staffReviewPerMin(s: GameState) {
  return TEAMS.reduce((sum, t) => sum + (t.job ? teamPerMin(s, t.id) * CAREER.teamPoints * WORK.pay[t.job] : 0), 0);
}

export type StaffResult = { ok: true } | { ok: false; why: string };

/** Hire a team's lead, or add a seat to the team. */
export function hire(s: GameState, id: TeamId): StaffResult {
  const t = team(id);
  if (!teamUnlocked(s, id)) return { ok: false, why: `You need to be promoted first.` };
  if (seats(s, id) >= seatCap(s, id)) return { ok: false, why: 'Your headcount budget is full. Get promoted for more.' };
  const cost = seatCost(s, id);
  if (s.salary < cost) return { ok: false, why: `That costs $${cost.toLocaleString('en-US')}.` };
  s.salary -= cost;
  const st = (s.staff[id] ??= { seats: 0, level: 0, done: 0 });
  st.seats++;
  s.events.push({ type: 'hired', team: id, seats: st.seats });
  if (st.seats === 1) {
    pushEmail(s, t.lead, `Starting today`, `${t.pitch} I’m your new ${t.title.toLowerCase()}.`, 'story');
    pushTicker(s, `${t.lead} joins your team as ${t.title}.`);
    chatEvent(s, `hired:${id}`);
  } else pushTicker(s, `${t.lead}’s team grows to ${st.seats}.`);
  return { ok: true };
}

/** Send a whole team to the next round of training: it gets twice as much done. */
export function train(s: GameState, id: TeamId): StaffResult {
  const cost = trainCost(s, id);
  if (cost === null) return { ok: false, why: 'Nothing left to train.' };
  if (s.salary < cost) return { ok: false, why: `That costs $${cost.toLocaleString('en-US')}.` };
  s.salary -= cost;
  const st = s.staff[id]!;
  st.level++;
  s.events.push({ type: 'trained', team: id, level: st.level });
  pushTicker(s, `${team(id).lead}’s team is back from ${STAFF.training[st.level - 1]}. Twice as productive. Allegedly.`);
  return { ok: true };
}

/** Your team works for `dt` seconds. Returns what they earned. */
function work(s: GameState, dt: number) {
  let pay = 0;
  let review = 0;
  for (const t of TEAMS) {
    if (!t.job) continue;
    const n = (teamPerMin(s, t.id) / 60) * dt;
    if (n <= 0) continue;
    const st = s.staff[t.id]!;
    st.done += n;
    pay += n * itemPay(s, t);
    review += n * CAREER.teamPoints * WORK.pay[t.job];
    s.stats.teamDone = (s.stats.teamDone ?? 0) + n;
  }
  s.salary += pay;
  s.stats.teamEarned = (s.stats.teamEarned ?? 0) + pay;
  addReview(s, review);
  return pay;
}

export function stepStaff(s: GameState, dt: number) {
  const pay = work(s, dt);
  if (pay <= 0) return;
  // Coins drop in now and then, not every tick.
  const p = s.staffPay;
  p.owed += pay;
  if (s.time >= p.at) {
    p.at = s.time + STAFF.payEvery;
    s.events.push({ type: 'pay', amount: p.owed, source: 'team' });
    p.owed = 0;
  }
}

/** Your team kept working while you were away. */
export function staffOffline(s: GameState, seconds: number) {
  return work(s, seconds);
}
