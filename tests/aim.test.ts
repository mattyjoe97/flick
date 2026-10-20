import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { flick } from '../src/sim/engine';
import { CHARGE } from '../src/sim/content';

function ready() {
  const s = newGame(9);
  s.walkby.nextAt = 1e9;
  s.fightback.nextAt = 1e9;
  s.suspicion = 0;
  s.bands = 100;
  return s;
}

describe('Aiming', () => {
  it('a headshot hits twice as hard as the body', () => {
    const a = ready();
    const b = ready();
    const ra = a.targetResolve;
    const rb = b.targetResolve;
    flick(a, 1, false, 'head');
    flick(b, 1, false, 'body');
    expect((ra - a.targetResolve) / (rb - b.targetResolve)).toBeCloseTo(CHARGE.headshot);
    expect(a.stats.headshots).toBe(1);
  });

  it('a miss costs a band and makes noise, does no damage and breaks your chains', () => {
    const s = ready();
    s.perfectChain = 3;
    s.streak.n = 5;
    s.streak.lastAt = s.time;
    const r = s.targetResolve;
    expect(flick(s, 1, true, 'miss').ok).toBe(true);
    expect(s.targetResolve).toBe(r);
    expect(s.bands).toBe(99);
    expect(s.suspicion).toBeGreaterThan(0);
    expect(s.perfectChain).toBe(0);
    expect(s.streak.n).toBe(0);
    expect(s.stats.misses).toBe(1);
  });
});
