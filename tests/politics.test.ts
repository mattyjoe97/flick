import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, HR_DIRECTOR, MEMOS, POLITICS, ROOMS, TARGETS, TUNING, WEAPONS } from '../src/sim/content';
import { addSuspicion, applyOffline, barrage, flick, step } from '../src/sim/engine';
import { mods } from '../src/sim/mods';
import { coach, memoCooldown, sendMemo } from '../src/sim/politics';
import { deserialize, serialize } from '../src/sim/save';
import { seatCost, teamPerMin } from '../src/sim/staff';
import { currentTarget, deptPerk, newAlly, newGame, type GameState } from '../src/sim/state';
import { fight } from '../src/sim/war';
import { finishRound, startRound } from '../src/sim/work';

/** A game that has just taken the whole floor: Stage 5, facing HR. */
function atHr(): GameState {
  const s = newGame(21);
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  s.asks.nextAt = 1e9;
  s.stage = 2;
  s.targetIndex = TARGETS.length - 1;
  s.bands = 100000;
  s.salary = 1e6;
  win(s);
  for (const d of DEPARTMENTS) {
    fight(s, d.dept);
    win(s);
  }
  s.war.counter.nextAt = 1e9;
  for (const _ of ROOMS) {
    s.war.rooms[s.war.fighting as 'breakroom' | 'conference'].wall = 0;
    win(s);
  }
  s.war.politics.nextInterviewAt = 1e9;
  return s;
}

function hit(s: GameState, charge = 1) {
  s.nextFlickAt = 0;
  s.flickLockUntil = 0;
  s.suspicion = 0;
  return flick(s, charge);
}

function win(s: GameState) {
  s.targetResolve = 0.5;
  hit(s);
}

function run(s: GameState, seconds: number) {
  for (let i = 0; i < Math.round(seconds / TUNING.stepSeconds); i++) {
    step(s, TUNING.stepSeconds);
    s.events.length = 0;
  }
}

describe('Stage 5: HR opens an investigation', () => {
  it('taking both rooms starts Stage 5 facing the HR Director', () => {
    const s = atHr();
    expect(s.stage).toBe(5);
    expect(currentTarget(s)?.id).toBe('hr');
    expect(s.targetResolve).toBe(HR_DIRECTOR.resolve);
    expect(s.inbox.some((m) => m.from === HR_DIRECTOR.intro.from)).toBe(true);
  });

  it('shots at HR are twice as loud, and some of the noise goes in the case file', () => {
    const s = atHr();
    hit(s, 0);
    const atHrNoise = s.suspicion;
    const ev = s.war.politics.evidence;
    expect(ev).toBeGreaterThan(0);
    fight(s, 'rematch');
    hit(s, 0);
    expect(s.suspicion).toBeCloseTo(atHrNoise / POLITICS.hrNoise);
    expect(s.war.politics.evidence).toBe(ev);
  });

  it('getting caught puts a quarter of a case file in it', () => {
    const s = atHr();
    addSuspicion(s, 200);
    expect(s.war.politics.evidence).toBe(POLITICS.evidence.caught);
  });
});

