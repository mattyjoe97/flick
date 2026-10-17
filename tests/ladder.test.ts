import { describe, expect, it } from 'vitest';
import { EXEC_PERKS, JOB, LADDER, RENOVATIONS, STOCK, TUNING } from '../src/sim/content';
import { barrageSize, flick, step } from '../src/sim/engine';
import { buyExec, companyText, execCost, offers, repForRun, repForWork, startNewJob } from '../src/sim/job';
import { buyRenovation, buyStock, recordClose, renoCost, stockPrice, tierFloor, tierName, toughness } from '../src/sim/ladder';
import { mods } from '../src/sim/mods';
import { closeCase } from '../src/sim/politics';
import { deserialize, serialize } from '../src/sim/save';
import { newGame, type GameState } from '../src/sim/state';
import { basePay } from '../src/sim/work';

/** A game that has closed HR's case: the floor is yours and Job Search is open. */
function done(): GameState {
  const s = newGame(5);
  s.stage = 6;
  s.career.rank = 10;
  s.stats.bounties = 400000;
  s.job.unlocked = true;
  s.salary = 9e6;
  return s;
}

/** A quiet game in the Department War, with money to spend. */
function atWar(): GameState {
  const s = newGame(7);
  s.stage = 3;
  s.war.fighting = 'it';
  s.targetResolve = 1e9;
  s.salary = 5e6;
  s.bands = 1e6;
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  s.war.closet.nextAt = 1e9;
  return s;
}

function hit(s: GameState) {
  s.nextFlickAt = 0;
  s.flickLockUntil = 0;
  s.suspicion = 0;
  const before = s.targetResolve;
  flick(s, 1);
  return before - s.targetResolve;
}

describe('The career ladder', () => {
  it('names and floors: Regional Office, Head Office, Global HQ, then Global HQ II and up', () => {
    expect([0, 1, 2, 3, 4].map(tierName)).toEqual(['Regional Office', 'Head Office', 'Global HQ', 'Global HQ II', 'Global HQ III']);
    expect([0, 1, 2, 3].map(tierFloor)).toEqual([4, 12, 30, 30 + LADDER.floorsAfter]);
  });

  it('three closed cases at your top tier and the next one starts recruiting', () => {
    const s = done();
    for (let i = 1; i < LADDER.closes; i++) recordClose(s);
    expect(s.job.top).toBe(0);
    recordClose(s);
    expect(s.job.top).toBe(1);
    expect(s.inbox.some((m) => m.subject.includes('Head Office'))).toBe(true);
    expect(s.events.some((e) => e.type === 'climb')).toBe(true);
    // More closes at a lower tier don't skip a rung.
    recordClose(s);
    expect(s.job.top).toBe(1);
  });

  it('closing the case in Stage 5 counts toward the ladder', () => {
    const s = newGame(3);
    s.stage = 5;
    closeCase(s, 'goodwill');
    expect(s.job.closed[0]).toBe(1);
  });

  it('quitting for a higher tier: tougher everyone, better pay, more Reputation', () => {
    const s = done();
    s.job.top = 1;
    expect(offers(s, 1).map((c) => c.id)).toContain('pemberton'); // the same company's Head Office is a new office
    const work = repForWork(s);
    expect(startNewJob(s, 'pemberton', 1).ok).toBe(true);
    expect(s.job.tier).toBe(1);
    expect(s.job.history[0].tier).toBe(0);
    expect(toughness(s)).toBe(LADDER.toughness);
    // Same score, twice the Reputation.
    s.stage = 6;
    s.career.rank = 10;
    s.stats.bounties = 400000;
    expect(repForWork(s)).toBe(Math.floor(work * LADDER.rep));
    expect(s.inbox.some((m) => m.body.includes(`Floor ${tierFloor(1)}`))).toBe(true);
    // Can't jump past the top tier.
    expect(startNewJob(s, 'bank', 2).ok).toBe(false);
  });

  it('hits count for a quarter at Head Office (Resolve looks four times bigger instead)', () => {
    const a = atWar();
    const b = atWar();
    b.job.tier = 1;
    b.job.top = 1;
    expect(hit(b)).toBeCloseTo(hit(a) / LADDER.toughness, 6);
  });

  it('work pays more up the ladder', () => {
    const a = atWar();
    const b = atWar();
    b.job.tier = 2;
    expect(basePay(b, 'mail')).toBeCloseTo(basePay(a, 'mail') * LADDER.pay ** 2, 6);
  });

  it('the floor number follows the office in everything on screen', () => {
    expect(companyText('pemberton', 'Every desk on Floor 4. The 4th floor is yours.', 12)).toBe('Every desk on Floor 12. The 12th floor is yours.');
    expect(companyText('pemberton', 'The 4th floor', 31)).toBe('The 31st floor');
    expect(companyText('bank', 'Gary on Floor 4', 4)).toBe('Gordon on Floor 4');
  });

  it('saves keep the ladder; old saves count the cases they had already closed', () => {
    const s = done();
    s.job.top = 2;
    s.job.tier = 1;
    s.job.closed = [3, 3];
    const back = deserialize(serialize(s))!.state;
    expect(back.job).toMatchObject({ top: 2, tier: 1, closed: [3, 3] });

    const old = done();
    old.job.history = [
      { company: 'pemberton', minutes: 160, stage: 6, rep: 90 },
      { company: 'bank', minutes: 110, stage: 6, rep: 90 },
    ];
    const file = JSON.parse(serialize(old));
    file.version = 17;
    delete file.state.job.tier;
    delete file.state.job.top;
    delete file.state.job.closed;
    const migrated = deserialize(JSON.stringify(file))!.state;
    expect(migrated.job.closed).toEqual([3]);
    expect(migrated.job.top).toBe(1);
    expect(migrated.job.tier).toBe(0);
  });
});

