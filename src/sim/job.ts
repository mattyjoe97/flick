// The New Job restart.
//
// Once you've closed HR's case, a recruiter gets in touch: the Job Search app on your
// computer. Quit, and you start over at a new company (your pick of the offers). You keep
// Reputation, earned by how far you got, how high you climbed and what you collected, and
// spend it on résumé perks that last forever. You also keep the things that are yours, not
// the company's: Bailey and her tricks, your rubber band ball, and the names you picked.
//
// Every company has its own rules and its own names for the same faces (offices all look
// alike). Later jobs go faster as the perks pile up, so there's always another one.

import { tenantRepBonus } from './tenants';
import { rivalBonus, startRace } from './rival';
import { COMPANIES, EXEC_PERKS, JOB, PERKS, type CompanyId, type ExecId, type PerkId } from './content';
import { trophyDamageMult, trophyPayMult } from './trophies';
import { renoPay, stockBonus, tierFloor, tierName, tierPay, tierRep } from './ladder';
import { company, newAlly, newGame, perk, pushEmail, pushTicker, type GameState } from './state';

const perkDef = (id: PerkId) => PERKS.find((p) => p.id === id)!;

/** What this job itself is worth in Reputation: how far you got, how high you climbed, what you collected, times the tier. */
export function repForWork(s: GameState) {
  if (s.stage < JOB.minStage) return 0;
  const base = (JOB.stageRep[s.stage] ?? 0) + JOB.perRank * s.career.rank + Math.sqrt(Math.max(0, s.stats.bounties) / JOB.bountyRoot);
  return Math.floor(base * tierRep(s.job?.tier ?? 0));
}

/** What your shares add to that when you leave. */
export function stockRep(s: GameState) {
  return Math.floor(repForWork(s) * stockBonus(s));
}

/** What leaving now would earn you in Reputation (nothing before the Department War): the job, plus your shares. */
export function repForRun(s: GameState) {
  if (s.stage < JOB.minStage) return 0;
  return repForWork(s) + stockRep(s) + rivalRep(s) + tenantRep(s);
}

/** What the floors you took from the building's other companies add to that. */
export function tenantRep(s: GameState) {
  return Math.floor(repForWork(s) * tenantRepBonus(s));
}

/** What beating Chad adds to that. */
export function rivalRep(s: GameState) {
  return Math.floor(repForWork(s) * rivalBonus(s));
}

export type JobResult = { ok: true } | { ok: false; reason: string };

/** Can you quit right now? */
export function canQuit(s: GameState): JobResult {
  if (!s.job.unlocked) return { ok: false, reason: 'Nobody’s hiring. Yet.' };
  if (s.stage < JOB.minStage) return { ok: false, reason: 'Reach the Department War first: nobody hires someone who quit in their first week.' };
  return { ok: true };
}

/** What the next level of a perk costs (null when it's maxed out). */
export function perkCost(s: GameState, id: PerkId): number | null {
  const p = perkDef(id);
  const level = perk(s, id);
  if (level >= p.max) return null;
  return Math.round(p.cost * Math.pow(p.growth, level));
}

/** Buy a level of a résumé perk with Reputation. */
export function buyPerk(s: GameState, id: PerkId): JobResult {
  const cost = perkCost(s, id);
  if (cost === null) return { ok: false, reason: 'You can’t get any better at that.' };
  if (s.job.reputation < cost) return { ok: false, reason: `That needs ${cost} Reputation.` };
  s.job.reputation -= cost;
  s.job.perks[id] = perk(s, id) + 1;
  // The day-one perks count from the moment you buy them, too.
  if (id === 'refs' && s.career.rank < Math.min(5, perk(s, 'refs'))) s.career.rank = Math.min(5, perk(s, 'refs'));
  if (id === 'bonus') {
    s.salary += JOB.bonus.salary;
    s.bands += JOB.bonus.bands;
  }
  if (id === 'friends') for (const [who, role] of [['kevin', 'gatherer'], ['marjorie', 'lookout']] as const) if (!s.allies.some((a) => a.id === who)) s.allies.push(newAlly(who, role));
  return { ok: true };
}

