// How long the career takes: a bot that finishes the war and then keeps working, and a
// bot that checks in for ten minutes every hour. Both should take hours, not minutes.

import { describe, expect, it } from 'vitest';
import { PAY_GRADES } from '../src/sim/content';
import { applyOffline } from '../src/sim/engine';
import { staffPayPerMin } from '../src/sim/staff';
import { playBot, runBot, STYLES } from './bot';

const TOP = PAY_GRADES.length - 1;

describe('career pacing', () => {
  it('playing straight through, CEO takes a few hours', () => {
    const s = playBot(STYLES[0]);
    const atSlice = s.career.rank;
    runBot(s, STYLES[0], 8 * 3600, (x) => x.career.rank >= TOP);
    const hours = s.time / 3600;
    console.log(JSON.stringify({ atSlice, ceoHours: +hours.toFixed(2), teamPerMin: Math.round(staffPayPerMin(s)) }));
    expect(atSlice).toBeGreaterThanOrEqual(3);
    expect(s.career.rank).toBe(TOP);
    expect(hours).toBeGreaterThan(2.5);
    expect(hours).toBeLessThan(5);
  });

  it('checking in for ten minutes an hour, CEO takes most of a day', () => {
    const s = playBot(STYLES[0]);
    let wall = s.time;
    for (let i = 0; i < 40 && s.career.rank < TOP; i++) {
      runBot(s, STYLES[0], 600);
      applyOffline(s, 3000);
      wall += 3600;
    }
    console.log(JSON.stringify({ ceoWallHours: +(wall / 3600).toFixed(1) }));
    expect(s.career.rank).toBe(TOP);
    expect(wall / 3600).toBeGreaterThan(7);
    expect(wall / 3600).toBeLessThan(16);
  });
});
