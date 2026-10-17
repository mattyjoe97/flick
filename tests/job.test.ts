import { describe, expect, it } from 'vitest';
import { COMPANIES, JOB, PERKS, TARGETS } from '../src/sim/content';
import { addSuspicion, applyOffline, flick } from '../src/sim/engine';
import { buyPerk, canQuit, companyText, offers, perkCost, repForRun, startNewJob } from '../src/sim/job';
import { mods } from '../src/sim/mods';
import { deserialize, serialize } from '../src/sim/save';
import { seatCost } from '../src/sim/staff';
import { newGame, perk, type GameState } from '../src/sim/state';
import { basePay } from '../src/sim/work';

/** A game that has closed HR's case: the floor is yours and Job Search is open. */
function done(): GameState {
  const s = newGame(5);
  s.stage = 6;
  s.career.rank = 10;
  s.stats.bounties = 400000;
  s.job.unlocked = true;
  s.ball = { wound: 3000, found: true };
  s.names = { you: 'Matt' };
  s.office.scratches = 30;
  s.salary = 9e6;
  return s;
}

describe('The New Job restart', () => {
  it('Reputation comes from how far you got, how high you climbed and what you collected', () => {
    const s = done();
    expect(repForRun(s)).toBe(JOB.stageRep[6] + 10 * JOB.perRank + Math.floor(Math.sqrt(400)));
    s.stage = 2;
    expect(repForRun(s)).toBe(0);
  });

  it('you can only quit once a recruiter has called, and not in your first week', () => {
    const s = done();
    s.job.unlocked = false;
    expect(canQuit(s).ok).toBe(false);
    s.job.unlocked = true;
    s.stage = 2;
    expect(canQuit(s).ok).toBe(false);
    s.stage = 3;
    expect(canQuit(s).ok).toBe(true);
  });

  it('quitting starts you over at the new company, keeping what’s yours', () => {
    const s = done();
    const rep = repForRun(s);
    expect(startNewJob(s, 'bank').ok).toBe(true);
    expect(s.stage).toBe(1);
    expect(s.targetIndex).toBe(0);
    expect(s.salary).toBe(0);
    expect(s.career.rank).toBe(0);
    expect(s.job.company).toBe('bank');
    expect(s.job.runs).toBe(1);
    expect(s.job.reputation).toBe(rep);
    expect(s.job.history[0]).toMatchObject({ company: 'pemberton', stage: 6, rep });
    expect(s.ball.wound).toBe(3000);
    expect(s.names.you).toBe('Matt');
    expect(s.office.scratches).toBe(30);
    expect(s.inbox.some((m) => m.subject.includes('First Allied Bank'))).toBe(true);
    expect(offers(s).map((c) => c.id)).not.toContain('bank');
  });

  it('can’t quit to the company you’re already at', () => {
    const s = done();
    expect(startNewJob(s, 'pemberton').ok).toBe(false);
  });

  it('perks cost Reputation, get pricier and stop at their max', () => {
    const s = done();
    s.job.reputation = 1000;
    const first = perkCost(s, 'refs')!;
    expect(buyPerk(s, 'refs').ok).toBe(true);
    expect(perkCost(s, 'refs')!).toBeGreaterThan(first);
    for (let i = 0; i < 10; i++) buyPerk(s, 'refs');
    expect(perk(s, 'refs')).toBe(PERKS.find((p) => p.id === 'refs')!.max);
    expect(perkCost(s, 'refs')).toBeNull();
    s.job.reputation = 0;
    expect(buyPerk(s, 'hustle').ok).toBe(false);
  });

  it('day one comes with your perks: pay grade, a bonus, old friends', () => {
    const s = done();
    s.job.perks = { refs: 3, bonus: 2, friends: 1 };
    startNewJob(s, 'ledger');
    expect(s.career.rank).toBe(3);
    expect(s.salary).toBe(2 * JOB.bonus.salary);
    expect(s.bands).toBeGreaterThanOrEqual(2 * JOB.bonus.bands);
    expect(s.allies.map((a) => a.id)).toEqual(['kevin', 'marjorie']);
  });

  it('perks keep working: Hustle, Headhunter, Contacts, Seniority', () => {
    const s = newGame(3);
    s.career.rank = 4;
    const pay = basePay(s, 'mail');
    const seat = seatCost(s, 'temp');
    const price = mods(s).priceMult;
    s.job.perks = { hustle: 2, headhunter: 2, contacts: 3, seniority: 1 };
    expect(basePay(s, 'mail')).toBeCloseTo(pay * 1.4);
    expect(seatCost(s, 'temp')).toBe(Math.round(seat * 0.8));
    expect(mods(s).priceMult).toBeCloseTo(price * 0.7);
    s.stage = 2;
    s.targetIndex = 4;
    const r = applyOffline(s, 11 * 3600);
    expect(r).not.toBeNull();
  });

  it('each company has its own rules', () => {
    const s = newGame(3);
    s.career.rank = 4;
    const pay = basePay(s, 'mail');
    s.job.company = 'bank';
    expect(basePay(s, 'mail')).toBeCloseTo(pay * 1.4);
    s.suspicion = 0;
    addSuspicion(s, 10);
    expect(s.suspicion).toBeCloseTo(12.5);
    s.job.company = 'dialtone';
    s.career.rank = 1;
    expect(seatCost(s, 'temp')).toBe(Math.round(150 * 1.3));
  });

  it('every company has its own names for the same faces', () => {
    expect(companyText('pemberton', 'Gary flicks back.')).toBe('Gary flicks back.');
    expect(companyText('bank', 'Gary flicks back. Gary’s fan. Bradley stays.')).toBe('Gordon flicks back. Gordon’s fan. Bradley stays.');
    expect(companyText('ledger', 'Mr. Feeney says hi to Rick Dunham at Pemberton Solutions Group.')).toBe('Mr. Brennan says hi to Vince Calloway at The Daily Ledger.');
    for (const c of COMPANIES) for (const v of Object.values(c.names)) expect(Object.keys(c.names)).not.toContain(v);
  });

  it('the job record survives a reload, and old saves that closed the case can quit', () => {
    const s = done();
    s.job.perks = { hustle: 3 };
    s.job.reputation = 12;
    const back = deserialize(serialize(s))!.state;
    expect(back.job.perks.hustle).toBe(3);
    expect(back.job.reputation).toBe(12);
    const file = JSON.parse(serialize(s));
    file.version = 16;
    delete file.state.job;
    const old = deserialize(JSON.stringify(file))!.state;
    expect(old.job.unlocked).toBe(true);
    expect(old.job.company).toBe('pemberton');
  });

  it('Kevin and Marjorie don’t email asking to join if they came with you', () => {
    const s = done();
    s.job.perks = { friends: 1 };
    startNewJob(s, 'bank');
    s.stage = 1;
    s.targetIndex = TARGETS.findIndex((t) => t.id === 'gary4');
    s.targetResolve = 0.5;
    s.nextFlickAt = 0;
    flick(s, 1);
    expect(s.stage).toBe(2);
    expect(s.inbox.some((m) => m.from === 'Kevin')).toBe(false);
  });
});

describe('New Job pacing (scripted bot)', () => {
  it('the second job goes faster than the first, but is still a long one', async () => {
    const { playBot, runBot, STYLES } = await import('./bot');
    const style = { ...STYLES[0], war3: true, quit: true };
    const s = playBot(style, 8 * 3600, 12345, (x) => x.stage >= 6);
    const first = s.time / 60;
    runBot(s, style, 2, () => s.job.runs > 0);
    runBot(s, style, 8 * 3600, (x) => x.stage >= 6);
    const second = s.time / 60;
    console.log(JSON.stringify({ firstJobMin: Math.round(first), secondJobMin: Math.round(second), rep: s.job.earned, perks: s.job.perks }));
    expect(s.job.runs).toBe(1);
    expect(second).toBeLessThan(first * 0.9);
    expect(second).toBeGreaterThan(90);
  }, 1800000);
});
