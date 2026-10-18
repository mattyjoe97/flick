import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/sim/content';
import { flick, step } from '../src/sim/engine';
import { CHAOS, chaosDamage, chaosNoise, chaosOn, startChaos, stepChaos } from '../src/sim/chaos';
import { mods } from '../src/sim/mods';
import { deserialize, serialize } from '../src/sim/save';
import { staffPayPerMin } from '../src/sim/staff';
import { newGame, type GameState } from '../src/sim/state';

function quiet(stage: GameState['stage'] = 2): GameState {
  const s = newGame(21);
  s.stage = stage;
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  s.golden.nextAt = 1e9;
  s.war.closet.nextAt = 1e9;
  s.targetResolve = 1e9;
  s.bands = 1e6;
  return s;
}

function run(s: GameState, seconds: number) {
  for (let i = 0; i < seconds / TUNING.stepSeconds; i++) step(s, TUNING.stepSeconds);
}

function hit(s: GameState) {
  s.nextFlickAt = 0;
  s.flickLockUntil = 0;
  s.suspicion = 0;
  const before = s.targetResolve;
  flick(s, 1);
  return before - s.targetResolve;
}

describe('Office chaos', () => {
  it('waits for Stage 2, starts after ten minutes, and ends on its own', () => {
    const s1 = quiet(1);
    run(s1, CHAOS.first + 30);
    expect(s1.chaos.event).toBeNull();
    const s = quiet();
    run(s, CHAOS.first - 5);
    expect(s.chaos.event).toBeNull();
    run(s, 10);
    expect(s.chaos.event).not.toBeNull();
    expect(s.events.some((e) => e.type === 'chaosStart')).toBe(true);
    expect(s.stats.chaos).toBe(1);
    run(s, 95);
    expect(s.chaos.event).toBeNull();
    expect(s.chaos.nextAt).toBeGreaterThan(s.time + CHAOS.gap[0] - 100);
  });

  it('never starts while Mr. Feeney is on his way', () => {
    const s = quiet();
    s.chaos.nextAt = 0;
    s.walkby.arrivesAt = s.time + 3;
    stepChaos(s);
    expect(s.chaos.event).toBeNull();
    s.walkby.arrivesAt = null;
    stepChaos(s);
    expect(s.chaos.event).not.toBeNull();
  });

  it('Fire Drill: twice the damage, no noise, no walk-bys', () => {
    const plain = quiet();
    const s = quiet();
    s.walkby.nextAt = s.time + 5;
    startChaos(s, 'drill');
    expect(chaosOn(s)).toBe('drill');
    expect(hit(s)).toBeCloseTo(hit(plain) * CHAOS.drillDamage, 6);
    expect(mods(s).allNoiseMult).toBe(0);
    s.suspicion = 0;
    for (let i = 0; i < 20; i++) hit(s);
    run(s, 30);
    expect(s.walkby.arrivesAt).toBeNull();
    run(s, 40);
    expect(chaosOn(s)).toBeNull();
    expect(chaosDamage(s)).toBe(1);
  });

  it('Power Outage: silent shots, but the team stops', () => {
    const s = quiet();
    s.staff.temp = { seats: 4, level: 0, done: 0 };
    const pay = staffPayPerMin(s, true);
    expect(pay).toBeGreaterThan(0);
    startChaos(s, 'outage');
    expect(chaosNoise(s)).toBe(0);
    expect(staffPayPerMin(s, true)).toBe(0);
    run(s, CHAOS.seconds.outage + 1);
    expect(staffPayPerMin(s, true)).toBeGreaterThanOrEqual(pay);
  });

  it('Birthday Cake: bands hit 50% harder, Suspicion builds half as fast', () => {
    const plain = quiet();
    const s = quiet();
    startChaos(s, 'cake');
    expect(hit(s)).toBeCloseTo(hit(plain) * CHAOS.cakeDamage, 6);
    plain.suspicion = 0;
    s.suspicion = 0;
    plain.nextFlickAt = 0;
    s.nextFlickAt = 0;
    flick(plain, 1);
    flick(s, 1);
    expect(s.suspicion).toBeCloseTo(plain.suspicion * CHAOS.cakeSuspicion, 6);
  });

  it('Surprise Inspection: Mr. Feeney comes soon, and hiding from him pays', () => {
    const s = quiet();
    startChaos(s, 'inspection');
    expect(s.walkby.nextAt).toBeLessThanOrEqual(s.time + CHAOS.inspectionFirst);
    s.lookBusy = true;
    const before = s.salary;
    run(s, CHAOS.inspectionFirst + 20);
    expect(s.stats.hides).toBeGreaterThan(0);
    expect(s.salary).toBeGreaterThan(before);
  });

  it('Power Outage only comes up when you have a team', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = quiet();
      s.rng = seed;
      s.chaos.nextAt = 0;
      stepChaos(s);
      expect(s.chaos.event?.kind).not.toBe('outage');
    }
  });

  it('saves drop an event in progress', () => {
    const s = quiet();
    startChaos(s, 'cake');
    const back = deserialize(serialize(s))!.state;
    expect(back.chaos.event).toBeNull();
    expect(back.chaos.nextAt).toBe(s.chaos.nextAt);
    // A save from before office chaos: the first one waits ten minutes.
    const file = JSON.parse(serialize(s));
    file.state.time = 5000;
    delete file.state.chaos;
    expect(deserialize(JSON.stringify(file))!.state.chaos.nextAt).toBe(5000 + CHAOS.first);
  });
});
