// Your team: people you hire once you're senior enough. Each team does one kind of your
// work (the Temp answers email, the Receptionist takes calls, the Bookkeeper stamps
// receipts, the Analyst fixes spreadsheets) at half your pay, all the time, even while
// the game is closed. Their work counts a little toward your Performance too.
//
// A team starts with its lead and grows a seat at a time (each seat costs more than the
// last). Training makes a whole team more productive. The Assistant Manager does no work
// of his own; he makes every other team faster. And they work faster while you do:
// keep a work combo going and your team follows your lead (pizza helps too).

import { CAREER, MOMENTS, POLITICS, SIEGE, STAFF, TEAMS, WAR, type Team, type TeamId } from './content';
import { addReview } from './career';
import { ballTeamMult } from './ball';
import { jobHireMult } from './job';
import { chatEvent } from './chat';
import { company, deptPerk, memoOn, pushEmail, pushTicker, roomTaken, type GameState } from './state';
import { basePay, liveCombo, WORK } from './work';

export function team(id: TeamId): Team {
  return TEAMS.find((t) => t.id === id)!;
}

/** The lead's full name (you can rename them in Staffing). */
export function leadName(s: GameState, t: Team) {
  return s.names?.[t.id]?.trim() || (t.surname ? `${t.lead} ${t.surname}` : t.lead);
}

/** Rename a team lead, or yourself ('you'). An empty name puts the default back. */
export function rename(s: GameState, who: TeamId | 'you', name: string) {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 20);
  if (clean) s.names[who] = clean;
  else delete s.names[who];
}

/** Leading by example: your live work combo speeds your team up (+10% a link, up to ×2). */
export function leadMult(s: GameState) {
  return 1 + STAFF.leadPerCombo * Math.min(STAFF.leadCap, liveCombo(s));
}

/** Your team leads' calls can speed a team up (or slow it down) for a while. */
export function askMult(s: GameState, id: TeamId) {
  let m = 1;
  for (const b of s.asks?.boosts ?? []) if ((b.team === id || b.team === 'all') && s.time >= b.from && s.time < b.until) m *= b.mult;
  return m;
}

/** Pizza in the break room: everyone works faster for a minute. */
export function pizzaMult(s: GameState) {
  return s.time < (s.office?.pizzaUntil ?? -1) ? MOMENTS.pizzaTeam : 1;
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

/** Casual Friday (a Stage 5 memo): hiring and training at half price. */
const casualMult = (s: GameState) => (memoOn(s, 'casual') ? POLITICS.casualPrice : 1) * jobHireMult(s);

/** What the next seat on this team costs. */
export function seatCost(s: GameState, id: TeamId) {
  const t = team(id);
  return Math.round(t.cost * Math.pow(t.growth, seats(s, id)) * (deptPerk(s, 'marketing') ? WAR.marketingHire : 1) * casualMult(s));
}

/** What the next round of training costs (null once there's none left, or nobody to train). */
export function trainCost(s: GameState, id: TeamId): number | null {
  const t = team(id);
  const level = trainLevel(s, id);
  if (!t.job || seats(s, id) === 0 || level >= STAFF.training.length) return null;
  return Math.round(t.cost * STAFF.trainCost * Math.pow(STAFF.trainGrowth, level) * casualMult(s));
}

/** Every other team works this much faster thanks to the Assistant Managers. */
export function managerMult(s: GameState) {
  return 1 + STAFF.managerBoost * seats(s, 'manager');
}

/** Things this team gets done per minute (with your combo and any pizza, unless `steady`). */
export function teamPerMin(s: GameState, id: TeamId, steady = false) {
  const t = team(id);
  if (!t.job) return 0;
  const boosts = steady ? 1 : leadMult(s) * pizzaMult(s) * askMult(s, id);
  const room = roomTaken(s, 'conference') ? SIEGE.conferenceTeam : 1;
  const synergy = (memoOn(s, 'synergy') ? POLITICS.synergyTeam : 1) * company(s).rules.team;
  return seats(s, id) * t.perMin * Math.pow(STAFF.trainBoost, trainLevel(s, id)) * managerMult(s) * ballTeamMult(s) * room * synergy * boosts;
}

/** What one thing this team does pays you. */
function itemPay(s: GameState, t: Team) {
  return t.job ? basePay(s, t.job) * STAFF.quality : 0;
}

/** Salary this team brings in per minute. */
export function teamPayPerMin(s: GameState, id: TeamId, steady = false) {
  return teamPerMin(s, id, steady) * itemPay(s, team(id));
}

/** Everything your team brings in per minute (`steady`: without your combo or pizza). */
export function staffPayPerMin(s: GameState, steady = false) {
  return TEAMS.reduce((sum, t) => sum + teamPayPerMin(s, t.id, steady), 0);
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
  s.stats.hires = (s.stats.hires ?? 0) + 1;
  s.events.push({ type: 'hired', team: id, seats: st.seats });
  const name = leadName(s, t);
  if (st.seats === 1) {
    pushEmail(s, name, `Starting today`, `${t.pitch} I’m your new ${t.title.toLowerCase()}.`, 'story');
    pushTicker(s, `${name} joins your team as ${t.title}.${t.pet ? ` ${t.pet === 'muffins' ? 'Muffins the cat' : 'Joey the golden retriever'} comes too.` : ''}`);
    chatEvent(s, `hired:${id}`);
  } else pushTicker(s, `${name}’s team grows to ${st.seats}.`);
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
  pushTicker(s, `${leadName(s, team(id))}’s team is back from ${STAFF.training[st.level - 1]}. More productive. Allegedly.`);
  return { ok: true };
}

/** Your team works for `dt` seconds. Returns what they earned. */
function work(s: GameState, dt: number, steady = false) {
  let pay = 0;
  let review = 0;
  for (const t of TEAMS) {
    if (!t.job) continue;
    const n = (teamPerMin(s, t.id, steady) / 60) * dt;
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

/** Your team kept working while you were away (at their steady pace: no combo, no pizza). */
export function staffOffline(s: GameState, seconds: number) {
  return work(s, seconds, true);
}
