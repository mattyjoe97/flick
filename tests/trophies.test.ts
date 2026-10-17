import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/sim/content';
import { step } from '../src/sim/engine';
import { startNewJob } from '../src/sim/job';
import { deserialize, serialize } from '../src/sim/save';
import { newGame } from '../src/sim/state';
import { basePay } from '../src/sim/work';
import { TROPHIES, trophyCount, trophyDamageMult } from '../src/sim/trophies';

const tick = (s: ReturnType<typeof newGame>, secs = 1.1) => {
  for (let i = 0; i < Math.round(secs / TUNING.stepSeconds); i++) step(s, TUNING.stepSeconds);
};

describe('Trophies', () => {
  it('are won once, announced, and every one makes pay and damage a bit better', () => {
    const s = newGame(9);
    s.career.rank = 2;
    const pay = basePay(s, 'mail');
    s.stats.perfect = 50;
    tick(s);
    expect(s.job.trophies.perfect).toBe(0);
    expect(s.job.trophies.promoted).toBe(0);
    expect(trophyCount(s)).toBe(2);
    expect(basePay(s, 'mail')).toBeCloseTo(pay * 1.04);
    expect(trophyDamageMult(s)).toBeCloseTo(1.02);
    expect(s.events.filter((e) => e.type === 'trophy').length).toBe(2);
    s.events.length = 0;
    tick(s);
    expect(s.events.filter((e) => e.type === 'trophy').length).toBe(0);
  });

  it('stay with you when you quit for a new job, and survive a reload', () => {
    const s = newGame(9);
    s.stage = 6;
    s.job.unlocked = true;
    tick(s);
    expect(s.job.trophies.caseclosed).toBeDefined();
    startNewJob(s, 'bank');
    expect(s.job.trophies.caseclosed).toBeDefined();
    tick(s);
    expect(s.job.trophies.notice).toBe(1);
    const back = deserialize(serialize(s))!.state;
    expect(trophyCount(back)).toBe(trophyCount(s));
  });

  it('all have different ids', () => {
    expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(TROPHIES.length);
  });
});
