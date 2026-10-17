import { describe, expect, it } from 'vitest';
import { BARRAGE, DEPARTMENTS, ROOMS, SIEGE, TARGETS, TUNING, WAR, WEAPONS } from '../src/sim/content';
import { addSuspicion, applyOffline, assign, barrage, flick, step } from '../src/sim/engine';
import { mods } from '../src/sim/mods';
import { deserialize, serialize } from '../src/sim/save';
import { seatCost, teamPerMin } from '../src/sim/staff';
import { currentTarget, deptPerk, newAlly, newGame, type GameState } from '../src/sim/state';
import { basePay } from '../src/sim/work';
import { fight } from '../src/sim/war';
import { holdLine, inMeeting, sabotage, sabotageCost, wallUp } from '../src/sim/siege';

/** A game that has just taken the fourth department: Stage 4, at the Break Room. */
function atSiege(): GameState {
  const s = newGame(11);
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  s.stage = 2;
  s.targetIndex = TARGETS.length - 1;
  s.bands = 100000;
  s.salary = 1e6;
  finish(s);
  for (const d of DEPARTMENTS) {
    fight(s, d.dept);
    finish(s);
  }
  s.war.counter.nextAt = 1e9;
  return s;
}

function hit(s: GameState, charge = 1) {
  s.nextFlickAt = 0;
  s.flickLockUntil = 0;
  s.suspicion = 0;
  return flick(s, charge);
}

function finish(s: GameState) {
  if (s.stage === 4) {
    const r = s.war.fighting as 'breakroom' | 'conference';
    s.war.rooms[r].wall = 0;
  }
  s.targetResolve = 0.5;
  hit(s);
}

function run(s: GameState, seconds: number) {
  for (let i = 0; i < Math.round(seconds / TUNING.stepSeconds); i++) {
    step(s, TUNING.stepSeconds);
    s.events.length = 0;
  }
}

describe('Stage 4: walls', () => {
  it('a wall soaks up hits until it comes down, then Resolve takes them', () => {
    const s = atSiege();
    expect(s.stage).toBe(4);
    expect(wallUp(s)).toBe(true);
    const resolve = s.targetResolve;
    const wall = s.war.rooms.breakroom.wall;
    hit(s);
    expect(s.targetResolve).toBe(resolve);
    // A normal shot does half to a wall.
    expect(wall - s.war.rooms.breakroom.wall).toBeCloseTo(WEAPONS[0].damage * 5 * SIEGE.wallShot * SIEGE.coffeeShots ** 0);
    s.war.rooms.breakroom.wall = 1;
    hit(s);
    expect(wallUp(s)).toBe(false);
    hit(s);
    expect(s.targetResolve).toBeLessThan(resolve);
  });

  it('Barrages and the Gatling hit walls fully', () => {
    const s = atSiege();
    s.barrageAt = 0;
    s.bands = BARRAGE.perPerson;
    let wall = s.war.rooms.breakroom.wall;
    barrage(s);
    expect(wall - s.war.rooms.breakroom.wall).toBeCloseTo(BARRAGE.perPerson * WEAPONS[0].damage * BARRAGE.power);
    s.allies.push(newAlly('dave', 'engineer'));
    s.ownedWeapons.push('gatling');
    s.weapon = 'gatling';
    s.bands = 1000;
    wall = s.war.rooms.breakroom.wall;
    hit(s, 0);
    const g = WEAPONS.find((w) => w.id === 'gatling')!;
    expect(wall - s.war.rooms.breakroom.wall).toBeCloseTo(g.damage * g.burst);
  });

  it('Engineers take the wall apart on their own', () => {
    const s = atSiege();
    s.allies.push(newAlly('dave', 'engineer'));
    const wall = s.war.rooms.breakroom.wall;
    run(s, 10);
    expect(wall - s.war.rooms.breakroom.wall).toBeCloseTo(2 * SIEGE.engineerDps * 10, -1);
  });

  it('the wall stays down if you switch away and come back', () => {
    const s = atSiege();
    s.war.rooms.breakroom.wall = 500;
    fight(s, 'conference');
    expect(currentTarget(s)?.id).toBe('conference');
    expect(wallUp(s)).toBe(true);
    fight(s, 'breakroom');
    expect(s.war.rooms.breakroom.wall).toBe(500);
  });
});

