// Trophies: achievements that stay with you from job to job, on the shelf in the Trophies
// app. Each one you've won makes all your pay 2% better and your bands hit 1% harder, so
// every restart has a few more goals to chase.

import { COMPANIES, COWORKERS } from './content';
import { pushTicker, type GameState } from './state';

export interface Trophy {
  id: string;
  name: string;
  does: string; // how you win it
  check: (s: GameState) => boolean;
}

const seatsTotal = (s: GameState) => Object.values(s.staff ?? {}).reduce((n, t) => n + (t?.seats ?? 0), 0);
const companiesWorked = (s: GameState) => new Set([s.job.company, ...s.job.history.map((h) => h.company)]).size;

export const TROPHIES: Trophy[] = [
  // The war
  { id: 'firstblood', name: 'First Blood', does: 'Make Gary retreat behind his monitor.', check: (s) => s.stage > 1 || s.targetIndex > 0 },
  { id: 'truce', name: 'Truce', does: 'Win Stage 1.', check: (s) => s.stage >= 2 },
  { id: 'rick', name: 'Door Closed', does: 'Send Rick to work from home.', check: (s) => s.stage >= 3 },
  { id: 'takeover', name: 'Hostile Takeover', does: 'Take a department.', check: (s) => (s.stats.depts ?? 0) >= 1 || s.stage >= 4 },
  { id: 'floorplan', name: 'Floor Plan', does: 'Take all four departments.', check: (s) => s.stage >= 4 },
  { id: 'demolition', name: 'Demolition', does: 'Knock down a filing-cabinet wall.', check: (s) => (s.stats.walls ?? 0) >= 1 },
  { id: 'wholefloor', name: 'The Whole Floor', does: 'Take the Break Room and the Conference Room.', check: (s) => s.stage >= 5 },
  { id: 'caseclosed', name: 'Case Closed', does: 'Close HR’s investigation.', check: (s) => s.stage >= 6 },
  { id: 'wonk', name: 'Policy Wonk', does: 'Close HR’s case with memos alone.', check: (s) => (s.stats.caseGoodwill ?? 0) >= 1 },
  { id: 'fasttrack', name: 'Fast Track', does: 'Close HR’s case within 2 hours of starting a job.', check: (s) => s.stage >= 6 && (s.stats.stage5At ?? Infinity) <= 7200 },
  { id: 'spotless', name: 'Spotless Record', does: 'Reach the Department War without getting caught once.', check: (s) => s.stage >= 3 && s.stats.caught === 0 && s.stats.fired === 0 },
  // Fighting
  { id: 'perfect', name: 'Perfect Form', does: 'Land 50 Perfect flicks.', check: (s) => s.stats.perfect >= 50 },
  { id: 'barrage', name: 'Shock and Awe', does: 'Call 25 Barrages.', check: (s) => (s.stats.barrages ?? 0) >= 25 },
  { id: 'gatling', name: 'Power Tools', does: 'Get the Drill-Powered Gatling.', check: (s) => s.ownedWeapons.includes('gatling') },
  { id: 'rematch', name: 'Old Habits', does: 'Win 25 rematches.', check: (s) => (s.stats.rematches ?? 0) >= 25 },
  { id: 'raids', name: 'Closet Monster', does: 'Chase off 5 raids on the supply closet.', check: (s) => (s.stats.raidsStopped ?? 0) >= 5 },
  // Work and career
  { id: 'promoted', name: 'Moving Up', does: 'Get promoted.', check: (s) => s.career.rank >= 1 },
  { id: 'manager', name: 'Floor Manager', does: 'Reach Floor Manager.', check: (s) => s.career.rank >= 8 },
  { id: 'ceo', name: 'Corner Office', does: 'Become CEO.', check: (s) => s.career.rank >= 15 },
  { id: 'straighta', name: 'Straight A’s', does: 'Get 25 A grades at work.', check: (s) => (s.stats.gradeA ?? 0) >= 25 },
  { id: 'busybee', name: 'Busy Bee', does: 'Finish 500 pieces of work.', check: (s) => s.stats.tasksDone >= 500 },
  { id: 'zone', name: 'In the Zone', does: 'Reach a 15 combo.', check: (s) => (s.stats.bestCombo ?? 0) >= 15 },
  // Your people
  { id: 'hire', name: 'Delegator', does: 'Hire someone.', check: (s) => (s.stats.hires ?? 0) >= 1 },
  { id: 'headcount', name: 'Headcount', does: 'Have 20 people on your teams.', check: (s) => seatsTotal(s) >= 20 },
  { id: 'dreamteam', name: 'Dream Team', does: 'Have all six coworkers on your side.', check: (s) => COWORKERS.every((c) => s.allies.some((a) => a.id === c.id)) },
  { id: 'witness', name: 'Selective Memory', does: 'Coach 10 witnesses before HR interviews.', check: (s) => (s.stats.coached ?? 0) >= 10 },
  // The office
  { id: 'goodgirl', name: 'Good Girl', does: 'Teach Bailey all four tricks.', check: (s) => (s.office?.scratches ?? 0) >= 100 },
  { id: 'monster', name: 'The Monster', does: 'Grow your rubber band ball into The Monster.', check: (s) => (s.ball?.wound ?? 0) >= 150000 },
  { id: 'dale', name: 'Regular Customer', does: 'Take 5 of Dale’s deals.', check: (s) => (s.stats.dealsTaken ?? 0) >= 5 },
  { id: 'hustle', name: 'Great Hustle', does: 'Hide from Mr. Feeney 50 times.', check: (s) => s.stats.hides >= 50 },
  { id: 'fired', name: 'Fresh Start', does: 'Get fired. (It happens.)', check: (s) => s.stats.fired >= 1 },
  // Jobs
  { id: 'notice', name: 'Two Weeks’ Notice', does: 'Quit for a new job.', check: (s) => s.job.runs >= 1 },
  { id: 'hopper', name: 'Job Hopper', does: `Work at all ${COMPANIES.length} companies.`, check: (s) => companiesWorked(s) >= COMPANIES.length },
  { id: 'veteran', name: 'Industry Veteran', does: 'Earn 500 Reputation in all.', check: (s) => s.job.earned >= 500 },
  // The career ladder
  { id: 'headoffice', name: 'Moving On Up', does: 'Work at a Head Office.', check: (s) => (s.job.tier ?? 0) >= 1 },
  { id: 'globalhq', name: 'Top Floor', does: 'Work at Global HQ.', check: (s) => (s.job.tier ?? 0) >= 2 },
  { id: 'renovator', name: 'Extreme Makeover', does: 'Buy 15 renovations at one job.', check: (s) => (s.stats.renovations ?? 0) >= 15 },
  { id: 'shares', name: 'Shareholder Value', does: 'Hold 25 shares of company stock.', check: (s) => (s.stats.shares ?? 0) >= 25 },
  // The golden stapler
  { id: 'shiny', name: 'Ooh, Shiny', does: 'Grab a golden stapler.', check: (s) => (s.stats.goldens ?? 0) >= 1 },
  { id: 'magpie', name: 'Magpie', does: 'Grab 25 golden staplers in one job.', check: (s) => (s.stats.goldens ?? 0) >= 25 },
  // Office chaos
  { id: 'chaos', name: 'Business as Usual', does: 'Live through 10 office chaos events in one job.', check: (s) => (s.stats.chaos ?? 0) >= 10 },
];

