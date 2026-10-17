import { describe, expect, it } from 'vitest';
import { BARRAGE, DEPARTMENTS, REMATCH, TARGETS, TUNING, WAR, WEAPONS } from '../src/sim/content';
import { addSuspicion, applyOffline, barrage, buyWeapon, flick, step, weaponAvailable } from '../src/sim/engine';
import { closetIsYours, mods } from '../src/sim/mods';
import { deserialize, serialize } from '../src/sim/save';
import { seatCost } from '../src/sim/staff';
import { currentTarget, deptMax, newAlly, newGame, rematchOrder, type GameState } from '../src/sim/state';
import { basePay } from '../src/sim/work';
import { chaseRaid, deptBounty, fight, firewallUp } from '../src/sim/war';

/** A game that has just beaten Rick, with nothing random getting in the way. */
function atWar(): GameState {
  const s = newGame(5);
  s.walkby.nextAt = 1e9;
  s.work.nextCallAt = 1e9;
  s.dale.nextDealAt = 1e9;
  s.office.nextAt = 1e9;
  s.chat.nextAt = 1e9;
  s.stage = 2;
  s.targetIndex = TARGETS.length - 1;
  s.targetResolve = 0.5;
  s.bands = 1000;
  hit(s);
  s.war.closet.nextAt = 1e9;
  return s;
}

/** One flick (a full stretch unless said otherwise), ready or not. */
function hit(s: GameState, charge = 1) {
  s.nextFlickAt = 0;
  s.flickLockUntil = 0;
  s.suspicion = 0;
  return flick(s, charge);
}

/** Knocks out whoever you're fighting. */
function finish(s: GameState) {
  s.targetResolve = 0.5;
  hit(s);
}

function run(s: GameState, seconds: number) {
  for (let i = 0; i < Math.round(seconds / TUNING.stepSeconds); i++) {
    step(s, TUNING.stepSeconds);
    s.events.length = 0;
  }
}