describe('Renovations', () => {
  it('open with the Department War, cost more every level, and stay behind when you leave', () => {
    const s = atWar();
    s.stage = 2;
    expect(buyRenovation(s, 'window').ok).toBe(false);
    s.stage = 3;
    const first = renoCost(s, 'window')!;
    expect(buyRenovation(s, 'window').ok).toBe(true);
    expect(renoCost(s, 'window')).toBe(Math.round(first * RENOVATIONS[0].growth));
    expect(s.salary).toBe(5e6 - first);
    s.stage = 6;
    s.job.unlocked = true;
    startNewJob(s, 'bank');
    expect(s.renovations).toEqual({});
  });

  it('Window Office: bands hit harder', () => {
    const a = atWar();
    const b = atWar();
    buyRenovation(b, 'window');
    buyRenovation(b, 'window');
    expect(hit(b)).toBeCloseTo(hit(a) * 1.2, 6);
  });

  it('Standing Desks pay more, Acoustic Panels are quieter, and the panels stop at 10', () => {
    const s = atWar();
    s.salary = 1e12;
    const pay = basePay(s, 'mail');
    const noise = mods(s).allNoiseMult;
    buyRenovation(s, 'desks');
    expect(basePay(s, 'mail')).toBeCloseTo(pay * 1.1, 6);
    for (let i = 0; i < 12; i++) buyRenovation(s, 'panels');
    expect(s.renovations.panels).toBe(10);
    expect(mods(s).allNoiseMult).toBeCloseTo(noise * 0.96 ** 10, 6);
    expect(buyRenovation(s, 'panels').ok).toBe(false);
  });

  it('the Espresso Machine speeds up your team', () => {
    const s = atWar();
    s.staff.temp = { seats: 4, level: 0, done: 0 };
    const before = s.salary;
    step(s, 60);
    const plain = s.salary - before;
    const t = atWar();
    t.staff.temp = { seats: 4, level: 0, done: 0 };
    buyRenovation(t, 'espresso');
    const after = t.salary;
    step(t, 60);
    expect(t.salary - after).toBeGreaterThan(plain * 1.05);
    void TUNING;
  });
});