// ---------------------------------------------------------------- executive perks (no top level)

const execDef = (id: ExecId) => EXEC_PERKS.find((p) => p.id === id)!;

/** Levels of an executive perk you own. */
export function execLevel(s: GameState, id: ExecId) {
  return s.job?.exec?.[id] ?? 0;
}

/** Executive perks open once Head Office is recruiting you. */
export function execOpen(s: GameState) {
  return (s.job?.top ?? 0) >= 1;
}

/** What the next level costs (null when it can't go higher). */
export function execCost(s: GameState, id: ExecId): number | null {
  const p = execDef(id);
  const lv = execLevel(s, id);
  if (lv >= p.max) return null;
  return Math.round(p.cost * Math.pow(p.growth, lv));
}

/** Buy a level of an executive perk with Reputation. */
export function buyExec(s: GameState, id: ExecId): JobResult {
  if (!execOpen(s)) return { ok: false, reason: 'The executive suite is for people Head Office is courting.' };
  const cost = execCost(s, id);
  if (cost === null) return { ok: false, reason: 'You can’t take any longer lunches.' };
  if (s.job.reputation < cost) return { ok: false, reason: `That needs ${cost.toLocaleString('en-US')} Reputation.` };
  s.job.reputation -= cost;
  s.job.exec[id] = execLevel(s, id) + 1;
  return { ok: true };
}

/** What an executive perk adds: 1 + its share per level (hours for Long Lunches). */
export function execMult(s: GameState, id: ExecId) {
  return 1 + execDef(id).each * execLevel(s, id);
}

/** The offers on the table at a tier (your highest by default): every company but this exact office. */
export function offers(s: GameState, tier = s.job.top) {
  return COMPANIES.filter((c) => c.id !== s.job.company || tier !== s.job.tier);
}

/**
 * Quit and start at `to`. The game starts over (it's a new company), keeping your job record,
 * your perks and Reputation, Bailey's tricks, your ball and your names. `seed` picks the new
 * company's luck. Changes `s` in place.
 */