describe('Stage 5: Plausible Deniability and memos', () => {
  it('real work earns Deniability: your rounds by grade, Cover teammates and your teams', () => {
    const s = atHr();
    s.work.mailWaiting = 5;
    const r = startRound(s, 'mail')!;
    r.done = r.items;
    r.right = r.items;
    r.used = 0;
    finishRound(s, 'mail');
    expect(s.war.politics.pd).toBeCloseTo(POLITICS.pd.grade.A);
    s.allies.push(newAlly('steve', 'cover'));
    s.staff.temp = { seats: 1, level: 0, done: 0 };
    const before = s.war.politics.pd;
    run(s, 60);
    expect(s.war.politics.pd - before).toBeCloseTo(2 * POLITICS.pd.coverPerMin + POLITICS.pd.teamPerMin, 1);
  });

  it('a memo costs Deniability, has a cooldown, and adds goodwill', () => {
    const s = atHr();
    expect(sendMemo(s, 'teambuilding').ok).toBe(false);
    s.war.politics.pd = 20;
    expect(sendMemo(s, 'teambuilding').ok).toBe(true);
    expect(s.war.politics.pd).toBe(12);
    expect(s.war.politics.goodwill).toBe(8);
    expect(sendMemo(s, 'teambuilding').ok).toBe(false);
    expect(memoCooldown(s, 'teambuilding')).toBeGreaterThan(0);
  });

  it('Team-Building: no noise. Open-Plan: harder and louder', () => {
    const s = atHr();
    s.war.politics.pd = 100;
    sendMemo(s, 'teambuilding');
    hit(s, 0);
    expect(s.suspicion).toBe(0);
    s.barrageAt = 0;
    s.allies.push(newAlly('gary', 'shooter'));
    barrage(s);
    expect(s.suspicion).toBe(0);
    run(s, 121);
    const r = s.targetResolve;
    hit(s, 0);
    const plain = r - s.targetResolve;
    sendMemo(s, 'openplan');
    s.targetResolve = r;
    hit(s, 0);
    expect(r - s.targetResolve).toBeCloseTo(plain * POLITICS.openPlan.damage);
  });

  it('Synergy speeds the team up; Casual Friday halves hiring', () => {
    const s = atHr();
    s.career.rank = 5;
    s.staff.temp = { seats: 1, level: 0, done: 0 };
    s.war.politics.pd = 100;
    const team = teamPerMin(s, 'temp', true);
    const seat = seatCost(s, 'temp');
    sendMemo(s, 'synergy');
    sendMemo(s, 'casual');
    expect(teamPerMin(s, 'temp', true)).toBeCloseTo(team * POLITICS.synergyTeam);
    expect(Math.abs(seatCost(s, 'temp') - seat * POLITICS.casualPrice)).toBeLessThanOrEqual(1);
  });

  it('Document Retention shreds evidence', () => {
    const s = atHr();
    s.war.politics.evidence = 40;
    s.war.politics.pd = 100;
    sendMemo(s, 'retention');
    expect(s.war.politics.evidence).toBe(40 - POLITICS.evidence.retention);
  });

  it('enough memos win HR over: the case closes without a fight', () => {
    const s = atHr();
    s.war.politics.goodwill = POLITICS.goodwill - 5;
    s.war.politics.pd = 100;
    sendMemo(s, 'casual');
    expect(s.stage).toBe(6);
    expect(s.war.fighting).toBe('rematch');
  });
});

describe('Stage 5: the case file and interviews', () => {
  it('a full case file costs you a department until you win it back', () => {
    const s = atHr();
    s.war.politics.evidence = 99;
    addSuspicion(s, 200);
    const seized = DEPARTMENTS.find((d) => s.war.depts[d.dept].seized)!;
    expect(seized).toBeDefined();
    expect(deptPerk(s, seized.dept)).toBe(false);
    expect(s.war.politics.evidence).toBe(POLITICS.evidence.after);
    expect(fight(s, seized.dept).ok).toBe(true);
    expect(currentTarget(s)?.resolve).toBe(seized.resolve * POLITICS.reclaim);
    win(s);
    expect(deptPerk(s, seized.dept)).toBe(true);
    expect(s.war.fighting).toBe('hr');
    expect(fight(s, seized.dept).ok).toBe(false);
  });

  it('an interview you miss adds evidence; one you coach does not', () => {
    const s = atHr();
    s.war.politics.nextInterviewAt = s.time;
    run(s, 0.2);
    expect(s.war.politics.interview).not.toBeNull();
    expect(coach(s).ok).toBe(true);
    expect(s.war.politics.evidence).toBeLessThan(1);
    s.war.politics.nextInterviewAt = s.time;
    run(s, 0.2);
    run(s, POLITICS.interview.seconds + 0.2);
    expect(s.war.politics.evidence).toBeGreaterThan(POLITICS.evidence.interview - 1);
    expect(s.stats.interviewsLost).toBe(1);
  });

  it('nothing happens while you’re away, but your team keeps earning Deniability', () => {
    const s = atHr();
    s.staff.temp = { seats: 1, level: 0, done: 0 };
    s.war.politics.nextInterviewAt = s.time;
    run(s, 0.2);
    applyOffline(s, 600);
    expect(s.war.politics.interview).toBeNull();
    expect(s.war.politics.pd).toBeGreaterThan(4);
  });
});

