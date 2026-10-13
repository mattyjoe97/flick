import { describe, expect, it } from 'vitest';
import { TARGETS, TUNING } from '../src/sim/content';
import { addSuspicion, buyWeapon, flick, recruit, scrounge, setLookBusy, step, work } from '../src/sim/engine';
import { deserialize, exportSave, importSave, serialize } from '../src/sim/save';
import { newGame } from '../src/sim/state';
import { playBot, STYLES } from './bot';

function run(s: ReturnType<typeof newGame>, seconds: number) {
  for (let i = 0; i < seconds / TUNING.stepSeconds; i++) step(s, TUNING.stepSeconds);
}

describe('core actions', () => {
  it('flicking spends a band, damages the target and makes noise', () => {
    const s = newGame(1);
    const before = s.targetResolve;
    expect(flick(s).ok).toBe(true);
    expect(s.bands).toBe(TUNING.startBands - 1);
    expect(s.targetResolve).toBe(before - 1);
    expect(s.suspicion).toBeGreaterThan(0);
  });

  it('cannot flick while looking busy or without bands', () => {
    const s = newGame(1);
    setLookBusy(s, true);
    expect(flick(s).ok).toBe(false);
    setLookBusy(s, false);
    s.bands = 0;
    expect(flick(s).ok).toBe(false);
  });

  it('work pays salary and lowers suspicion', () => {
    const s = newGame(1);
    s.suspicion = 10;
    work(s);
    expect(s.salary).toBe(1);
    expect(s.suspicion).toBe(8.5);
  });

  it('weapons need salary', () => {
    const s = newGame(1);
    expect(buyWeapon(s, 'ruler').ok).toBe(false);
    s.salary = 15;
    expect(buyWeapon(s, 'ruler').ok).toBe(true);
    expect(s.weapon).toBe('ruler');
    expect(buyWeapon(s, 'repeater').ok).toBe(false); // stage 2 only
  });

  it('defeating Gary in all four positions starts Stage 2 with Gary as an ally', () => {
    const s = newGame(1);
    for (let i = 0; i < 4; i++) {
      s.bands = 100000;
      s.targetResolve = 0.5;
      s.nextFlickAt = 0;
      flick(s);
    }
    expect(s.stage).toBe(2);
    expect(s.allies.map((a) => a.id)).toEqual(['gary']);
    expect(s.desks).toBe(1);
    expect(TARGETS[s.targetIndex].id).toBe('brad');
  });

  it('recruiting costs salary and respects unlocks', () => {
    const s = newGame(1);
    s.salary = 1000;
    expect(recruit(s, 'kevin').ok).toBe(false); // Stage 1
    s.stage = 2;
    s.targetIndex = 4;
    expect(recruit(s, 'kevin').ok).toBe(true);
    expect(recruit(s, 'dave').ok).toBe(false); // needs the Printer Corner
  });
});

describe('suspicion', () => {
  it('getting caught costs 40% of bands and resets suspicion', () => {
    const s = newGame(1);
    s.bands = 100;
    addSuspicion(s, 120);
    expect(s.stats.caught).toBe(1);
    expect(s.bands).toBe(60);
    expect(s.suspicion).toBe(TUNING.caughtResetTo);
    expect(flick(s).ok).toBe(false);
  });

  it('a walk-by spots you unless you look busy', () => {
    const spotted = newGame(1);
    run(spotted, TUNING.firstWalkby + 4);
    expect(spotted.stats.walkbysSpotted).toBe(1);

    const hidden = newGame(1);
    setLookBusy(hidden, true);
    run(hidden, TUNING.firstWalkby + 4);
    expect(hidden.stats.hides).toBe(1);
  });

  it('cools down over time', () => {
    const s = newGame(1);
    s.suspicion = 50;
    run(s, 10);
    expect(s.suspicion).toBeLessThan(50);
  });
});

describe('saves', () => {
  it('round-trips through serialize and export', () => {
    const s = newGame(7);
    scrounge(s);
    run(s, 30);
    const back = deserialize(serialize(s));
    expect(back?.state.bands).toBeCloseTo(s.bands);
    const imported = importSave(exportSave(s));
    expect(imported?.state.time).toBeCloseTo(s.time);
  });

  it('rejects garbage without throwing', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"version":999,"state":{}}')).toBeNull();
    expect(importSave('%%%')).toBeNull();
  });

  it('is deterministic for the same seed and actions', () => {
    const a = playBot(STYLES[0], 900, 42);
    const b = playBot(STYLES[0], 900, 42);
    expect(serialize(a, 0)).toEqual(serialize(b, 0));
  });
});

describe('pacing (scripted bots)', () => {
  for (const style of STYLES) {
    it(`${style.name} bot finishes the slice with sane numbers`, () => {
      const s = playBot(style);
      const report = {
        style: style.name,
        stage1Min: s.stats.stage1At && +(s.stats.stage1At / 60).toFixed(1),
        stage2Min: s.stats.stage2At && +(s.stats.stage2At / 60).toFixed(1),
        caught: s.stats.caught,
        hides: s.stats.hides,
        spotted: s.stats.walkbysSpotted,
        allies: s.allies.length,
      };
      console.log(JSON.stringify(report));
      expect(Number.isFinite(s.bands) && s.bands >= 0).toBe(true);
      if (style.reactsToWalkbys) expect(s.stage).toBe(3);
      else expect(s.stats.caught).toBeGreaterThan(5); // ignoring Suspicion should hurt
    });
  }
});

describe('anti-spam', () => {
  it('ignores shots faster than the weapon reload', () => {
    const s = newGame(3);
    s.bands = 100;
    expect(flick(s).ok).toBe(true);
    expect(flick(s).ok).toBe(false); // same instant
    step(s, TUNING.stepSeconds);
    expect(flick(s).ok).toBe(true); // Finger Flick reloads in 0.1 s
    s.salary = 1000;
    buyWeapon(s, 'ruler');
    buyWeapon(s, 'clothespin');
    step(s, TUNING.stepSeconds);
    expect(flick(s).ok).toBe(true);
    step(s, TUNING.stepSeconds);
    expect(flick(s).ok).toBe(false); // Clothespin needs 0.2 s
    step(s, TUNING.stepSeconds);
    expect(flick(s).ok).toBe(true);
  });
});