export function startNewJob(s: GameState, to: CompanyId, tier = s.job.top, seed = (s.rng ^ 0x5bd1e995) & 0x7fffffff): JobResult {
  const can = canQuit(s);
  if (!can.ok) return can;
  if (!Number.isInteger(tier) || tier < 0 || tier > s.job.top) return { ok: false, reason: 'Nobody there is hiring you. Yet.' };
  if ((to === s.job.company && tier === s.job.tier) || !COMPANIES.some((c) => c.id === to)) return { ok: false, reason: 'Pick a new company.' };
  const rep = repForRun(s);
  const from = company(s);
  const job = {
    ...s.job,
    company: to,
    tier,
    closed: [...s.job.closed],
    runs: s.job.runs + 1,
    reputation: s.job.reputation + rep,
    earned: s.job.earned + rep,
    welcomed: false,
    perks: { ...s.job.perks },
    trophies: { ...s.job.trophies },
    history: [...s.job.history, { company: from.id, minutes: Math.round(s.time / 60), stage: s.stage, rep, tier: s.job.tier }].slice(-12),
  };
  const kept = { ball: { ...s.ball }, names: { ...(s.names ?? {}) }, scratches: s.office.scratches, daily: s.daily, rival: s.rival, safety: s.safety };
  const fresh = newGame(seed || 1);
  fresh.job = job;
  fresh.ball = kept.ball;
  fresh.names = kept.names;
  fresh.office.scratches = kept.scratches;
  // Today's challenges come along; the new job's counters all start at zero.
  if (kept.daily) fresh.daily = { ...kept.daily, seen: Object.fromEntries(Object.keys(kept.daily.seen).map((k) => [k, 0])) };
  // Everything else is the new company's: swap the whole state over in place.
  for (const k of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[k];
  Object.assign(s, fresh);
  startPerks(s);
  if (kept.rival) s.rival = kept.rival;
  s.safety = kept.safety !== false;
  const c = company(s);
  s.inbox = [];
  const office = tier > 0 ? ` (${tierName(tier)})` : '';
  pushEmail(s, 'HR', `Welcome to ${c.name}${office}!`, `We’re so glad you’re here. ${c.pitch} Your desk is on Floor ${tierFloor(tier)}. The person next to you is Gary. He seems nice.`, 'story');
  if (s.job.runs === 1) pushEmail(s, 'Dale (Facilities)', 'small world', 'turns out I work here too. don’t ask. same closet, end of the hall. D for Dale.', 'story');
  startRace(s);
  pushTicker(s, `Day one at ${c.name}. You brought your rubber band ball, your dog, and ${rep} Reputation’s worth of stories.`);
  return { ok: true };
}

/** Day one: what your perks give you. */
function startPerks(s: GameState) {
  s.career.rank = Math.min(5, perk(s, 'refs'));
  s.salary += JOB.bonus.salary * perk(s, 'bonus');
  s.bands += JOB.bonus.bands * perk(s, 'bonus');
  if (perk(s, 'friends')) s.allies.push(newAlly('kevin', 'gatherer'), newAlly('marjorie', 'lookout'));
}

// ---------------------------------------------------------------- what perks and companies change

/** Work pay: the company's rate, the tier, your Hustle, your trophies and the Standing Desks. */
export function jobPayMult(s: GameState) {
  return company(s).rules.pay * (1 + JOB.hustle * perk(s, 'hustle')) * trophyPayMult(s) * tierPay(s) * renoPay(s) * execMult(s, 'expense');
}

/** Hiring and training: the company's rate and your Headhunter. */
export function jobHireMult(s: GameState) {
  return company(s).rules.hire * (1 - JOB.headhunter * perk(s, 'headhunter'));
}

/** Dale's prices with your contacts. */
export function jobPriceMult(s: GameState) {
  return 1 - JOB.contacts * perk(s, 'contacts');
}

/** Your reputation precedes you: every point you've ever earned makes every band hit harder. */
export function repDamage(s: GameState) {
  return (1 + JOB.damagePerRep * (s.job?.earned ?? 0)) * trophyDamageMult(s) * execMult(s, 'clout');
}

/** How long time away can count for, in seconds. */
export function offlineCap(s: GameState, base: number) {
  return base + JOB.seniorityHours * 3600 * perk(s, 'seniority') + execDef('lunch').each * 3600 * execLevel(s, 'lunch');
}

// ---------------------------------------------------------------- the company's names for everyone

let swapRe: RegExp | null = null;
let swapFor = '';
let swapMap: Record<string, string> = {};

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Swap the names you'd know from Pemberton for this company's names, and Floor 4 for this office's floor (for anything shown on screen). */
export function companyText(id: CompanyId | undefined, text: string, floor = 4) {
  if (floor !== 4 && text) text = text.replace(/\bFloor 4\b/g, `Floor ${floor}`).replace(/\b4th floor\b/g, `${ordinal(floor)} floor`);
  if (!id || id === 'pemberton' || !text) return text;
  if (swapFor !== id) {
    swapFor = id;
    swapMap = COMPANIES.find((c) => c.id === id)?.names ?? {};
    const keys = Object.keys(swapMap);
    swapRe = keys.length ? new RegExp(`\\b(${keys.join('|')})\\b|Pemberton Solutions Group|Pemberton`, 'g') : null;
  }
  if (!swapRe) return text;
  const c = COMPANIES.find((x) => x.id === id)!;
  return text.replace(swapRe, (m) => (m === 'Pemberton Solutions Group' ? c.name : m === 'Pemberton' ? c.short : swapMap[m] ?? m));
}
