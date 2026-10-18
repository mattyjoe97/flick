import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/sim/content';
import { flick, step } from '../src/sim/engine';
import { claimGolden, GOLDEN, goldenDamage, goldenTeam, stepGolden } from '../src/sim/golden';
import { deserialize, serialize } from '../src/sim/save';
import { newGame, type GameState } from '../src/sim/state';

function quiet(): GameState {
  const s = newGame(11);
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  return s;
}

/** Runs the clock until the stapler is out (or gives up). */
function untilShown(s: GameState, seconds = 1200) {
  for (let i = 0; i < seconds / TUNING.stepSeconds && !s.golden.shown; i++) step(s, TUNING.stepSeconds);
  return s.golden.shown;
}

/** Puts a stapler out now and grabs it until it gives the wanted kind (the kind is random). */
function grab(make: () => GameState, kind: string) {
  for (let seed = 0; seed < 200; seed++) {
    const s = make();
    s.rng = seed + 1;
    s.golden.shown = { until: s.time + 5, x: 0.5, y: 0.5 };
    if (claimGolden(s) === kind) return s;
  }
  throw new Error(`never got ${kind}`);
}

describe('The golden stapler', () => {
  it('turns up a few minutes in, at your desk, and leaves if you miss it', () => {
    const s = quiet();
    expect(untilShown(s, GOLDEN.first - 5)).toBeNull();
    const shown = untilShown(s);
    expect(shown).not.toBeNull();
    expect(s.events.some((e) => e.type === 'goldenSpawn')).toBe(true);
    for (let i = 0; i < (GOLDEN.seconds + 1) / TUNING.stepSeconds; i++) step(s, TUNING.stepSeconds);
    expect(s.golden.shown).toBeNull();
    expect(s.golden.nextAt).toBeGreaterThan(s.time + GOLDEN.gap[0] - 1);
  });

  it('never turns up while you are at your computer or Mr. Feeney is coming', () => {
    const s = quiet();
    s.golden.nextAt = 0;
    s.lookBusy = true;
    stepGolden(s);
    expect(s.golden.shown).toBeNull();
    s.lookBusy = false;
    s.walkby.arrivesAt = s.time + 3;
    stepGolden(s);
    expect(s.golden.shown).toBeNull();
    s.walkby.arrivesAt = null;
    stepGolden(s);
    expect(s.golden.shown).not.toBeNull();
  });

  it('only works while it is out', () => {
    const s = quiet();
    expect(claimGolden(s)).toBeNull();
    s.golden.shown = { until: s.time + 5, x: 0.5, y: 0.5 };
    expect(claimGolden(s)).not.toBeNull();
    expect(s.stats.goldens).toBe(1);
    expect(claimGolden(s)).toBeNull();
  });

  it('Frenzy: three times the damage for half a minute', () => {
    const s = grab(quiet, 'frenzy');
    expect(goldenDamage(s)).toBe(GOLDEN.frenzy.damage);
    const plain = quiet();
    const hit = (x: GameState) => {
      x.targetResolve = 1e6;
      x.nextFlickAt = 0;
      x.suspicion = 0;
      x.bands = 100;
      const before = x.targetResolve;
      flick(x, 1);
      return before - x.targetResolve;
    };
    expect(hit(s)).toBeCloseTo(hit(plain) * GOLDEN.frenzy.damage, 6);
    for (let i = 0; i < (GOLDEN.frenzy.seconds + 1) / TUNING.stepSeconds; i++) step(s, TUNING.stepSeconds);
    expect(goldenDamage(s)).toBe(1);
  });

  it('Overtime only when you have a team, and it speeds the team up', () => {
    const withTeam = () => {
      const s = quiet();
      s.staff.temp = { seats: 3, level: 0, done: 0 };
      return s;
    };
    const s = grab(withTeam, 'overtime');
    expect(goldenTeam(s)).toBe(GOLDEN.overtime.team);
    // Nobody to work overtime: it never comes up.
    for (let seed = 0; seed < 100; seed++) {
      const t = quiet();
      t.rng = seed + 1;
      t.golden.shown = { until: t.time + 5, x: 0.5, y: 0.5 };
      expect(claimGolden(t)).not.toBe('overtime');
    }
  });

  it('Windfall pays, Band storm gives bands and readies the Barrage, Clean slate clears Suspicion', () => {
    const w = grab(quiet, 'windfall');
    expect(w.salary).toBeGreaterThan(0);
    const stage2 = () => {
      const s = quiet();
      s.stage = 2;
      s.barrageAt = s.time + 60;
      return s;
    };
    const b = grab(stage2, 'storm');
    expect(b.bands).toBeGreaterThanOrEqual(GOLDEN.stormMin);
    expect(b.barrageAt).toBeLessThanOrEqual(b.time);
    const nervous = () => {
      const s = quiet();
      s.suspicion = 80;
      s.walkby.nextAt = s.time + 30;
      return s;
    };
    const c = grab(nervous, 'clean');
    expect(c.suspicion).toBe(0);
    expect(c.walkby.nextAt).toBeGreaterThanOrEqual(c.time + 30 + GOLDEN.cleanDelay - 1);
  });

  it('saves keep the bonus but not a stapler on screen', () => {
    const s = grab(quiet, 'frenzy');
    s.golden.shown = { until: s.time + 5, x: 0.4, y: 0.4 };
    const back = deserialize(serialize(s))!.state;
    expect(back.golden.shown).toBeNull();
    expect(back.golden.boost?.kind).toBe('frenzy');
  });
});
