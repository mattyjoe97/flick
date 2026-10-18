import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/sim/content';
import { barrage, flick, step } from '../src/sim/engine';
import { repForRun, repForWork } from '../src/sim/job';
import { closeCase } from '../src/sim/politics';
import { deserialize, serialize } from '../src/sim/save';
import { newGame, currentTarget, type GameState } from '../src/sim/state';
import { cutFloss, objectionOn, snared, downRound, TENANTS, TENANT_RULES, tenantFloor, tenantRepBonus } from '../src/sim/tenants';
import { fight } from '../src/sim/war';

/** The case is closed (Stage 6), the office quiet, bands and money to spare. */
function stage6(): GameState {
  const s = newGame(51);
  s.stage = 5;
  s.career.rank = 10;
  s.stats.bounties = 400000;
  closeCase(s, 'fight');
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  s.golden.nextAt = 1e9;
  s.chaos.nextAt = 1e9;
  s.bands = 1e7;
  s.salary = 1e7;
  return s;
}

function run(s: GameState, seconds: number) {
  for (let i = 0; i < seconds / TUNING.stepSeconds; i++) step(s, TUNING.stepSeconds);
}

function shoot(s: GameState) {
  s.nextFlickAt = 0;
  s.flickLockUntil = 0;
  s.suspicion = 0;
  const before = s.targetResolve;
  flick(s, 1);
  return before - s.targetResolve;
}

describe('Building Takeover', () => {
  it('opens when the case closes: Building Management emails, one floor up first', () => {
    const s = stage6();
    run(s, 1);
    expect(s.inbox.some((m) => m.from === 'Building Management')).toBe(true);
    expect(fight(s, 'tenant').ok).toBe(true);
    expect(currentTarget(s)?.id).toBe('law');
    expect(tenantFloor(s, 0)).toBe(5);
    expect(s.inbox[0].from).toContain('Hargrove');
    // Not before Stage 6.
    const t = newGame(1);
    t.stage = 5;
    expect(fight(t, 'tenant').ok).toBe(false);
  });

  it('Objection: nothing lands and your bands bounce back', () => {
    const s = stage6();
    fight(s, 'tenant');
    const hit = shoot(s);
    expect(hit).toBeGreaterThan(0);
    run(s, TENANT_RULES.objection.first + 0.2);
    expect(objectionOn(s)).toBe(true);
    const bands = s.bands;
    expect(shoot(s)).toBe(0);
    expect(s.bands).toBeLessThan(bands - 1000); // 1% of 10M, beyond the shot itself
    expect(s.tenants.ricochets).toBe(1);
    run(s, TENANT_RULES.objection.seconds + 0.2);
    expect(objectionOn(s)).toBe(false);
    expect(shoot(s)).toBeGreaterThan(0);
  });

  it('Floss halves your flick rate until you cut it', () => {
    const s = stage6();
    s.tenants.taken = 1;
    fight(s, 'tenant');
    expect(currentTarget(s)?.id).toBe('dental');
    run(s, TENANT_RULES.floss.first + 0.2);
    expect(snared(s)).toBe(true);
    s.nextFlickAt = 0;
    flick(s, 0);
    const w = s.nextFlickAt - s.time;
    for (let i = 0; i < TENANT_RULES.floss.cuts; i++) cutFloss(s);
    expect(snared(s)).toBe(false);
    s.nextFlickAt = 0;
    flick(s, 0);
    expect(s.nextFlickAt - s.time).toBeCloseTo(w / TENANT_RULES.floss.reloadMult, 6);
    expect(s.stats.flossCut).toBe(1);
  });

  it('Funding: he recovers while funded; a down round doubles your damage', () => {
    const s = stage6();
    s.tenants.taken = 2;
    fight(s, 'tenant');
    s.targetResolve = TENANTS[2].resolve * 0.5;
    const r = s.targetResolve;
    run(s, 10);
    expect(s.targetResolve).toBeGreaterThan(r);
    const plain = shoot(s);
    run(s, TENANT_RULES.funding.drainSeconds);
    expect(downRound(s)).toBe(true);
    expect(shoot(s)).toBeCloseTo(plain * TENANT_RULES.funding.downDamage, 3);
    run(s, TENANT_RULES.funding.downSeconds + 1);
    expect(downRound(s)).toBe(false);
    expect(s.tenants.funding.level).toBeLessThanOrEqual(TENANT_RULES.funding.refill);
  });

  it('each floor pays and makes the job worth more; all three take the building', () => {
    const s = stage6();
    fight(s, 'tenant');
    const work = repForWork(s);
    for (let i = 0; i < 3; i++) {
      const cash = s.salary;
      s.targetResolve = 1;
      s.tenants.objection.until = 0;
      s.tenants.objection.nextAt = 1e9;
      shoot(s);
      expect(s.salary).toBeGreaterThan(cash);
      expect(s.tenants.taken).toBe(i + 1);
    }
    expect(tenantRepBonus(s)).toBeCloseTo(3 * TENANT_RULES.repEach + TENANT_RULES.repAll, 6);
    expect(repForRun(s)).toBeGreaterThanOrEqual(repForWork(s) + Math.floor(repForWork(s) * 0.55));
    expect(repForWork(s)).toBeGreaterThanOrEqual(work);
    expect(s.war.fighting).toBe('rematch');
    expect(fight(s, 'tenant').ok).toBe(false);
    expect(s.job.trophies.landlord).toBeUndefined(); // trophies are checked on the next step
    run(s, 1.1);
    expect(s.job.trophies.landlord).toBeDefined();
  });

  it('switching away keeps their Resolve; saves keep the fight', () => {
    const s = stage6();
    fight(s, 'tenant');
    s.targetResolve = TENANTS[0].resolve * 0.4;
    fight(s, 'rematch');
    fight(s, 'tenant');
    expect(s.targetResolve).toBeCloseTo(TENANTS[0].resolve * 0.4, 0);
    const back = deserialize(serialize(s))!.state;
    expect(back.war.fighting).toBe('tenant');
    expect(back.tenants.met[0]).toBe(true);
    void barrage;
  });
});
