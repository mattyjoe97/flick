import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/sim/content';
import { flick, hitWeakSpot, setLookBusy, step } from '../src/sim/engine';
import { STREAK, WEAK, streakCount, streakMult } from '../src/sim/feel';
import { newGame, type GameState } from '../src/sim/state';

function atWar(): GameState {
  const s = newGame(71);
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
  s.safety = false;
  return s;
}

function run(s: GameState, seconds: number) {
  for (let i = 0; i < seconds / TUNING.stepSeconds; i++) {
    s.suspicion = 0;
    step(s, TUNING.stepSeconds);
  }
}

describe('Weak spots', () => {
  it('turn up while you fight, and leave after a few seconds', () => {
    const s = atWar();
    run(s, WEAK.first + 0.2);
    expect(s.weak.shown).not.toBeNull();
    run(s, WEAK.seconds + 0.2);
    expect(s.weak.shown).toBeNull();
    expect(s.weak.nextAt).toBeGreaterThan(s.time + WEAK.gap[0] - 1);
  });

  it('a hit lands five times as hard as a full-stretch flick, even mid-reload', () => {
    const s = atWar();
    s.nextFlickAt = 0;
    let before = s.targetResolve;
    flick(s, 1, false);
    const full = before - s.targetResolve;
    s.streak.n = 0;
    s.weak.shown = { x: 0.5, y: 0.3, until: s.time + 3 };
    before = s.targetResolve;
    expect(hitWeakSpot(s).ok).toBe(true);
    expect(before - s.targetResolve).toBeCloseTo(full * WEAK.mult, 3);
    expect(s.weak.shown).toBeNull();
    expect(s.stats.weakHits).toBe(1);
    expect(hitWeakSpot(s).ok).toBe(false);
  });

  it('never while you are at your computer', () => {
    const s = atWar();
    setLookBusy(s, true);
    run(s, WEAK.first + 5);
    expect(s.weak.shown).toBeNull();
  });
});

describe('Hot streak', () => {
  it('builds with every flick that lands, up to +30%, and cools off', () => {
    const s = atWar();
    for (let i = 0; i < 20; i++) {
      s.nextFlickAt = 0;
      flick(s, 0);
      run(s, 0.5);
    }
    expect(streakCount(s)).toBe(20);
    expect(streakMult(s)).toBeCloseTo(1 + STREAK.per * STREAK.max, 6);
    run(s, STREAK.gap + 0.5);
    expect(streakCount(s)).toBe(0);
    expect(s.stats.bestStreak).toBe(20);
  });

  it('going to your computer ends it', () => {
    const s = atWar();
    for (let i = 0; i < 5; i++) {
      s.nextFlickAt = 0;
      flick(s, 0);
      run(s, 0.5);
    }
    expect(streakCount(s)).toBe(5);
    setLookBusy(s, true);
    expect(streakCount(s)).toBe(0);
  });
});

describe('Best next buy', () => {
  it('quieter after a catch, harder-hitting in a fight', async () => {
    const { bestBuy } = await import('../src/sim/shop');
    const s = atWar();
    s.salary = 1e6;
    expect(bestBuy(s)?.why).toBe('damage');
    s.stats.caught = 1;
    s.lastCaughtAt = s.time;
    expect(bestBuy(s)?.why).toBe('quiet');
  });
});
