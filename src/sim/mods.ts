import { COWORKERS, TUNING, WEAPONS, type CoworkerId, type Role, type UpgradeId } from './content';
import type { GameState } from './state';

export function has(s: GameState, id: UpgradeId) {
  return s.upgrades.includes(id);
}

export function coworker(id: CoworkerId) {
  const c = COWORKERS.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown coworker ${id}`);
  return c;
}

/** How strong one ally is in a role: their trait bonus applies only to their trait's role. */
export function allyPower(id: CoworkerId, role: Role) {
  const c = coworker(id);
  return c.traitRole === role ? c.mult : 1;
}

/** Sum of power across every ally assigned to a role. */
export function rolePower(s: GameState, role: Role) {
  return s.allies.filter((a) => a.role === role).reduce((sum, a) => sum + allyPower(a.id, role), 0);
}

export function weapon(s: GameState) {
  const w = WEAPONS.find((w) => w.id === s.weapon);
  if (!w) throw new Error(`Unknown weapon ${s.weapon}`);
  return w;
}

/** Everything derived from upgrades and allies, computed fresh each step. */
export function mods(s: GameState) {
  const lookouts = rolePower(s, 'lookout');
  const engineers = rolePower(s, 'engineer');
  const gatherers = rolePower(s, 'gatherer');
  const covers = rolePower(s, 'cover');
  const bulk = has(s, 'bulk');

  const bandsPerSec =
    (has(s, 'organizer') ? TUNING.organizerRate : 0) +
    (has(s, 'closet') ? TUNING.closetRate : 0) +
    gatherers * TUNING.gathererRate +
    s.desks * TUNING.deskRate;

  const lookBusyMult = has(s, 'macros') ? 3 : 2;
  const basePay = (has(s, 'autoreply') ? TUNING.autoReplyPay : 0) + covers * TUNING.coverPay;

  return {
    lookoutCut: Math.min(TUNING.lookoutCutMax, lookouts * TUNING.lookoutCutEach),
    warning: Math.min(TUNING.warnMax, TUNING.warnBase + (has(s, 'riser') ? 1 : 0) + lookouts * TUNING.lookoutWarnEach),
    priceMult: 1 - Math.min(TUNING.engineerCutMax, engineers * TUNING.engineerCutEach),
    hasEngineer: s.allies.some((a) => a.role === 'engineer'),
    allyInterval: TUNING.allyInterval / (has(s, 'training') ? 1.3 : 1),
    yourNoiseMult: has(s, 'silent') ? 0.75 : 1,
    allNoiseMult: (has(s, 'carpet') ? 0.85 : 1) * (has(s, 'walls') ? 0.8 : 1),
    scrounge: has(s, 'rummage') ? 2 : 1,
    workPay: has(s, 'chair') ? 2 : 1,
    order: bulk ? { price: 12, amount: 200 } : { price: 5, amount: 50 },
    lookBusyMult,
    walkbyIntervalMult: has(s, 'calendar') ? 1.3 : 1,
    bandsPerSec,
    salaryPerSec: basePay * (s.lookBusy ? lookBusyMult : 1),
    coverCool: covers * TUNING.coverCool,
  };
}

export type Mods = ReturnType<typeof mods>;
