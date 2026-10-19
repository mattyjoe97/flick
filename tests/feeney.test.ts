import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { addSuspicion, step } from '../src/sim/engine';
import { SNOOP, enterOffice, inOffice, leaveOffice, nextRoundKnown, officeClosed, snoopBlocked, startSnoop } from '../src/sim/feeney';

function inStage2() {
  const s = newGame(11);
  s.stage = 2;
  s.salary = 1000;
  s.walkby.nextAt = 1e6;
  s.chaos.nextAt = 1e9;
  return s;
}
const run = (s: ReturnType<typeof newGame>, secs: number) => {
  for (let i = 0; i < Math.round(secs * 10); i++) step(s, 0.1);
};

describe("Mr. Feeney's office", () => {
  it('opens in Stage 2 (day one at later jobs), never while he is on his way', () => {
    const s = newGame(1);
    expect(officeClosed(s)).not.toBeNull();
    s.stage = 2;
    expect(officeClosed(s)).toBeNull();
    s.walkby.arrivesAt = s.time + 3;
    expect(enterOffice(s).ok).toBe(false);
  });

  it('searching his desk takes a few seconds and finds something, then nothing new for a while', () => {
    const s = inStage2();
    enterOffice(s);
    const before = { bands: s.bands, salary: s.salary, next: s.walkby.nextAt };
    expect(startSnoop(s, 'desk').ok).toBe(true);
    expect(startSnoop(s, 'calendar').ok).toBe(false); // one at a time
    run(s, SNOOP.seconds.desk - 0.5);
    expect(s.stats.snoops).toBe(0);
    run(s, 1);
    expect(s.stats.snoops).toBe(1);
    expect(s.bands > before.bands || s.salary > before.salary || s.walkby.nextAt > before.next).toBe(true);
    expect(snoopBlocked(s, 'desk')).toMatch(/Nothing new/);
  });

  it('his drawer gives back the bands he confiscated and your weapon', () => {
    const s = inStage2();
    s.bands = 1000;
    s.ownedWeapons.push('ruler');
    s.weapon = 'ruler';
    addSuspicion(s, 200); // caught
    expect(s.hr.writeUps).toBe(1);
    const taken = s.feeney.seized;
    expect(taken).toBeGreaterThan(0);
    expect(s.hr.confiscated).not.toBeNull();
    s.lookBusy = false;
    enterOffice(s);
    const bands = s.bands;
    startSnoop(s, 'drawer');
    run(s, SNOOP.seconds.drawer + 0.2);
    expect(s.bands).toBeGreaterThanOrEqual(bands + taken);
    expect(s.hr.confiscated).toBeNull();
    expect(snoopBlocked(s, 'drawer')).toMatch(/nothing of yours/);
  });

  it('his calendar tells you when his next round is', () => {
    const s = inStage2();
    enterOffice(s);
    expect(nextRoundKnown(s)).toBeNull();
    startSnoop(s, 'calendar');
    run(s, SNOOP.seconds.calendar + 0.2);
    expect(nextRoundKnown(s)).toBeCloseTo(s.walkby.nextAt - s.time);
  });

  it('if he comes back while you are in there, he catches you; slip out in time and you are at your computer', () => {
    const s = inStage2();
    enterOffice(s);
    s.walkby.nextAt = s.time;
    run(s, 0.2);
    expect(s.walkby.arrivesAt).not.toBeNull();
    expect(leaveOffice(s)).toBe('computer');

    const t = inStage2();
    enterOffice(t);
    t.walkby.nextAt = t.time;
    run(t, 15);
    expect(inOffice(t)).toBe(false);
    expect(t.stats.officeCaught).toBe(1);
    expect(t.hr.writeUps).toBe(1);
  });
});