describe('Stage 4: the rooms’ tricks and sabotage', () => {
  it('the Coffee Club tops up, unless their coffee machine is unplugged', () => {
    const s = atSiege();
    s.war.rooms.breakroom.wall = 0;
    const max = ROOMS[0].resolve;
    s.targetResolve = max / 2;
    s.sinceLastHit = 0;
    s.war.coffeeAt = s.time + 0.05;
    step(s, TUNING.stepSeconds);
    expect(s.targetResolve).toBeCloseTo(max / 2 + max * SIEGE.coffee.share);
    const cost = sabotageCost(s);
    const salary = s.salary;
    expect(sabotage(s, 'breakroom').ok).toBe(true);
    expect(s.salary).toBe(salary - cost);
    expect(sabotage(s, 'breakroom').ok).toBe(false);
    const r = s.targetResolve;
    s.war.coffeeAt = s.time + 0.05;
    step(s, TUNING.stepSeconds);
    expect(s.targetResolve).toBeCloseTo(r, -1);
  });

  it('Victoria pulls your Shooters into meetings, unless a reply-all storm is going', () => {
    const s = atSiege();
    s.allies.push(newAlly('gary', 'shooter'));
    fight(s, 'conference');
    s.war.meetingAt = s.time + 0.05;
    step(s, TUNING.stepSeconds);
    expect(inMeeting(s)).toBe(true);
    const wall = s.war.rooms.conference.wall;
    run(s, 5);
    expect(s.war.rooms.conference.wall).toBe(wall); // nobody shooting
    sabotage(s, 'conference');
    expect(inMeeting(s)).toBe(false);
    s.war.meetingAt = s.time + 0.05;
    step(s, TUNING.stepSeconds);
    expect(inMeeting(s)).toBe(false);
  });
});

describe('Stage 4: counterattacks and Guards', () => {
  const attacked = (guards = 0) => {
    const s = atSiege();
    for (let i = 0; i < guards; i++) s.allies.push(newAlly((['gary', 'kevin', 'marjorie'] as const)[i], 'guard'));
    s.war.counter.nextAt = s.time;
    run(s, 0.2);
    return s;
  };

  it('holding the line keeps your desks and gets you bands', () => {
    const s = attacked();
    expect(s.war.counter.attack).not.toBeNull();
    const bands = s.bands;
    const r = holdLine(s);
    expect(r.ok).toBe(true);
    expect(s.bands).toBeGreaterThan(bands);
    expect(s.stats.countersHeld).toBe(1);
  });

  it('one that gets through switches that department’s prize and desks off for a while', () => {
    const s = attacked();
    const who = s.war.counter.attack!.dept;
    const bps = mods(s).bandsPerSec;
    run(s, SIEGE.counter.seconds + 0.2);
    expect(deptPerk(s, who)).toBe(false);
    expect(s.stats.countersLost).toBe(1);
    expect(mods(s).bandsPerSec).toBeLessThan(bps);
    if (who === 'accounting') expect(basePay(s, 'mail')).toBeLessThan(basePay(s, 'mail') * WAR.accountingPay);
    run(s, SIEGE.counter.lost);
    expect(deptPerk(s, who)).toBe(true);
  });

  it('enough Guards stop them before they start', () => {
    let held = 0;
    for (let i = 0; i < 20; i++) {
      const s = attacked(3);
      s.rng = i * 7919 + 1;
      s.war.counter.attack = null;
      s.war.counter.nextAt = s.time;
      run(s, 0.2);
      if (!s.war.counter.attack) held++;
    }
    expect(held).toBeGreaterThan(12);
  });

  it('Guards are a role you can give people in Stage 4', () => {
    const s = atSiege();
    s.allies.push(newAlly('kevin', 'gatherer'));
    expect(assign(s, 'kevin', 'guard').ok).toBe(true);
  });

  it('nothing attacks while you’re away', () => {
    const s = attacked();
    applyOffline(s, 600);
    expect(s.war.counter.attack).toBeNull();
  });
});