describe('Company stock', () => {
  it('only once you know you can leave, from the Department War on', () => {
    const s = atWar();
    expect(buyStock(s)).toBe(0);
    s.job.unlocked = true;
    expect(buyStock(s)).toBe(1);
  });

  it('each share costs more, and adds 1% to the Reputation the job earns', () => {
    const s = done();
    const work = repForWork(s);
    const p0 = stockPrice(s);
    expect(buyStock(s, 10)).toBe(10);
    expect(stockPrice(s)).toBe(Math.round(p0 * STOCK.growth ** 10));
    expect(repForRun(s)).toBe(work + Math.floor(work * 10 * STOCK.rep));
    expect(s.stats.shares).toBe(10);
    // Cashed in when you go: the next job starts with none.
    startNewJob(s, 'bank');
    expect(s.stock).toBe(0);
    expect(s.job.reputation).toBe(work + Math.floor(work * 0.1));
  });

  it('buys as many as you can afford', () => {
    const s = done();
    s.salary = STOCK.price * 2.5;
    expect(buyStock(s, 9999)).toBe(2);
    void JOB;
  });
});

describe('Executive perks', () => {
  it('open once Head Office is recruiting, have no top level, and cost more every time', () => {
    const s = done();
    s.job.reputation = 1e12;
    expect(buyExec(s, 'clout').ok).toBe(false);
    s.job.top = 1;
    const c0 = execCost(s, 'clout')!;
    for (let i = 0; i < 15; i++) expect(buyExec(s, 'clout').ok).toBe(true);
    expect(s.job.exec.clout).toBe(15);
    expect(execCost(s, 'clout')).toBe(Math.round(c0 * EXEC_PERKS[0].growth ** 15));
    // Kept when you change jobs.
    startNewJob(s, 'bank');
    expect(s.job.exec.clout).toBe(15);
  });

  it('Clout hits harder, Expense Account pays more, War Chest throws more, Long Lunches stop at 12', () => {
    const a = atWar();
    const b = atWar();
    b.job.top = 1;
    b.job.reputation = 1e9;
    buyExec(b, 'clout');
    buyExec(b, 'clout');
    expect(hit(b)).toBeCloseTo(hit(a) * 1.1, 6);
    const pay = basePay(b, 'mail');
    buyExec(b, 'expense');
    expect(basePay(b, 'mail')).toBeCloseTo(pay * 1.08, 6);
    const before = barrageSize(b);
    buyExec(b, 'warchest');
    expect(barrageSize(b)).toBe(Math.floor(before * 1.05));
    for (let i = 0; i < 14; i++) buyExec(b, 'lunch');
    expect(b.job.exec.lunch).toBe(12);
  });

  it('saves keep them', () => {
    const s = done();
    s.job.top = 1;
    s.job.exec = { clout: 7, lunch: 2 };
    expect(deserialize(serialize(s))!.state.job.exec).toEqual({ clout: 7, lunch: 2 });
  });
});

describe('Career ladder pacing (scripted bot)', () => {
  it('three jobs at the Regional Office, then Head Office is a long job again', async () => {
    const { runBot, STYLES } = await import('./bot');
    const style = { ...STYLES[0], war3: true, quit: true };
    const s = newGame(12345);
    runBot(s, style, 10 * 3600, (x) => x.job.runs >= 3);
    expect(s.job.top).toBe(1);
    expect(s.job.tier).toBe(1);
    runBot(s, style, 8 * 3600, (x) => x.job.runs >= 4);
    const h = s.job.history[s.job.history.length - 1];
    console.log(JSON.stringify({ jobs: s.job.history.map((x) => [x.tier ?? 0, x.minutes, x.rep]) }));
    expect(h.tier).toBe(1);
    expect(h.minutes).toBeGreaterThan(100);
    expect(h.minutes).toBeLessThan(240);
  }, 1800000);
});
