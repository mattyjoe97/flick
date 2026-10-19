import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { step, flick, setLookBusy } from '../src/sim/engine';
import { BREAK, breakClosed, breakForLoad, brewSeconds, buySnack, caffeinated, coffeeReload, coffeeWait, pourCoffee, shakeMachine, snackOn, snackPrice } from '../src/sim/breakroom';
import { buyPerk } from '../src/sim/job';

function stage2() {
  const s = newGame(7);
  s.stage = 2;
  s.salary = 1e6;
  return s;
}

describe('The Break Room', () => {
  it('opens in Stage 2 of your first job (day one after that), and the Coffee Club shuts it in Stage 4', () => {
    const s = newGame(1);
    expect(breakClosed(s)).toMatch(/more than a week/);
    s.job.runs = 1;
    expect(breakClosed(s)).toBeNull();
    s.stage = 4;
    expect(breakClosed(s)).toMatch(/Coffee Club/);
    s.war.rooms.breakroom.taken = true;
    expect(breakClosed(s)).toBeNull();
  });

  it('coffee: Caffeinated for a while, then the pot brews again (twice as fast once the room is yours)', () => {
    const s = stage2();
    expect(pourCoffee(s).ok).toBe(true);
    expect(caffeinated(s)).toBeCloseTo(BREAK.coffeeSeconds);
    expect(coffeeReload(s)).toBe(BREAK.reload);
    expect(pourCoffee(s).ok).toBe(false);
    expect(coffeeWait(s)).toBeCloseTo(BREAK.brewSeconds);
    s.stage = 5;
    expect(brewSeconds(s)).toBeCloseTo(BREAK.brewSeconds * BREAK.brewTaken);
    // Flicks reload faster while it lasts.
    const a = stage2();
    a.suspicion = 0;
    a.time = 100;
    flick(a);
    const slow = a.nextFlickAt - a.time;
    const b = stage2();
    b.suspicion = 0;
    b.time = 100;
    pourCoffee(b);
    flick(b);
    expect(b.nextFlickAt - b.time).toBeCloseTo(slow * BREAK.reload);
  });

  it('the vending machine sells random snacks (sometimes stuck: shake it loose, noisily)', () => {
    const s = stage2();
    let stuck = 0;
    for (let i = 0; i < 60; i++) {
      const before = s.salary;
      expect(buySnack(s).ok).toBe(true);
      expect(s.salary).toBe(before - snackPrice(s));
      if (s.breakroom.stuck) {
        stuck++;
        expect(snackOn(s) === null || s.breakroom.snack !== null).toBe(true);
        expect(buySnack(s).ok).toBe(false);
        let noise = 0;
        for (let k = 0; k < BREAK.shakes; k++) expect(shakeMachine(s, (n) => ((noise += n), true)).ok).toBe(true);
        expect(noise).toBe(BREAK.shakes * BREAK.shakeNoise);
        expect(s.breakroom.stuck).toBeNull();
      }
      expect(snackOn(s)).not.toBeNull();
    }
    expect(stuck).toBeGreaterThan(2);
    expect(stuck).toBeLessThan(25);
    // The safety catch can hold a shake.
    s.breakroom.stuck = { id: 'mints', shakes: 0 };
    expect(shakeMachine(s, () => false).ok).toBe(false);
    expect(s.breakroom.stuck.shakes).toBe(0);
  });

  it('the snacks do what they say, and run out', () => {
    const s = stage2();
    s.breakroom.snack = { id: 'pretzels', until: s.time + 10 };
    s.suspicion = 0;
    s.time = 0;
    const plain = stage2();
    plain.suspicion = 0;
    const r0 = s.targetResolve;
    flick(s);
    flick(plain);
    expect((r0 - s.targetResolve) / (plain.targetResolve === r0 ? 1 : r0 - plain.targetResolve)).toBeCloseTo(1.3, 2);
    setLookBusy(s, true);
    for (let i = 0; i < 200; i++) step(s, 0.1);
    expect(snackOn(s)).toBeNull();
  });

  it('corkboard perks make the coffee and snacks better', () => {
    const s = stage2();
    s.job.reputation = 1000;
    const price = snackPrice(s);
    expect(buyPerk(s, 'mug').ok).toBe(true);
    expect(buyPerk(s, 'beans').ok).toBe(true);
    expect(buyPerk(s, 'change').ok).toBe(true);
    pourCoffee(s);
    expect(caffeinated(s)).toBeCloseTo(BREAK.coffeeSeconds + BREAK.mug);
    expect(coffeeWait(s)).toBeCloseTo(BREAK.brewSeconds * BREAK.beans);
    expect(snackPrice(s)).toBe(Math.round(price * (1 - BREAK.change.price)));
  });

  it('saves: nonsense is cleaned up', () => {
    const b = breakForLoad({ coffeeAt: NaN, snack: { id: 'caviar' as never, until: 5 }, stuck: { id: 'mints', shakes: 99 } });
    expect(b.coffeeAt).toBe(0);
    expect(b.snack).toBeNull();
    expect(b.stuck!.shakes).toBe(BREAK.shakes - 1);
  });
});
