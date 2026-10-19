import { describe, expect, it } from 'vitest';
import { BARRAGE, TUNING } from '../src/sim/content';
import { barrage, flick, step } from '../src/sim/engine';
import { startNewJob } from '../src/sim/job';
import { deserialize, serialize } from '../src/sim/save';
import { newGame, type GameState } from '../src/sim/state';

function atWar(): GameState {
  const s = newGame(61);
  s.stage = 2;
  s.targetIndex = 4;
  s.targetResolve = 1e9;
  s.bands = 1e6;
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.golden.nextAt = 1e9;
  s.chaos.nextAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  return s;
}

describe('The safety catch', () => {
  it('is on by default, and holds your flick rather than get you caught', () => {
    const s = atWar();
    expect(s.safety).toBe(true);
    s.suspicion = 99.9;
    const r = flick(s, 1);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toContain('Safety catch');
    expect(s.stats.caught).toBe(0);
    // Turned off: the same flick gets you caught.
    s.safety = false;
    expect(flick(s, 1).ok).toBe(true);
    expect(s.stats.caught).toBe(1);
  });

  it('a quiet shot still goes through while there is room', () => {
    const s = atWar();
    s.suspicion = 50;
    expect(flick(s, 0).ok).toBe(true);
  });

  it('Barrages and Shooters hold fire too', () => {
    const s = atWar();
    s.allies.push({ id: 'gary', role: 'shooter', rank: 0, timer: 0, served: 0 } as never);
    s.suspicion = 99.95;
    expect(barrage(s).ok).toBe(false);
    const shots = s.stats.shots;
    for (let i = 0; i < 20; i++) {
      s.suspicion = 99.95;
      step(s, TUNING.stepSeconds);
    }
    expect(s.stats.shots).toBe(shots);
    expect(s.stats.caught).toBe(0);
  });

  it('the setting stays with your save and your next job', () => {
    const s = atWar();
    s.safety = false;
    expect(deserialize(serialize(s))!.state.safety).toBe(false);
    s.stage = 6;
    s.career.rank = 10;
    s.job.unlocked = true;
    s.stats.bounties = 400000;
    expect(startNewJob(s, 'bank').ok).toBe(true);
    expect(s.safety).toBe(false);
  });
});

describe('Flicking reloads the Barrage', () => {
  it('every flick that lands takes its reload time off the Barrage (a Perfect one twice)', () => {
    const s = atWar();
    s.barrageAt = s.time + 90;
    s.nextFlickAt = 0;
    flick(s, 0);
    const reload = s.nextFlickAt - s.time;
    expect(s.barrageAt - s.time).toBeCloseTo(90 - reload * BARRAGE.flickRefill, 6);
    s.nextFlickAt = 0;
    flick(s, 1, true);
    expect(s.barrageAt - s.time).toBeCloseTo(90 - reload * BARRAGE.flickRefill * 3, 6);
  });
});