describe('Stage 4: taking the rooms', () => {
  it('the Break Room gives you coffee, the Conference Room speeds your team, and both open Stage 5', () => {
    const s = atSiege();
    s.allies.push(newAlly('gary', 'shooter'));
    s.staff.temp = { seats: 2, level: 0, done: 0 };
    s.career.rank = Math.max(s.career.rank, 1);
    const interval = mods(s).allyInterval;
    const team = teamPerMin(s, 'temp', true);
    finish(s);
    expect(s.war.rooms.breakroom.taken).toBe(true);
    expect(mods(s).allyInterval).toBeCloseTo(interval / SIEGE.coffeeShooters);
    expect(currentTarget(s)?.id).toBe('conference');
    finish(s);
    expect(s.stage).toBe(5);
    expect(s.stats.rooms).toBe(2);
    expect(teamPerMin(s, 'temp', true)).toBeCloseTo(team * SIEGE.conferenceTeam);
    expect(s.war.fighting).toBe('rematch');
    expect(currentTarget(s)).toBeDefined();
  });

  it('getting fired gives the room its Resolve back but not its wall', () => {
    const s = atSiege();
    s.war.rooms.breakroom.wall = 0;
    s.targetResolve = 10;
    s.hr.writeUps = TUNING.writeUpsToFinal;
    addSuspicion(s, 200);
    expect(s.targetResolve).toBe(ROOMS[0].resolve);
    expect(s.war.rooms.breakroom.wall).toBe(0);
  });
});

describe('Stage 4 saves', () => {
  it('round-trips mid-siege', () => {
    const s = atSiege();
    s.war.rooms.breakroom.wall = 1234;
    sabotage(s, 'breakroom');
    const back = deserialize(serialize(s))!.state;
    expect(back.stage).toBe(4);
    expect(back.war.rooms.breakroom.wall).toBe(1234);
    expect(back.war.rooms.breakroom.sabotageUntil).toBeGreaterThan(back.time);
    expect(back.war.fighting).toBe('breakroom');
  });

  it('a save from before Stage 4 that had taken the floor opens it from the rematch', () => {
    const s = atSiege();
    const file = JSON.parse(serialize(s));
    file.version = 14;
    delete file.state.war.rooms;
    file.state.war.fighting = 'rematch';
    const back = deserialize(JSON.stringify(file))!.state;
    expect(back.stage).toBe(4);
    expect(back.war.fighting).toBe('rematch');
    expect(back.war.rooms.breakroom.wall).toBe(ROOMS[0].wall);
    expect(back.war.announced4).toBe(false);
    expect(fight(back, 'breakroom').ok).toBe(true);
  });

  it('marketing’s cheaper hiring stops while they have their desks back', () => {
    const s = atSiege();
    const cheap = seatCost(s, 'temp');
    s.war.depts.marketing.lostUntil = s.time + 60;
    expect(seatCost(s, 'temp')).toBeGreaterThan(cheap);
  });
});

describe('Floor Domination pacing (scripted bot)', () => {
  it('a careful player takes both rooms in about 45 to 60 minutes', async () => {
    const { playBot, runBot, STYLES } = await import('./bot');
    const style = { ...STYLES[0], war3: true };
    const s = playBot(style);
    runBot(s, style, 4 * 3600, (x) => x.stage >= 4);
    const start = s.time;
    let breakroom = 0;
    runBot(s, style, 3 * 3600, (x) => {
      if (!breakroom && x.war.rooms.breakroom.taken) breakroom = x.time;
      return x.stage >= 5;
    });
    const minutes = (s.time - start) / 60;
    console.log(JSON.stringify({
      floorMin: +minutes.toFixed(1),
      breakroomMin: +((breakroom - start) / 60).toFixed(1),
      atMin: +(s.time / 60).toFixed(1),
      walls: s.stats.walls, held: s.stats.countersHeld, lost: s.stats.countersLost, sabotages: s.stats.sabotages,
      gatling: s.ownedWeapons.includes('gatling'), allies: s.allies.map((a) => `${a.id}:${a.role}`).join(','),
    }));
    expect(s.stage).toBe(5);
    expect(minutes).toBeGreaterThan(35);
    expect(minutes).toBeLessThan(75);
  }, 600000);
});
