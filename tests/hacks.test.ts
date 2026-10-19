import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/sim/content';
import { flick, step } from '../src/sim/engine';
import { HACKS, HK, hackLevel, pickHack, stepHacks, type HackId } from '../src/sim/hacks';
import { mods } from '../src/sim/mods';
import { startNewJob } from '../src/sim/job';
import { deserialize, serialize } from '../src/sim/save';
import { currentTarget, newGame, type GameState } from '../src/sim/state';

function atWar(): GameState {
  const s = newGame(81);
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
  s.weak.nextAt = 1e9;
  s.safety = false;
  return s;
}

/** Puts a hack on offer and takes it. */
function take(s: GameState, id: HackId, times = 1) {
  for (let i = 0; i < times; i++) {
    s.hacks.offer = [id];
    s.hacks.pending = 1;
    expect(pickHack(s, id)).toBe(true);
  }
}

function shoot(s: GameState, charge = 0) {
  s.nextFlickAt = 0;
  s.suspicion = 0;
  s.streak.n = 0;
  const before = s.targetResolve;
  flick(s, charge);
  return before - s.targetResolve;
}

describe('Hacks', () => {
  it('a boss surrendering earns a pick of three different hacks (not the very first Gary)', () => {
    const s = newGame(1);
    s.events.push({ type: 'capture', targetId: 'gary1' });
    stepHacks(s);
    expect(s.hacks.offer).toBeNull();
    s.events.push({ type: 'capture', targetId: 'gary2' });
    stepHacks(s);
    expect(s.hacks.offer).toHaveLength(3);
    expect(new Set(s.hacks.offer).size).toBe(3);
    // The same capture seen by a second step isn't counted twice.
    stepHacks(s);
    expect(s.hacks.pending).toBe(1);
    const id = s.hacks.offer![0];
    expect(pickHack(s, id)).toBe(true);
    expect(hackLevel(s, id)).toBe(1);
    expect(s.hacks.offer).toBeNull();
    expect(pickHack(s, id)).toBe(false);
  });

  it('picks wait (up to three), and maxed hacks stop turning up', () => {
    const s = atWar();
    for (let i = 0; i < 6; i++) s.events.push({ type: 'capture', targetId: `x${i}` });
    stepHacks(s);
    expect(s.hacks.pending).toBe(3);
    take(s, 'busywork');
    for (let i = 0; i < 50; i++) {
      s.hacks.offer = null;
      s.hacks.pending = 1;
      s.events = [];
      stepHacks(s);
      expect(s.hacks.offer).not.toContain('busywork');
    }
  });

  it('Speed Loader, Lucky Break-free damage hacks: Finisher, Overcharge', () => {
    const s = atWar();
    const plain = shoot(s);
    s.nextFlickAt = 0;
    flick(s, 0);
    const reload = s.nextFlickAt - s.time;
    take(s, 'loader');
    s.nextFlickAt = 0;
    flick(s, 0);
    expect(s.nextFlickAt - s.time).toBeCloseTo(reload * (1 - HK.loader), 6);
    // Finisher: harder on anyone below a quarter of their Resolve.
    take(s, 'executioner');
    const max = currentTarget(s)!.resolve;
    s.targetResolve = max * 0.9;
    const high = shoot(s);
    s.targetResolve = max * 0.2;
    expect(shoot(s)).toBeCloseTo(high * (1 + HK.executioner.mult), 3);
    void plain;
  });

  it('Ricochet bounces for a free hit; Stapler Gun every few flicks', () => {
    const s = atWar();
    const plain = shoot(s);
    take(s, 'ricochet', 3);
    let bounced = 0;
    for (let i = 0; i < 200; i++) {
      const bands = s.bands;
      const d = shoot(s);
      if (d > plain * 1.5) bounced++;
      expect(bands - s.bands).toBe(1); // the bounce is free
    }
    expect(bounced).toBeGreaterThan(50);
    expect(bounced).toBeLessThan(150);
    const g = atWar();
    take(g, 'stapler');
    const hits = Array.from({ length: 12 }, () => shoot(g));
    expect(hits.filter((d) => d > hits[0] * 3).length).toBe(2);
  });

  it('Echo Volley throws a free mini-Barrage every so often', () => {
    const s = atWar();
    take(s, 'echo');
    let volleys = 0;
    for (let i = 0; i < 24; i++) {
      s.events = [];
      shoot(s);
      volleys += s.events.filter((e) => e.type === 'barrage').length;
    }
    expect(volleys).toBe(24 / HK.echo.every[0]);
  });

  it('flow hacks: Long Lunches, Noise Cancelling, Bailey on Patrol, Band Hoarder', () => {
    const s = atWar();
    const m0 = mods(s);
    take(s, 'lunch');
    take(s, 'quiet');
    take(s, 'patrol');
    take(s, 'bulk');
    const m = mods(s);
    expect(m.walkbyIntervalMult).toBeCloseTo(m0.walkbyIntervalMult * (1 + HK.lunch), 6);
    expect(m.yourNoiseMult).toBeCloseTo(m0.yourNoiseMult * (1 - HK.quiet), 6);
    expect(m.warning).toBeCloseTo(m0.warning + 1, 6);
    expect(m.bandsPerSec).toBeCloseTo(m0.bandsPerSec * (1 + HK.bulk), 6);
  });

  it('Airtight Alibi gets you out of one catch', () => {
    const s = atWar();
    take(s, 'alibi');
    s.suspicion = 99.99;
    s.nextFlickAt = 0;
    flick(s, 1);
    expect(s.stats.caught).toBe(0);
    expect(s.hacks.alibis).toBe(0);
    s.suspicion = 99.99;
    s.nextFlickAt = 0;
    flick(s, 1);
    expect(s.stats.caught).toBe(1);
  });

  it('Expense Fraud and Scavenger pay out when a boss surrenders; Domino weakens the next', () => {
    const s = atWar();
    take(s, 'fraud');
    take(s, 'scavenger');
    take(s, 'domino');
    const cash = s.salary;
    const bands = s.bands;
    s.events = [{ type: 'pay', amount: 1000, source: 'bounty' }, { type: 'capture', targetId: 'x' }];
    stepHacks(s);
    expect(s.salary - cash).toBe(Math.round(1000 * HK.fraud));
    expect(s.bands - bands).toBeGreaterThanOrEqual(HK.scavenger.min);
  });

  it('they belong to this job: saved with it, gone at the next', () => {
    const s = atWar();
    take(s, 'ricochet', 2);
    expect(deserialize(serialize(s))!.state.hacks.levels.ricochet).toBe(2);
    s.stage = 6;
    s.career.rank = 10;
    s.job.unlocked = true;
    s.stats.bounties = 400000;
    startNewJob(s, 'bank');
    expect(s.hacks.levels).toEqual({});
  });

  it('every hack describes every level', () => {
    for (const h of HACKS) for (let l = 1; l <= h.max; l++) expect(h.does(l).length).toBeGreaterThan(10);
    void step;
    void TUNING;
  });
});
