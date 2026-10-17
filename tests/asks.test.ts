import { describe, expect, it } from 'vitest';
import { ASKS, TUNING, WAR } from '../src/sim/content';
import { applyOffline, step } from '../src/sim/engine';
import { answerAsk, ASK_LIST, askById, describe as describeChoice } from '../src/sim/asks';
import { deserialize, serialize } from '../src/sim/save';
import { teamPerMin } from '../src/sim/staff';
import { newGame, type GameState } from '../src/sim/state';

function quiet(seed = 9): GameState {
  const s = newGame(seed);
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  return s;
}

function run(s: GameState, seconds: number) {
  for (let i = 0; i < Math.round(seconds / TUNING.stepSeconds); i++) {
    step(s, TUNING.stepSeconds);
    s.events.length = 0;
  }
}

/** A game with Adam's team hired, and a particular call waiting. */
function calling(id: string) {
  const s = quiet();
  s.career.rank = 9;
  s.staff = { temp: { seats: 2, level: 0, done: 0 }, receptionist: { seats: 1, level: 0, done: 0 }, bookkeeper: { seats: 1, level: 0, done: 0 }, analyst: { seats: 1, level: 0, done: 0 }, manager: { seats: 1, level: 0, done: 0 } };
  s.asks.current = { id, until: s.time + ASKS.seconds };
  s.salary = 100000;
  return s;
}

describe('team lead calls', () => {
  it('only start once you have a team, from the people you hired', () => {
    const s = quiet();
    run(s, 600);
    expect(s.asks.current).toBeNull();
    s.career.rank = 1;
    s.staff.temp = { seats: 1, level: 0, done: 0 };
    run(s, 0.2);
    expect(s.asks.nextAt).toBeCloseTo(s.time + ASKS.first, 0);
    run(s, ASKS.first + 0.2);
    expect(s.asks.current).not.toBeNull();
    expect(askById(s.asks.current!.id)!.team).toBe('temp');
    // It's in Adam's Messenger conversation too.
    const adam = s.chat.threads.find((t) => t.who === '@temp')!.msgs;
    expect(adam[adam.length - 1].text).toBe(askById(s.asks.current!.id)!.text);
  });

  it('every call has two choices that each do something, and says what', () => {
    const s = calling('inbox');
    for (const a of ASK_LIST) {
      expect(a.choices).toHaveLength(2);
      for (const c of a.choices) {
        expect(c.does.length).toBeGreaterThan(0);
        expect(describeChoice(s, a, c).length).toBe(c.does.length);
      }
    }
    expect(new Set(ASK_LIST.map((a) => a.id)).size).toBe(ASK_LIST.length);
  });

  it('answering applies the choice: a cost, Performance, a team speed-up', () => {
    let s = calling('muffins-coffee');
    const salary = s.salary;
    expect(answerAsk(s, 0).ok).toBe(true);
    expect(s.salary).toBeLessThan(salary);
    expect(s.asks.current).toBeNull();
    const msgs = s.chat.threads.find((t) => t.who === '@temp')!.msgs;
    expect(msgs[msgs.length - 1]).toMatchObject({ mine: true, text: 'Clean it up' });

    s = calling('inbox');
    const review = s.career.review;
    answerAsk(s, 1);
    expect(s.career.review).toBeGreaterThan(review);

    s = calling('headphones');
    const before = teamPerMin(s, 'temp');
    answerAsk(s, 0);
    expect(teamPerMin(s, 'temp')).toBeCloseTo(before * 1.3);
    run(s, 301);
    expect(teamPerMin(s, 'temp')).toBeCloseTo(before);
  });

  it('a cost never takes more than you have, and Suspicion never goes past the cap', () => {
    let s = calling('offsite');
    s.salary = 10;
    answerAsk(s, 0);
    expect(s.salary).toBe(0);
    s = calling('muffins-coffee');
    s.suspicion = 88;
    answerAsk(s, 1);
    expect(s.suspicion).toBe(ASKS.suspCap);
  });

  it('a nap pauses the team, then speeds it up', () => {
    const s = calling('nap');
    const before = teamPerMin(s, 'bookkeeper');
    answerAsk(s, 0);
    expect(teamPerMin(s, 'bookkeeper')).toBe(0);
    run(s, 91);
    expect(teamPerMin(s, 'bookkeeper')).toBeCloseTo(before * 1.6);
  });

  it('wait too long and they go with the safe choice', () => {
    const s = calling('feeney-hold');
    const next = s.walkby.nextAt;
    run(s, ASKS.seconds + 0.2);
    expect(s.asks.current).toBeNull();
    expect(s.walkby.nextAt).toBe(next + 60);
    expect(s.ticker[0].text).toContain('didn’t hear back');
  });

  it('Joey’s playdate counts as an ear scratch for Bailey', () => {
    const s = calling('playdate');
    answerAsk(s, 0);
    expect(s.office.scratches).toBe(1);
  });

  it('with the front desk watching, a raid is caught on the way in', () => {
    const s = calling('closet-watch');
    s.stage = 3;
    s.targetIndex = 7;
    s.war.fighting = 'it';
    s.targetResolve = 1000;
    answerAsk(s, 0);
    const bands = s.bands;
    s.war.closet.nextAt = s.time;
    run(s, 0.2);
    expect(s.war.closet.raid).toBeNull();
    expect(s.stats.raidsStopped).toBe(1);
    expect(s.bands).toBeGreaterThanOrEqual(bands + WAR.closet.dropMin);
  });

  it('Dale waits while someone is asking you something', () => {
    const s = calling('lunch');
    s.dale.nextDealAt = 0;
    s.stage = 2;
    run(s, 1);
    expect(s.dale.deal).toBeNull();
  });

  it('time away settles a waiting call quietly, and saves keep the speed-ups', () => {
    let s = calling('standup');
    applyOffline(s, 600);
    expect(s.asks.current).toBeNull();
    s = calling('lunch');
    answerAsk(s, 0);
    const back = deserialize(serialize(s))!.state;
    expect(back.asks.boosts).toHaveLength(1);
    expect(back.asks.nextAt).toBeCloseTo(s.asks.nextAt);
  });
});