describe('the Department War', () => {
  it('starts with IT and keeps each department’s damage when you switch', () => {
    const s = atWar();
    expect(s.stage).toBe(3);
    expect(currentTarget(s)?.id).toBe('it');
    const max = deptMax(s, 'it');
    s.targetResolve = max * 0.6;
    expect(fight(s, 'accounting').ok).toBe(true);
    expect(currentTarget(s)?.id).toBe('accounting');
    expect(s.targetResolve).toBe(deptMax(s, 'accounting'));
    expect(s.inbox.some((m) => m.subject === 'Re: We have noticed' && m.from === 'Doris Kemper')).toBe(true);
    fight(s, 'it');
    expect(s.targetResolve).toBeCloseTo(max * 0.6);
  });

  it('taking a department pays out, gives its perk, and puts the others on alert', () => {
    const s = atWar();
    const before = { desks: s.desks, salary: s.salary, accounting: deptMax(s, 'accounting') };
    expect(weaponAvailable(s, 'gatling')).toBe(false);
    const bounty = deptBounty(s, 'it');
    finish(s);
    expect(s.war.depts.it.taken).toBe(true);
    expect(s.desks).toBe(before.desks + DEPARTMENTS[0].desks);
    expect(s.salary).toBeGreaterThanOrEqual(before.salary + bounty);
    expect(deptMax(s, 'accounting')).toBe(Math.round(before.accounting * WAR.reinforce));
    // On to the next one by itself.
    expect(currentTarget(s)?.id).toBe('accounting');
    expect(fight(s, 'it').ok).toBe(false);
    // IT's perk: the Gatling.
    expect(weaponAvailable(s, 'gatling')).toBe(true);
    s.salary = 1e6;
    expect(buyWeapon(s, 'gatling').ok).toBe(false); // Dave has to build it
    s.allies.push(newAlly('dave', 'engineer'));
    expect(buyWeapon(s, 'gatling').ok).toBe(true);
  });

  it('IT’s script orders bands when you run low and opens the box for you', () => {
    const s = atWar();
    finish(s);
    s.bands = 0;
    s.salary = 1000;
    run(s, 0.2);
    expect(s.supplies.order).not.toBeNull();
    run(s, 12);
    expect(s.supplies.box).toBeNull();
    expect(s.bands).toBeGreaterThanOrEqual(mods(s).order.amount);
  });

  it('Accounting pays 25% more, the Mailroom sends bands, Marketing makes hiring cheaper', () => {
    const s = atWar();
    const pay = basePay(s, 'mail');
    const bps = mods(s).bandsPerSec;
    const seat = seatCost(s, 'temp');
    for (const id of ['accounting', 'mailroom', 'marketing'] as const) {
      fight(s, id);
      finish(s);
    }
    expect(basePay(s, 'mail')).toBeCloseTo(pay * WAR.accountingPay);
    expect(mods(s).bandsPerSec).toBeCloseTo(bps + WAR.mailroomRate + (5 + 3 + 6) * TUNING.deskRate);
    expect(seatCost(s, 'temp')).toBe(Math.round(seat * WAR.marketingHire));
  });

  it('IT’s firewall halves your shots while it’s up, but not a Barrage', () => {
    const s = atWar();
    // Find a moment with the firewall up.
    while (!firewallUp(s)) s.time += 0.1;
    let r = s.targetResolve;
    hit(s);
    const blocked = r - s.targetResolve;
    while (firewallUp(s)) s.time += 0.1;
    r = s.targetResolve;
    hit(s);
    const open = r - s.targetResolve;
    expect(blocked / open).toBeCloseTo(WAR.firewall.mult);
    // A Barrage goes straight through.
    while (!firewallUp(s)) s.time += 0.1;
    s.barrageAt = 0;
    s.bands = BARRAGE.perPerson;
    r = s.targetResolve;
    expect(barrage(s).ok).toBe(true);
    expect(r - s.targetResolve).toBeCloseTo(BARRAGE.perPerson * WEAPONS[0].damage * BARRAGE.power);
  });

  it('Doris only feels stretched shots', () => {
    const s = atWar();
    fight(s, 'accounting');
    let r = s.targetResolve;
    hit(s, 0);
    const tap = r - s.targetResolve;
    r = s.targetResolve;
    hit(s, 0.5);
    const half = r - s.targetResolve;
    expect(tap).toBeCloseTo(WEAPONS[0].damage * WAR.tapMult);
    expect(half).toBeCloseTo(WEAPONS[0].damage * 3); // a half stretch is ×3, in full
  });

  it('Big Tony fires back while you fight him: free bands, some noise', () => {
    const s = atWar();
    fight(s, 'mailroom');
    hit(s);
    const bands = s.bands;
    run(s, WAR.tony.every + 0.2);
    expect(s.bands).toBeGreaterThanOrEqual(bands + WAR.tony.bands);
    expect(s.suspicion).toBeGreaterThan(0);
  });

  it('Skyler rebrands once, the first time she drops below half', () => {
    const s = atWar();
    fight(s, 'marketing');
    const max = deptMax(s, 'marketing');
    s.targetResolve = max * WAR.rebrandAt + 1;
    hit(s);
    expect(s.war.depts.marketing.rebranded).toBe(true);
    expect(s.targetResolve).toBeGreaterThan(max * 0.7);
    s.targetResolve = max * 0.3;
    hit(s);
    expect(s.targetResolve).toBeLessThan(max * 0.3);
  });

  it('getting fired puts the department you were fighting back at full strength', () => {
    const s = atWar();
    s.targetResolve = 10;
    s.hr.writeUps = TUNING.writeUpsToFinal;
    addSuspicion(s, 200);
    expect(s.stats.fired).toBe(1);
    expect(s.targetResolve).toBe(deptMax(s, 'it'));
    expect(s.stage).toBe(3);
  });

  it('taking all four starts Stage 4 at the Break Room, and the bosses join the rematches', () => {
    const s = atWar();
    for (const d of DEPARTMENTS) {
      fight(s, d.dept);
      finish(s);
    }
    expect(s.stage).toBe(4);
    expect(s.stats.depts).toBe(4);
    expect(s.war.fighting).toBe('breakroom');
    expect(currentTarget(s)?.id).toBe('breakroom');
    expect(fight(s, 'it').ok).toBe(false);
    expect(fight(s, 'rematch').ok).toBe(true);
    expect(currentTarget(s)?.id).toBe('gary4');
    expect(rematchOrder(s)).toEqual(REMATCH.order);
    for (let i = 0; i < REMATCH.firstWar; i++) finish(s);
    expect(currentTarget(s)?.id).toBe('it');
    expect(currentTarget(s)?.resolve).toBe(Math.round(DEPARTMENTS[0].resolve * REMATCH.first));
  });
});