describe('Stage 5: closing the case', () => {
  it('flicking Fisk to nothing closes the case: the floor is yours (Stage 6)', () => {
    const s = atHr();
    s.war.politics.evidence = 99;
    addSuspicion(s, 200);
    s.hr.writeUps = 0;
    fight(s, 'hr');
    const salary = s.salary;
    win(s);
    expect(s.stage).toBe(6);
    expect(s.salary).toBeGreaterThan(salary);
    expect(DEPARTMENTS.every((d) => !s.war.depts[d.dept].seized)).toBe(true);
    expect(fight(s, 'hr').ok).toBe(false);
    expect(currentTarget(s)).toBeDefined();
  });

  it('switching away keeps what you did to him', () => {
    const s = atHr();
    s.targetResolve = HR_DIRECTOR.resolve / 2;
    fight(s, 'rematch');
    fight(s, 'hr');
    expect(s.targetResolve).toBeCloseTo(HR_DIRECTOR.resolve / 2);
  });
});

describe('Stage 5 saves', () => {
  it('round-trips mid-investigation', () => {
    const s = atHr();
    s.war.politics.pd = 33;
    s.war.politics.evidence = 42;
    s.war.politics.goodwill = 17;
    sendMemo(s, 'casual');
    const back = deserialize(serialize(s))!.state;
    expect(back.stage).toBe(5);
    expect(back.war.politics.pd).toBe(27);
    expect(back.war.politics.evidence).toBe(42);
    expect(back.war.politics.memos.casual.until).toBeGreaterThan(back.time);
    expect(back.war.fighting).toBe('hr');
  });

  it('a save from when the floor was simply yours now gets HR’s investigation', () => {
    const s = atHr();
    const file = JSON.parse(serialize(s));
    file.version = 15;
    delete file.state.war.politics;
    file.state.war.fighting = 'rematch';
    for (const d of DEPARTMENTS) delete file.state.war.depts[d.dept].seized;
    const back = deserialize(JSON.stringify(file))!.state;
    expect(back.stage).toBe(5);
    expect(back.war.politics.announced5).toBe(false);
    expect(back.war.fighting).toBe('rematch');
    expect(fight(back, 'hr').ok).toBe(true);
    expect(back.targetResolve).toBe(HR_DIRECTOR.resolve);
  });

  it('memos are all there after a reload', () => {
    const back = deserialize(serialize(atHr()))!.state;
    for (const m of MEMOS) expect(back.war.politics.memos[m.id]).toBeDefined();
    void mods;
    void WEAPONS;
  });
});

describe('Corporate Politics pacing (scripted bot)', () => {
  it('a careful player closes the case in about 45 to 60 minutes, either way', async () => {
    const { playBot, runBot, STYLES } = await import('./bot');
    for (const extra of [{}, { politicsOnly: true }]) {
      const style = { ...STYLES[0], war3: true, ...extra };
      const s = playBot(style);
      runBot(s, style, 6 * 3600, (x) => x.stage >= 5);
      const start = s.time;
      runBot(s, style, 3 * 3600, (x) => x.stage >= 6);
      const minutes = (s.time - start) / 60;
      console.log(JSON.stringify({ politicsMin: +minutes.toFixed(1), politicsOnly: !!(extra as { politicsOnly?: boolean }).politicsOnly, memos: s.stats.memos, seized: s.stats.seized }));
      expect(s.stage).toBe(6);
      expect(minutes).toBeGreaterThan(35);
      expect(minutes).toBeLessThan(75);
    }
  }, 900000);
});
