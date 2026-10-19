import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { flick, setLookBusy, step } from '../src/sim/engine';
import { FIGHTBACK, duck, paybackMult, stunned } from '../src/sim/fightback';
import { startChaos } from '../src/sim/chaos';

function fighting() {
  const s = newGame(5);
  s.walkby.nextAt = 1e9;
  s.chaos.nextAt = 1e9;
  s.weak.nextAt = 1e9;
  s.fightback.nextAt = 0;
  s.suspicion = 0;
  return s;
}
const run = (s: ReturnType<typeof newGame>, secs: number) => {
  for (let i = 0; i < Math.round(secs * 10); i++) step(s, 0.1);
};
/** Steps until something is thrown that isn't a paper airplane. */
function waitThrow(s: ReturnType<typeof newGame>) {
  for (let i = 0; i < 2000; i++) {
    step(s, 0.1);
    const inc = s.fightback.incoming;
    if (inc && inc.what !== 'plane') return inc;
    if (inc) s.fightback.incoming = null;
  }
  throw new Error('nothing thrown');
}

describe('Bosses fight back', () => {
  it('too slow: you see stars (no flicking) and a little noise', () => {
    const s = fighting();
    waitThrow(s);
    run(s, FIGHTBACK.windup + 0.2);
    expect(stunned(s)).toBe(true);
    expect(s.stats.thrownHit).toBe(1);
    expect(flick(s).ok).toBe(false);
    run(s, FIGHTBACK.stun);
    expect(stunned(s)).toBe(false);
  });

  it('duck in time: your next flick is Payback (×5 at the last moment)', () => {
    const s = fighting();
    waitThrow(s);
    expect(duck(s).ok).toBe(true);
    expect(paybackMult(s)).toBe(FIGHTBACK.payback);
    const t = fighting();
    waitThrow(t);
    run(t, FIGHTBACK.windup - 0.3);
    duck(t);
    expect(paybackMult(t)).toBe(FIGHTBACK.perfect);
    // It makes the next flick hit that much harder, then it's spent.
    const plain = fighting();
    const r0 = t.targetResolve;
    const p0 = plain.targetResolve;
    t.nextFlickAt = 0;
    flick(t);
    flick(plain);
    expect((r0 - t.targetResolve) / (p0 - plain.targetResolve)).toBeCloseTo(FIGHTBACK.perfect, 1);
    expect(paybackMult(t)).toBe(1);
  });

  it('nothing is thrown while you hide at your computer or in a Fire Drill, and hiding makes it miss', () => {
    const s = fighting();
    s.stage = 2;
    setLookBusy(s, true);
    run(s, 60);
    expect(s.fightback.incoming).toBeNull();
    setLookBusy(s, false);
    startChaos(s, 'drill');
    run(s, 30);
    expect(s.fightback.incoming).toBeNull();
    const t = fighting();
    waitThrow(t);
    setLookBusy(t, true);
    run(t, FIGHTBACK.windup + 0.2);
    expect(stunned(t)).toBe(false);
  });

  it('paper airplanes: catch them for bands and a Perfect Payback', () => {
    const s = fighting();
    for (let i = 0; i < 5000 && (s.fightback.incoming?.what as string | undefined) !== 'plane'; i++) {
      step(s, 0.1);
      if (s.fightback.incoming && s.fightback.incoming.what !== 'plane') duck(s);
    }
    expect(s.fightback.incoming?.what).toBe('plane');
    const bands = s.bands;
    expect(duck(s).ok).toBe(true);
    expect(s.bands).toBeGreaterThan(bands);
    expect(paybackMult(s)).toBe(FIGHTBACK.perfect);
  });
});
