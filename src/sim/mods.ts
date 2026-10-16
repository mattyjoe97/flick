import { BAILEY, CHARGE, COWORKERS, DALE, PROMOTION, TUNING, WAR, WEAPONS, type CoworkerId, type Role, type TrickId, type UpgradeId, type WeaponId } from './content';
import { deptTaken, type GameState } from './state';

export function has(s: GameState, id: UpgradeId) {
  return s.upgrades.includes(id);
}

export function coworker(id: CoworkerId) {
  const c = COWORKERS.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown coworker ${id}`);
  return c;
}

/**
 * How strong one ally is in a role: their trait bonus applies only to their trait's
 * role, and promotions (Senior, Lead) make them better at whatever they're doing.
 */
export function allyPower(id: CoworkerId, role: Role, rank = 0) {
  const c = coworker(id);
  return (c.traitRole === role ? c.mult : 1) * PROMOTION.bonus[rank];
}

/** Sum of power across every ally assigned to a role. */
export function rolePower(s: GameState, role: Role) {
  return s.allies.filter((a) => a.role === role).reduce((sum, a) => sum + allyPower(a.id, role, a.rank), 0);
}

/** Is this weapon sitting in Mr. Feeney's drawer? */
export function isConfiscated(s: GameState, id: WeaponId) {
  return s.hr?.confiscated?.weapon === id;
}

/** The weapon you (and your Shooters) actually fire: the Finger Flick while yours is confiscated. */
export function weapon(s: GameState) {
  const id = isConfiscated(s, s.weapon) ? 'flick' : s.weapon;
  const w = WEAPONS.find((w) => w.id === id);
  if (!w) throw new Error(`Unknown weapon ${id}`);
  return w;
}

/** Has Bailey learned this trick yet? */
export function knowsTrick(s: GameState, id: TrickId) {
  const t = BAILEY.tricks.find((x) => x.id === id)!;
  return (s.office?.scratches ?? 0) >= t.at;
}

/** From the Department War on, Dale's closet pays you bands unless a raid just got away. */
export function closetIsYours(s: GameState) {
  return s.stage >= 3 && s.time >= (s.war?.closet.lostUntil ?? -999);
}

/** On Final Warning: one more write-up and you're fired. */
export function onFinalWarning(s: GameState) {
  return (s.hr?.writeUps ?? 0) >= TUNING.writeUpsToFinal;
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
    s.desks * TUNING.deskRate +
    (knowsTrick(s, 'fetch') ? BAILEY.fetchRate : 0) +
    (deptTaken(s, 'mailroom') ? WAR.mailroomRate : 0) +
    (closetIsYours(s) ? WAR.closet.bonus : 0);

  const lookBusyMult = has(s, 'macros') ? 3 : 2;
  const basePay = (has(s, 'autoreply') ? TUNING.autoReplyPay : 0) + covers * TUNING.coverPay;

  return {
    lookoutCut: Math.min(TUNING.lookoutCutMax, lookouts * TUNING.lookoutCutEach),
    // Bailey hears Mr. Feeney's shoes first: her extra second comes on top of everything.
    // Guard: another second on top of that.
    warning: Math.min(TUNING.warnMax, TUNING.warnBase + (has(s, 'riser') ? 1 : 0) + lookouts * TUNING.lookoutWarnEach) + BAILEY.warn + (knowsTrick(s, 'guard') ? 1 : 0),
    priceMult: 1 - Math.min(TUNING.engineerCutMax, engineers * TUNING.engineerCutEach),
    hasEngineer: s.allies.some((a) => a.role === 'engineer'),
    allyInterval: TUNING.allyInterval / (has(s, 'training') ? 1.3 : 1),
    yourNoiseMult: has(s, 'silent') ? 0.75 : 1,
    allNoiseMult: (has(s, 'carpet') ? 0.85 : 1) * (has(s, 'walls') ? 0.8 : 1),
    scrounge: has(s, 'rummage') ? 2 : 1,
    workPay: has(s, 'chair') ? 2 : 1,
    order: bulk ? { price: 12, amount: 200 } : { price: 5, amount: 50 },
    lookBusyMult,
    walkbyIntervalMult: (has(s, 'calendar') ? 1.3 : 1) * (onFinalWarning(s) ? TUNING.finalWarningWalkbyMult : 1),
    bandsPerSec,
    salaryPerSec: basePay * (s.lookBusy ? lookBusyMult : 1),
    coverCool: covers * TUNING.coverCool,
    bandDamage: has(s, 'thick') ? DALE.thickDamage : 1,
    perfectWindow: has(s, 'waxed') ? DALE.waxedWindow : CHARGE.perfectWindow,
    snapAfter: has(s, 'waxed') ? DALE.waxedSnap : CHARGE.snapAfter,
  };
}

export type Mods = ReturnType<typeof mods>;
