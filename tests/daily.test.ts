import { describe, expect, it } from 'vitest';
import { step } from '../src/sim/engine';
import { CHALLENGES, DAILY, dayBefore, fullDayRep, newDay, stepDaily } from '../src/sim/daily';
import { startNewJob } from '../src/sim/job';
import { deserialize, serialize } from '../src/sim/save';
import { newGame, type GameState } from '../src/sim/state';

function quiet(): GameState {
  const s = newGame(31);
  s.stage = 2;
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  s.golden.nextAt = 1e9;
  return s;
}

/** Does today's challenge number `i` (bumps its counter all the way). */
function finish(s: GameState, i: number) {
  const c = CHALLENGES.find((x) => x.id === s.daily.list[i].id)!;
  (s.stats[c.stat] as number) = ((s.stats[c.stat] as number) ?? 0) + c.target;
  stepDaily(s);
}

function finishAll(s: GameState) {
  for (let i = 0; i < DAILY.count; i++) finish(s, i);
}

describe('Corporate Challenges', () => {
  it('three different ones a day, the same three however often you reload, new ones tomorrow', () => {
    const s = quiet();
    expect(newDay(s, '2026-10-18')).toBe(true);
    const ids = s.daily.list.map((g) => g.id);
    expect(new Set(ids).size).toBe(3);
    expect(newDay(s, '2026-10-18')).toBe(false);
    const t = quiet();
    newDay(t, '2026-10-18');
    expect(t.daily.list.map((g) => g.id)).toEqual(ids);
    const days = new Set<string>();
    for (let d = 10; d < 30; d++) {
      newDay(t, `2026-11-${d}`);
      days.add(t.daily.list.map((g) => g.id).join());
    }
    expect(days.size).toBeGreaterThan(10);
  });

  it('not on your very first day until Stage 2, and Corporate emails them', () => {
    const s = newGame(1);
    expect(newDay(s, '2026-10-18')).toBe(false);
    s.stage = 2;
    expect(newDay(s, '2026-10-18')).toBe(true);
    expect(s.inbox[0].from).toBe('Corporate');
  });

  it('only things that happen after they are posted count', () => {
    const s = quiet();
    s.stats.pets = 50;
    s.stats.perfect = 50;
    s.stats.hides = 50;
    newDay(s, '2026-10-18');
    stepDaily(s);
    expect(s.daily.list.every((g) => g.done === 0)).toBe(true);
  });

  it('each one done pays straight away; all three pay Reputation', () => {
    const s = quiet();
    newDay(s, '2026-10-18');
    const cash = s.salary;
    finish(s, 0);
    expect(s.salary).toBeGreaterThan(cash);
    expect(s.daily.list[0].paid).toBe(true);
    expect(s.events.some((e) => e.type === 'dailyDone')).toBe(true);
    // Doing more of it doesn't pay twice.
    const after = s.salary;
    finish(s, 0);
    expect(s.salary).toBe(after);
    const rep = s.job.reputation;
    finish(s, 1);
    finish(s, 2);
    expect(s.job.reputation).toBe(rep + DAILY.repMin);
    expect(s.daily.streak).toBe(1);
    expect(s.events.some((e) => e.type === 'dailyAll')).toBe(true);
  });

  it('days in a row pay more (up to a week); miss a day and the streak starts over', () => {
    const s = quiet();
    s.job.earned = 1000; // 1% = 10 a day
    let day = '2026-10-01';
    const paid: number[] = [];
    for (let i = 0; i < 9; i++) {
      newDay(s, day);
      const rep = s.job.reputation;
      finishAll(s);
      paid.push(s.job.reputation - rep);
      s.job.earned = 1000;
      day = dayBefore(day).replace(/.*/, () => {
        const t = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000);
        return t.toISOString().slice(0, 10);
      });
    }
    expect(paid.slice(0, 3)).toEqual([10, 20, 30]);
    expect(paid[7]).toBe(10 * DAILY.streakCap);
    expect(s.daily.streak).toBe(9);
    // Skip a day: back to one.
    newDay(s, '2026-10-12');
    expect(s.daily.streak).toBe(0);
    expect(fullDayRep(s)).toBe(10);
  });

  it('they come with you to a new job, and the new job counts from zero', () => {
    const s = quiet();
    s.stage = 6;
    s.career.rank = 10;
    s.job.unlocked = true;
    s.stats.bounties = 400000;
    newDay(s, '2026-10-18');
    const c = CHALLENGES.find((x) => x.id === s.daily.list[0].id)!;
    (s.stats[c.stat] as number) = ((s.stats[c.stat] as number) ?? 0) + 1;
    stepDaily(s);
    expect(s.daily.list[0].done).toBe(1);
    expect(startNewJob(s, 'bank').ok).toBe(true);
    expect(s.daily.day).toBe('2026-10-18');
    expect(s.daily.list[0].done).toBe(1);
    (s.stats[c.stat] as number) = 2;
    step(s, 0.1);
    expect(s.daily.list[0].done).toBe(Math.min(c.target, 3));
  });

  it('saves keep them', () => {
    const s = quiet();
    newDay(s, '2026-10-18');
    finish(s, 0);
    const back = deserialize(serialize(s))!.state;
    expect(back.daily.day).toBe('2026-10-18');
    expect(back.daily.list[0].paid).toBe(true);
    expect(back.daily.total).toBe(1);
  });
});