export const TROPHY_BONUS = { pay: 0.02, damage: 0.01 };

/** How many trophies you've won. */
export function trophyCount(s: GameState) {
  return Object.keys(s.job?.trophies ?? {}).length;
}

/** Every trophy makes your pay a little better... */
export function trophyPayMult(s: GameState) {
  return 1 + TROPHY_BONUS.pay * trophyCount(s);
}

/** ...and your bands hit a little harder. */
export function trophyDamageMult(s: GameState) {
  return 1 + TROPHY_BONUS.damage * trophyCount(s);
}

/** Checks for new trophies (once a second is plenty). */
export function stepTrophies(s: GameState) {
  if (!s.job) return;
  const sec = Math.floor(s.time);
  if (sec === lastSec.get(s)) return;
  lastSec.set(s, sec);
  for (const t of TROPHIES) {
    if (s.job.trophies[t.id] !== undefined) continue;
    if (!t.check(s)) continue;
    s.job.trophies[t.id] = s.job.runs;
    pushTicker(s, `Trophy: ${t.name}. ${t.does} (Pay +${Math.round(TROPHY_BONUS.pay * 100)}%, bands hit +${Math.round(TROPHY_BONUS.damage * 100)}% harder.)`);
    s.events.push({ type: 'trophy', id: t.id });
  }
}

const lastSec = new WeakMap<GameState, number>();
