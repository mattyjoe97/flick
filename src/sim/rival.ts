// Your rival: Chad Whitmore, the Pemberton intern who "also left" the day you did. From your
// second job on he's at another company at the same rung of the ladder, racing you to close
// HR's case. His time is a little better than your best at that rung (so he keeps up as you
// get faster); close the case before him and the job pays a Reputation bonus when you leave.
//
// He doesn't touch your game: he just emails, and turns up on the ticker as he goes.

import { COMPANIES, type CompanyId } from './content';
import { pushEmail, pushTicker, type GameState } from './state';

export const RIVAL = {
  name: 'Chad Whitmore',
  short: 'Chad',
  beat: 0.92, // his time: this much of your best case-closing time at the same rung
  minMinutes: 40,
  /** When you've never closed a case at this rung: the first time at a tier is a long job. */
  fresh: [150, 190, 130] as number[],
  rep: 0.25, // beat him: this much more Reputation for the job
};

export interface RivalState {
  met: boolean;
  /** This job's race (null on your first job). */
  race: { company: CompanyId; target: number; stage: number; result: 'won' | 'lost' | null } | null;
  wins: number;
  losses: number;
  /** Your fastest case close at each rung, in seconds. */
  best: number[];
}

export function newRival(): RivalState {
  return { met: false, race: null, wins: 0, losses: 0, best: [] };
}

function companyName(id: CompanyId) {
  return COMPANIES.find((c) => c.id === id)?.short ?? 'somewhere';
}

/** His time (seconds) for a job at this tier. */
export function rivalTarget(s: GameState, tier: number) {
  const best = s.rival.best[tier];
  // Older saves: no case times yet, but the minutes you spent on each job are an upper bound.
  const fromHistory = s.job.history.filter((h) => (h.tier ?? 0) === tier && h.stage >= 6).map((h) => h.minutes * 60);
  const yours = best ?? (fromHistory.length ? Math.min(...fromHistory) : null);
  const minutes = yours !== null ? (yours / 60) * RIVAL.beat : RIVAL.fresh[Math.min(tier, RIVAL.fresh.length - 1)];
  return Math.max(RIVAL.minMinutes, Math.round(minutes)) * 60;
}

/** A new job: Chad starts somewhere else at the same rung, and the clock starts. */
export function startRace(s: GameState) {
  const r = s.rival;
  const others = COMPANIES.filter((c) => c.id !== s.job.company);
  const company = others[s.job.runs % others.length].id;
  const target = rivalTarget(s, s.job.tier ?? 0);
  r.race = { company, target, stage: 1, result: null };
  const mins = Math.round(target / 60);
  if (!r.met) {
    r.met = true;
    pushEmail(
      s,
      RIVAL.name,
      'small world (again)',
      `Hey! Chad, from Pemberton. The intern? I left the same day you did. Just started at ${companyName(company)}. Funny thing: I hear HR opens a case on everyone eventually. Bet I close mine first. I’m thinking ${mins} minutes, tops. Race you.`,
      'story',
    );
  } else {
    const record = r.wins || r.losses ? ` (You’re ${r.wins}–${r.losses} against me.)` : '';
    pushEmail(s, RIVAL.name, 'new job, who dis', `Started at ${companyName(company)} today. Same deal: first to close HR’s case. ${mins} minutes. Clock’s running.${record}`, 'story');
  }
}

/** How far along Chad is: his stage (1–6, 6 = his case is closed). */
export function rivalStage(s: GameState) {
  const race = s.rival?.race;
  if (!race) return 0;
  return s.time >= race.target ? 6 : Math.min(5, 1 + Math.floor((5 * s.time) / race.target));
}

/** Seconds until Chad closes his case (0 once he has). */
export function rivalLeft(s: GameState) {
  const race = s.rival?.race;
  return race ? Math.max(0, race.target - s.time) : 0;
}

const STAGE_NEWS: Record<number, [ahead: string, behind: string]> = {
  2: ['Chad: “Barrages? Cute. I have an intern for that now.”', 'Chad: “Stage 2 already. Do you even have a stapler yet?”'],
  3: ['Chad: “Department War. Mine’s going great. Totally great.”', 'Chad: “Department War, day one. My Mailroom never saw it coming.”'],
  4: ['Chad: “Filing cabinets. Who builds a wall out of filing cabinets?”', 'Chad: “Two rooms left. Want some tips?”'],
  5: ['Chad: “HR opened a case on me. Wait, you’re already past that?”', 'Chad: “HR’s investigating me. Practically done. You?”'],
};

/** Every step: Chad's progress, and the race decided when one of you closes the case. */
export function stepRival(s: GameState) {
  const race = s.rival?.race;
  if (!race || race.result) return;
  const his = rivalStage(s);
  if (his >= 6) {
    race.result = 'lost';
    s.rival.losses++;
    const text = pushTicker(s, `Chad closed his case at ${companyName(race.company)}. He’ll be insufferable. You can still finish yours, but there’s no bonus this time.`);
    pushEmail(s, RIVAL.name, 'case closed 😎', `Done. HR folded at ${companyName(race.company)}. Take your time, honestly. Some of us are just built different.`, 'story');
    s.events.push({ type: 'rival', result: 'lost', text });
    return;
  }
  if (his > race.stage) {
    race.stage = his;
    const news = STAGE_NEWS[his];
    if (news) pushTicker(s, news[s.stage >= his ? 0 : 1]);
  }
}

/** You just closed HR's case: record your time, and win the race if Chad hasn't finished. */
export function rivalCaseClosed(s: GameState) {
  const r = s.rival;
  if (!r) return;
  const tier = s.job.tier ?? 0;
  r.best[tier] = Math.min(r.best[tier] ?? Infinity, s.time);
  const race = r.race;
  if (!race || race.result) return;
  race.result = 'won';
  r.wins++;
  const mins = Math.max(1, Math.round((race.target - s.time) / 60));
  const text = pushTicker(s, `You closed the case before Chad, with ${mins} minute${mins === 1 ? '' : 's'} to spare. This job pays ${Math.round(RIVAL.rep * 100)}% more Reputation when you leave.`);
  pushEmail(s, RIVAL.name, 're: case closed', `wait you’re done?? ok well mine is basically done too. it doesn’t count if you weren’t trying. which I wasn’t.`, 'story');
  s.events.push({ type: 'rival', result: 'won', text });
}

/** The Reputation bonus for beating Chad on this job (a share of what the job earns). */
export function rivalBonus(s: GameState) {
  return s.rival?.race?.result === 'won' ? RIVAL.rep : 0;
}

export function rivalCompany(s: GameState) {
  const race = s.rival?.race;
  return race ? companyName(race.company) : '';
}

/** Saves: keep it, and tidy anything odd. */
export function rivalForLoad(saved: Partial<RivalState> | undefined): RivalState {
  const r = { ...newRival(), ...(saved ?? {}) };
  r.wins = Math.max(0, Math.floor(Number(r.wins) || 0));
  r.losses = Math.max(0, Math.floor(Number(r.losses) || 0));
  r.best = Array.isArray(r.best) ? r.best.map((x) => (Number.isFinite(x) && x > 0 ? x : (undefined as unknown as number))) : [];
  const race = r.race;
  if (race && !(COMPANIES.some((c) => c.id === race.company) && Number.isFinite(race.target))) r.race = null;
  return r;
}
