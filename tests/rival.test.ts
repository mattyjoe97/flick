import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/sim/content';
import { step } from '../src/sim/engine';
import { repForRun, repForWork, startNewJob } from '../src/sim/job';
import { closeCase } from '../src/sim/politics';
import { RIVAL, rivalStage, rivalTarget, stepRival } from '../src/sim/rival';
import { deserialize, serialize } from '../src/sim/save';
import { newGame, type GameState } from '../src/sim/state';

/** Case closed at `minutes`: Job Search open, ready to quit. */
function closedAt(minutes: number): GameState {
  const s = newGame(41);
  s.time = minutes * 60;
  s.stage = 5;
  s.career.rank = 10;
  s.stats.bounties = 400000;
  closeCase(s, 'fight');
  s.job.unlocked = true;
  return s;
}

describe('Chad, your rival', () => {
  it('not on your first job; your case time is remembered', () => {
    const s = closedAt(170);
    expect(s.rival.race).toBeNull();
    expect(s.rival.best[0]).toBe(170 * 60);
  });

  it('turns up on your second job, a bit faster than your best at that rung', () => {
    const s = closedAt(170);
    expect(startNewJob(s, 'bank').ok).toBe(true);
    expect(s.rival.met).toBe(true);
    expect(s.rival.race?.company).not.toBe('bank');
    expect(s.rival.race?.target).toBe(Math.round(170 * RIVAL.beat) * 60);
    expect(s.inbox.some((m) => m.from === RIVAL.name)).toBe(true);
    // A new rung: a long first job there, so a generous time.
    const t = closedAt(170);
    t.job.top = 1;
    startNewJob(t, 'pemberton', 1);
    expect(t.rival.race?.target).toBe(RIVAL.fresh[1] * 60);
  });

  it('he moves through the stages as his clock runs, and wins if he gets there first', () => {
    const s = closedAt(100);
    startNewJob(s, 'bank');
    const target = s.rival.race!.target;
    expect(rivalStage(s)).toBe(1);
    s.time = target * 0.5;
    stepRival(s);
    expect(rivalStage(s)).toBe(3);
    expect(s.rival.race!.stage).toBe(3);
    s.time = target;
    stepRival(s);
    expect(s.rival.race!.result).toBe('lost');
    expect(s.rival.losses).toBe(1);
    // No bonus for a lost race.
    s.stage = 5;
    s.career.rank = 10;
    closeCase(s, 'fight');
    expect(s.rival.race!.result).toBe('lost');
    expect(repForRun(s)).toBe(repForWork(s));
  });

  it('close the case first: a Reputation bonus when you leave, and your best time improves', () => {
    const s = closedAt(100);
    startNewJob(s, 'bank');
    s.time = 60 * 60;
    s.stage = 5;
    s.career.rank = 10;
    s.stats.bounties = 400000;
    closeCase(s, 'fight');
    expect(s.rival.race!.result).toBe('won');
    expect(s.rival.wins).toBe(1);
    expect(repForRun(s)).toBe(repForWork(s) + Math.floor(repForWork(s) * RIVAL.rep));
    expect(s.rival.best[0]).toBe(60 * 60);
    // The next race at this rung is tighter.
    expect(rivalTarget(s, 0)).toBe(Math.max(RIVAL.minMinutes, Math.round(60 * RIVAL.beat)) * 60);
  });

  it('the sim runs him on its own clock', () => {
    const s = closedAt(50);
    startNewJob(s, 'bank');
    s.walkby.nextAt = 1e9;
    for (let i = 0; i < (s.rival.race!.target + 5) / TUNING.stepSeconds; i++) step(s, TUNING.stepSeconds);
    expect(s.rival.race!.result).toBe('lost');
  }, 60000);

  it('saves keep him; an old save mid-job gets him if there is time to win', () => {
    const s = closedAt(170);
    startNewJob(s, 'bank');
    const back = deserialize(serialize(s))!.state;
    expect(back.rival.race?.company).toBe(s.rival.race!.company);
    const file = JSON.parse(serialize(s));
    delete file.state.rival;
    file.state.time = 60;
    const old = deserialize(JSON.stringify(file))!.state;
    expect(old.rival.race).not.toBeNull();
    file.state.time = 1e6;
    expect(deserialize(JSON.stringify(file))!.state.rival.race).toBeNull();
  });
});
