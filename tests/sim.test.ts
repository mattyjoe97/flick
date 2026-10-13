import { describe, expect, it } from 'vitest';
import { PROMOTION, TARGETS, TUNING } from '../src/sim/content';
import { addSuspicion, buyBack, buyBackPrice, buyWeapon, flick, recruit, scrounge, setLookBusy, step, work } from '../src/sim/engine';
import { rolePower, weapon } from '../src/sim/mods';
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

describe('HR file', () => {
  /** A game in Stage 2 that has beaten Brad and owns the Clothespin Pistol. */
  function midStage2() {
    const s = newGame(3);
    s.stage = 2;
    s.targetIndex = TARGETS.findIndex((t) => t.id === 'printer');
    s.targetResolve = 3000;
    s.desks = 2; // Gary's desk + Brad's
    s.ownedWeapons = ['flick', 'ruler', 'clothespin'];
    s.weapon = 'clothespin';
    s.bands = 500;
    s.salary = 200;
    return s;
  }

  it('getting caught writes you up, takes your weapon and lets the target regroup', () => {
    const s = midStage2();
    addSuspicion(s, 200);
    expect(s.hr.writeUps).toBe(1);
    expect(s.hr.confiscated?.weapon).toBe('clothespin');
    expect(weapon(s).id).toBe('flick'); // you (and your Shooters) are back to the finger
    expect(buyWeapon(s, 'clothespin').ok).toBe(false); // can't re-equip it
    expect(s.targetResolve).toBe(3000 + 7000 * TUNING.regroupShare);
    expect(s.bands).toBe(300);
  });

  it('Lost and Found sells your weapon back, or it comes back on its own', () => {
    const a = midStage2();
    addSuspicion(a, 200);
    const price = buyBackPrice(a);
    expect(price).toBe(40); // half the Clothespin's $80
    expect(buyBack(a).ok).toBe(true);
    expect(a.salary).toBe(160);
    expect(weapon(a).id).toBe('clothespin');

    const b = midStage2();
    addSuspicion(b, 200);
    b.suspicion = 0;
    run(b, TUNING.confiscateSeconds + 1);
    expect(b.hr.confiscated).toBeNull();
    expect(weapon(b).id).toBe('clothespin');
  });

  it('write-ups fade after a stretch without being caught', () => {
    const s = midStage2();
    addSuspicion(s, 200);
    addSuspicion(s, 200);
    expect(s.hr.writeUps).toBe(2);
    s.suspicion = 0;
    run(s, TUNING.writeUpFade + 1);
    expect(s.hr.writeUps).toBe(1);
  });

  it('three write-ups is Final Warning; the next catch gets you fired', () => {
    const s = midStage2();
    for (let i = 0; i < 3; i++) addSuspicion(s, 200);
    expect(s.hr.writeUps).toBe(3);
    expect(s.stats.fired).toBe(0);
    addSuspicion(s, 200);
    expect(s.stats.fired).toBe(1);
    // Back to the start of Stage 2: Brad again, his desk handed back, a nearly empty drawer.
    expect(TARGETS[s.targetIndex].id).toBe('brad');
    expect(s.desks).toBe(1);
    expect(s.bands).toBe(TUNING.firedBands);
    expect(s.stage).toBe(2);
    // ...but a clean file, and you keep your weapons.
    expect(s.hr.writeUps).toBe(0);
    expect(s.hr.confiscated).toBeNull();
    expect(s.ownedWeapons).toContain('clothespin');
  });

  it('coworkers get promoted for time served, and get better at their job', () => {
    const s = midStage2();
    s.allies = [{ id: 'marjorie', role: 'lookout', timer: 0, served: 0, rank: 0 }];
    const before = rolePower(s, 'lookout');
    s.suspicion = 0;
    setLookBusy(s, true); // stay out of trouble while time passes
    run(s, PROMOTION.after[0] + 1);
    expect(s.allies[0].rank).toBe(1);
    expect(rolePower(s, 'lookout')).toBeCloseTo(before * PROMOTION.bonus[1]);
    run(s, PROMOTION.after[1] - PROMOTION.after[0]);
    expect(s.allies[0].rank).toBe(2);
    expect(s.stats.promotions).toBe(2);
  });

  it('old saves get a clean HR file and new hires', () => {
    const s = midStage2();
    s.allies = [{ id: 'gary', role: 'shooter', timer: 0, served: 0, rank: 0 }];
    const file = JSON.parse(serialize(s));
    file.version = 1;
    delete file.state.hr;
    delete file.state.allies[0].served;
    delete file.state.allies[0].rank;
    const back = deserialize(JSON.stringify(file));
    expect(back?.state.hr.writeUps).toBe(0);
    expect(back?.state.allies[0].rank).toBe(0);
    expect(back?.state.allies[0].served).toBe(0);
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
        fired: s.stats.fired,
        hides: s.stats.hides,
        spotted: s.stats.walkbysSpotted,
        allies: s.allies.length,
      };
      console.log(JSON.stringify(report));
      expect(Number.isFinite(s.bands) && s.bands >= 0).toBe(true);
      if (style.reactsToWalkbys) expect(s.stage).toBe(3);
      else expect(s.stats.caught + s.stats.fired).toBeGreaterThan(5); // ignoring Suspicion should hurt
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

describe('spreadsheet mini-game', () => {
  it('flags cells while hidden and pays more with a streak', async () => {
    const { fixCell } = await import('../src/sim/minigame');
    const s = newGame(9);
    setLookBusy(s, true);
    run(s, 1);
    expect(s.sheet.flags.length).toBeGreaterThan(0);
    const f1 = s.sheet.flags[0];
    const r1 = fixCell(s, f1.row, f1.col);
    expect(r1.ok).toBe(true);
    run(s, 1.2);
    const f2 = s.sheet.flags[0];
    const r2 = fixCell(s, f2.row, f2.col);
    expect(r2.ok && r1.ok && r2.pay > r1.pay).toBe(true);
    expect(s.sheet.streak).toBe(2);
  });

  it('a wrong cell or an expired flag breaks the streak', async () => {
    const { fixCell } = await import('../src/sim/minigame');
    const s = newGame(9);
    setLookBusy(s, true);
    run(s, 1);
    const f = s.sheet.flags[0];
    fixCell(s, f.row, f.col);
    expect(s.sheet.streak).toBe(1);
    // A label-free cell that can't be flagged (derived YoY column) is always "fine".
    expect(fixCell(s, 0, 4).ok).toBe(false);
    expect(s.sheet.streak).toBe(0);
    run(s, 1);
    const g = s.sheet.flags[0];
    fixCell(s, g.row, g.col);
    expect(s.sheet.streak).toBe(1);
    run(s, 8); // flags expire
    expect(s.sheet.streak).toBe(0);
  });

  it('extra tabs unlock with progress', async () => {
    const { setSheetTab } = await import('../src/sim/minigame');
    const s = newGame(9);
    expect(setSheetTab(s, 'budget')).toBe(false);
    s.stage = 2;
    s.targetIndex = 4;
    expect(setSheetTab(s, 'budget')).toBe(true);
    expect(setSheetTab(s, 'headcount')).toBe(false);
    s.targetIndex = 6;
    expect(setSheetTab(s, 'headcount')).toBe(true);
  });
});

describe('hold to charge', () => {
  it('a full stretch hits much harder from one band, and a Perfect harder still', async () => {
    const s = newGame(5);
    s.bands = 10;
    s.targetIndex = 3; // Gary behind the fan: lots of Resolve
    s.targetResolve = 1600;
    const before = s.targetResolve;
    flick(s, 0);
    const tap = before - s.targetResolve;
    step(s, TUNING.stepSeconds);
    const mid = s.targetResolve;
    flick(s, 1, false);
    const full = mid - s.targetResolve;
    step(s, TUNING.stepSeconds);
    const mid2 = s.targetResolve;
    flick(s, 1, true);
    const perfect = mid2 - s.targetResolve;
    expect(full / tap).toBeCloseTo(5);
    expect(perfect / tap).toBeCloseTo(6);
    expect(s.bands).toBe(7); // three shots, three bands
    expect(s.stats.perfect).toBe(1);
  });

  it('holding too long snaps the band', async () => {
    const { snapBand } = await import('../src/sim/engine');
    const s = newGame(5);
    snapBand(s);
    expect(s.bands).toBe(TUNING.startBands - 1);
    expect(s.stats.snapped).toBe(1);
    expect(s.suspicion).toBeGreaterThan(0);
  });
});