describe('the supply closet', () => {
  const raided = () => {
    const s = atWar();
    s.war.closet.nextAt = s.time + 1;
    run(s, 1.2);
    expect(s.war.closet.raid).not.toBeNull();
    return s;
  };

  it('pays you bands while it’s yours', () => {
    const s = atWar();
    expect(closetIsYours(s)).toBe(true);
    const before = mods(s).bandsPerSec;
    s.war.closet.lostUntil = s.time + 60;
    expect(mods(s).bandsPerSec).toBeCloseTo(before - WAR.closet.bonus);
  });

  it('chasing raiders off gets you the bands they grabbed', () => {
    const s = raided();
    const bands = s.bands;
    const r = chaseRaid(s);
    expect(r.ok).toBe(true);
    expect(s.bands).toBe(bands + r.bands!);
    expect(r.bands).toBeGreaterThanOrEqual(WAR.closet.dropMin);
    expect(s.war.closet.raid).toBeNull();
    expect(s.stats.raidsStopped).toBe(1);
  });

  it('a raid that gets away costs you the closet for a while and heals the raiders', () => {
    const s = raided();
    const who = s.war.closet.raid!.dept;
    if (who === 'it') s.targetResolve = deptMax(s, 'it') * 0.5;
    else s.war.depts[who].share = 0.5;
    run(s, WAR.closet.seconds + 0.2);
    expect(s.war.closet.raid).toBeNull();
    expect(s.stats.raidsLost).toBe(1);
    expect(closetIsYours(s)).toBe(false);
    const share = who === 'it' ? s.targetResolve / deptMax(s, 'it') : s.war.depts[who].share;
    expect(share).toBeGreaterThan(0.5);
    run(s, WAR.closet.lost);
    expect(closetIsYours(s)).toBe(true);
  });

  it('nobody raids while you’re away', () => {
    const s = raided();
    applyOffline(s, 600);
    expect(s.war.closet.raid).toBeNull();
  });
});

describe('Department War saves', () => {
  it('round-trips mid-war', () => {
    const s = atWar();
    s.targetResolve = deptMax(s, 'it') * 0.4;
    fight(s, 'mailroom');
    finish(s);
    const back = deserialize(serialize(s))!.state;
    expect(back.war.depts.mailroom.taken).toBe(true);
    expect(back.war.depts.it.share).toBeCloseTo(0.4);
    expect(back.war.fighting).toBe(s.war.fighting);
    expect(back.targetResolve).toBeCloseTo(s.targetResolve);
  });

  it('cleans up a broken war', () => {
    const s = atWar();
    const file = JSON.parse(serialize(s));
    file.state.war.fighting = 'legal';
    file.state.war.depts.it.share = 'lots';
    file.state.war.closet.nextAt = null;
    const back = deserialize(JSON.stringify(file))!.state;
    expect(back.war.fighting).toBe('rematch');
    expect(back.war.depts.it.share).toBe(1);
    expect(Number.isFinite(back.war.closet.nextAt)).toBe(true);
  });

  it('older saves before the war get a fresh one', () => {
    const s = newGame(3);
    const file = JSON.parse(serialize(s));
    file.version = 12;
    delete file.state.war;
    const back = deserialize(JSON.stringify(file))!.state;
    expect(back.war.depts.it.taken).toBe(false);
    expect(back.stage).toBe(1);
  });
});

describe('Department War pacing (scripted bot)', () => {
  it('a careful player takes the floor in about an hour', async () => {
    const { playBot, runBot, STYLES } = await import('./bot');
    const style = { ...STYLES[0], war3: true };
    const s = playBot(style);
    const start = s.time;
    runBot(s, style, 3 * 3600, (x) => x.stage >= 4);
    const minutes = (s.time - start) / 60;
    console.log(JSON.stringify({ departmentWarMin: +minutes.toFixed(1), raidsStopped: s.stats.raidsStopped, gatling: s.ownedWeapons.includes('gatling') }));
    expect(s.stage).toBe(4);
    expect(minutes).toBeGreaterThan(40);
    expect(minutes).toBeLessThan(100);
    expect(s.ownedWeapons).toContain('gatling');
    expect(s.stats.raidsStopped).toBeGreaterThan(0);
  }, 300000);
});
