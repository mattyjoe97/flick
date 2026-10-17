import { BAILEY, BARRAGE, CHARGE, CHATTER, COWORKERS, DALE, PROMOTION, ROLES, TARGETS, TUNING, UPGRADES, WEAPONS, chargeMult, type CoworkerId, type Role, type UpgradeId, type WeaponId } from './content';
import { allyPower, coworker, has, isConfiscated, knowsTrick, mods, onFinalWarning, weapon } from './mods';
import { rand, randRange } from './rng';
import { company, currentTarget, deptMax, deptTaken, fightingHr, newAlly, politicsDamage, politicsNoise, pushEmail, pushTicker, reclaimingDept, type DaleDeal, type GameState } from './state';
import { focusApp, setSuspicionHook, stepWork, WORK } from './work';
import { chatEvent, stepChat } from './chat';
import { boxSpotted, deliver, grab, stepSupplies, suppliesOffline, SUPPLIES } from './supplies';
import { staffOffline, stepStaff } from './staff';
import { stepOffice } from './office';
import { stepGoals } from './goals';
import { ballBarrageMult, ballCoolMult, ballUnlocked, stepBall } from './ball';
import { rematchWon, stepRematch } from './rematch';
import { afterHit, deptWon, fightingDept, roomWon, shotMult, startWar, stepWar } from './war';
import { fightingRoom, hitWall, inMeeting, siegeOffline, stepSiege, wallMult, wallUp } from './siege';
import { POLITICS, ROOMS } from './content';
import { asksOffline, stepAsks } from './asks';
import { addEvidence, hrWon, politicsOffline, reclaimWon, stepPolitics } from './politics';
import { execMult, offlineCap, repDamage } from './job';
import { renoDamage, toughness } from './ladder';
import { stepTrophies } from './trophies';

export { openBox } from './supplies';

// ------------------------------------------------------------------ helpers

/** Adds Suspicion through Lookouts, and triggers getting caught at 100. */

/**
 * The career ladder and the Window Office: up the ladder everyone is tougher. Inside, that
 * means your hits count for less; on screen, Resolve and damage are shown that many times
 * bigger (see `toughness`), so the numbers grow instead.
 */
function ladderDamage(s: GameState) {
  return renoDamage(s) / toughness(s);
}

export function addSuspicion(s: GameState, amount: number) {
  const m = mods(s);
  s.suspicion += amount * (1 - m.lookoutCut) * company(s).rules.suspicion;
  checkThresholds(s);
}

// Work tasks raise Suspicion through the same path (Lookouts, warnings, getting caught).
setSuspicionHook(addSuspicion);

function checkThresholds(s: GameState) {
  if (!s.warned50 && s.suspicion >= 50) {
    s.warned50 = true;
    pushEmail(s, 'HR', 'Friendly reminder', 'The office is a professional environment. This is a general reminder, not about anyone.', 'warning');
  }
  if (!s.warned75 && s.suspicion >= 75) {
    s.warned75 = true;
    pushEmail(s, 'Mr. Feeney', 'Quick sync?', 'Can we circle back on some "elastic" expenses? No rush. Today.', 'warning');
  }
  if (s.suspicion < 35) s.warned50 = false;
  if (s.suspicion < 60) s.warned75 = false;
  if (s.suspicion >= 100) getCaught(s);
}

function getCaught(s: GameState) {
  if (onFinalWarning(s)) {
    getFired(s);
    return;
  }
  s.stats.caught++;
  s.lastCaughtAt = s.time;
  // Play Dead: Bailey keels over and Mr. Feeney only gets half the bands.
  const playDead = knowsTrick(s, 'playdead');
  const lost = Math.floor(s.bands * TUNING.caughtBandLoss * (playDead ? BAILEY.playDeadLoss : 1));
  s.bands -= lost;
  s.suspicion = TUNING.caughtResetTo;
  s.flickLockUntil = s.time + TUNING.caughtFlickLock;
  s.shooterLockUntil = s.time + TUNING.caughtShooterLock;
  s.lookBusy = false;
  focusApp(s, null);

  // A write-up goes in your file.
  s.hr.writeUps++;
  s.hr.lastWriteUpAt = s.time;

  // Your equipped weapon goes in Mr. Feeney's drawer (whatever was there before comes back).
  const taken = s.weapon !== 'flick' ? s.weapon : null;
  if (taken) s.hr.confiscated = { weapon: taken, until: s.time + TUNING.confiscateSeconds };
  const takenName = taken ? WEAPONS.find((w) => w.id === taken)!.name : null;

  // While you're in the meeting, your target regroups.
  const t = currentTarget(s);
  let regrouped = 0;
  if (t) {
    const before = s.targetResolve;
    s.targetResolve = Math.min(t.resolve, s.targetResolve + t.resolve * TUNING.regroupShare);
    regrouped = s.targetResolve - before;
  }

  const drawer = `My office. ${lost.toLocaleString('en-US')} of your rubber bands are now in my desk drawer${takenName ? `, and so is your ${takenName}` : ''}.`;
  pushEmail(s, 'Mr. Feeney', 'We need to talk', drawer, 'warning');
  if (s.hr.writeUps >= TUNING.writeUpsToFinal) {
    pushEmail(s, 'HR', 'FINAL WARNING', 'This is your final written warning. Any further incident will result in separation from the company. Please sign and return the attached form. There is no attached form.', 'warning');
  } else {
    pushEmail(s, 'HR', `Written warning (${s.hr.writeUps} of ${TUNING.writeUpsToFinal})`, 'This note has been added to your file. Notes are removed after a period of good conduct.', 'warning');
  }
  if (playDead) pushTicker(s, 'Bailey plays dead. Mr. Feeney panics, checks on her, and forgets half the bands.');
  pushTicker(s, `Caught. Write-up ${s.hr.writeUps} of ${TUNING.writeUpsToFinal}.${takenName ? ` Mr. Feeney keeps your ${takenName}.` : ''}${t && regrouped >= 1 ? ` ${t.name.split(' ')[0]} regroups while you're gone.` : ''}`);
  s.events.push({ type: 'caught', writeUps: s.hr.writeUps, confiscated: taken, lostBands: lost, regrouped });
  chatEvent(s, 'caught');
  // In Stage 5, every write-up goes straight into HR's case file too.
  addEvidence(s, POLITICS.evidence.caught);
}

/**
 * Caught on Final Warning: you're fired. You lose your bands and everything you won in
 * the current stage, but keep your weapons, requisitions and team. Then HR loses the
 * paperwork and you're back on Monday with a clean file.
 */
function getFired(s: GameState) {
  s.stats.fired++;
  s.lastCaughtAt = s.time;
  const lostBands = Math.floor(s.bands);
  s.bands = TUNING.firedBands;
  let lostDesks = 0;
  if (s.stage <= 2) {
    const first = TARGETS.findIndex((t) => t.stage === s.stage);
    for (let i = first; i < s.targetIndex; i++) lostDesks += TARGETS[i].desks;
    s.desks = Math.max(0, s.desks - lostDesks);
    s.targetIndex = first;
    s.targetResolve = TARGETS[first].resolve;
    s.sinceLastHit = 999;
  } else if (fightingDept(s)) {
    // The department you were fighting gets all its Resolve back (the ones you took stay yours).
    s.targetResolve = deptMax(s, fightingDept(s)!);
    s.sinceLastHit = 999;
  } else if (fightingRoom(s)) {
    // The room gets its Resolve back (what you knocked off its wall stays knocked off).
    s.targetResolve = ROOMS.find((r) => r.room === fightingRoom(s))!.resolve;
    s.sinceLastHit = 999;
  } else if (fightingHr(s) || reclaimingDept(s)) {
    // HR (or the department you were winning back) gets all its Resolve back.
    s.targetResolve = currentTarget(s)!.resolve;
    s.sinceLastHit = 999;
  } else if (s.rematch) {
    s.targetResolve = s.rematch.resolve;
    s.sinceLastHit = 999;
  }
  s.suspicion = 0;
  s.hr = { writeUps: 0, lastWriteUpAt: s.time, confiscated: null };
  s.lookBusy = false;
  focusApp(s, null);
  s.flickLockUntil = 0;
  s.shooterLockUntil = 0;
  s.walkby = { nextAt: s.time + TUNING.firstWalkby / 2, arrivesAt: null };
  pushEmail(s, 'HR', 'Separation notice', 'Effective immediately, your position has been eliminated. Please return your badge and take only personal items. Security will escort you out.', 'warning');
  pushEmail(s, 'HR', 'Re: Separation notice', 'Please disregard the previous email. Due to a filing error there is no record of your separation, or of you. Welcome back! Your desk is where you left it. The rubber bands are not.', 'story');
  pushTicker(s, `Fired. You carry a box past every desk on the floor. On Monday, HR has lost the paperwork.`);
  s.events.push({ type: 'fired', lostBands, lostDesks, stage: s.stage });
  chatEvent(s, 'fired');
}

/** Write-ups fade with good conduct, and confiscated weapons come back on their own eventually. */
function stepHr(s: GameState) {
  const hr = s.hr;
  if (hr.writeUps > 0 && s.time - hr.lastWriteUpAt >= TUNING.writeUpFade) {
    hr.writeUps--;
    hr.lastWriteUpAt = s.time;
    pushEmail(s, 'HR', 'File review', 'Following a period of good conduct, a note has been removed from your file. Keep it up.', 'flavor');
    pushTicker(s, 'A write-up quietly falls out of your HR file.');
    s.events.push({ type: 'writeUpFaded', writeUps: hr.writeUps });
  }
  if (hr.confiscated && s.time >= hr.confiscated.until) {
    const w = WEAPONS.find((w) => w.id === hr.confiscated!.weapon)!;
    hr.confiscated = null;
    pushTicker(s, `Mr. Feeney left his drawer unlocked. You take your ${w.name} back.`);
    s.events.push({ type: 'weaponBack', weapon: w.id, paid: false });
  }
}

/** Promotions for time served on your team. */
function stepAllies(s: GameState, dt: number) {
  for (const a of s.allies) {
    a.served += dt;
    if (a.rank < PROMOTION.after.length && a.served >= PROMOTION.after[a.rank]) {
      a.rank++;
      s.stats.promotions++;
      const c = coworker(a.id);
      const role = ROLES.find((r) => r.id === a.role)!.name;
      const title = `${PROMOTION.titles[a.rank]} ${role}`;
      const cake = a.rank === 1 ? 'There is cake in the break room.' : 'There was cake in the break room.';
      pushEmail(s, 'HR', `Congratulations, ${c.name}!`, `Please join us in congratulating ${c.name} on their promotion to ${title}. ${cake}`, 'win');
      pushTicker(s, `${c.name} is promoted to ${title}. Better at the job, worse at the job title.`);
      s.events.push({ type: 'promotion', id: a.id, rank: a.rank });
      chatEvent(s, `promotion:${a.id}`);
    }
  }
}

/** Seconds until your weapon comes back on its own, or null if nothing is confiscated. */
export function confiscatedLeft(s: GameState) {
  return s.hr.confiscated ? Math.max(0, s.hr.confiscated.until - s.time) : null;
}

/** What Lost and Found charges to get your confiscated weapon back early. */
export function buyBackPrice(s: GameState) {
  const c = s.hr.confiscated;
  if (!c) return 0;
  const w = WEAPONS.find((w) => w.id === c.weapon)!;
  return priceOf(s, Math.max(TUNING.buyBackMin, Math.round(w.price * TUNING.buyBackShare)));
}

/** Pay Lost and Found to get your weapon out of Mr. Feeney's drawer now. */
export function buyBack(s: GameState): ActionResult {
  const c = s.hr.confiscated;
  if (!c) return no('Nothing of yours is in Mr. Feeney’s drawer.');
  const price = buyBackPrice(s);
  if (s.salary < price) return no(`Dale wants $${price} to get it back.`);
  s.salary -= price;
  const w = WEAPONS.find((w) => w.id === c.weapon)!;
  s.hr.confiscated = null;
  s.stats.buyBacks++;
  pushTicker(s, `Dale comes back from Mr. Feeney's office with your ${w.name}. You don't ask how.`);
  s.events.push({ type: 'weaponBack', weapon: w.id, paid: true });
  return ok;
}

export function priceOf(s: GameState, base: number) {
  return Math.ceil(base * mods(s).priceMult);
}

function fire(
  s: GameState,
  by: 'you' | 'ally',
  powerMult: number,
  allyId?: CoworkerId,
  shot: { charge: number; perfect: boolean } = { charge: 0, perfect: false },
): boolean {
  const t = currentTarget(s);
  if (!t) return false;
  const w = weapon(s);
  if (s.bands < w.burst) return false;
  const m = mods(s);
  s.bands -= w.burst;
  let dmg = w.damage * w.burst * powerMult * (t.damageMult ?? 1) * m.bandDamage * shotMult(s, by, shot.charge) * politicsDamage(s) * repDamage(s) * ladderDamage(s);
  // In Stage 4 there may be a filing-cabinet wall in the way: it soaks up the hit.
  const walled = wallUp(s);
  if (walled) dmg = hitWall(s, dmg * wallMult(s, 'shot'));
  else s.targetResolve -= dmg;
  afterHit(s);
  s.sinceLastHit = 0;
  s.lastShotAt = s.time;
  s.stats.shots++;
  s.stats.damage += dmg;
  s.events.push({ type: 'shot', damage: dmg, by, allyId, charge: shot.charge, perfect: shot.perfect });
  const stretch = 1 + CHARGE.noisePerCharge * shot.charge;
  const noise = TUNING.noisePerShot * w.noise * m.allNoiseMult * stretch * (by === 'you' ? m.yourNoiseMult : 1) * politicsNoise(s);
  addSuspicion(s, noise);
  // HR hears every shot fired at HR: some of it goes in the case file.
  if (fightingHr(s)) addEvidence(s, noise * POLITICS.evidence.noiseShare);
  if (!walled && s.targetResolve <= 0) capture(s);
  return true;
}

function capture(s: GameState) {
  const t = currentTarget(s);
  if (!t) return;
  if (s.stage >= 3) {
    const back = reclaimingDept(s);
    if (fightingDept(s)) deptWon(s);
    else if (fightingRoom(s)) roomWon(s);
    else if (fightingHr(s)) hrWon(s);
    else if (back) reclaimWon(s, back);
    else rematchWon(s);
    addSuspicion(s, TUNING.captureNoise);
    return;
  }
  s.desks += t.desks;
  // They drop whatever money they had stashed, and you get a promotion (work pays more).
  s.salary += t.bounty;
  s.stats.bounties += t.bounty;
  s.events.push({ type: 'pay', amount: t.bounty, source: 'bounty', note: t.bountyNote });
  pushTicker(s, `You find ${t.bountyNote}: +$${t.bounty}.`);
  pushEmail(s, t.defeat.from, t.defeat.subject, t.defeat.body, t.stage === 1 && t.id !== 'gary4' ? 'story' : 'win');
  s.events.push({ type: 'capture', targetId: t.id });
  chatEvent(s, `capture:${t.id}`);
  if (t.desks > 0) pushTicker(s, `${t.name} surrenders. +${t.desks} desk${t.desks > 1 ? 's' : ''} captured.`);
  else pushTicker(s, `${t.name} falls back.`);

  // Newly available coworkers
  for (const c of COWORKERS) {
    if (c.unlockAfter === t.id && c.cost > 0) {
      pushEmail(s, c.name, 'Can we talk?', `${c.who}. Word gets around. I might be interested in joining you, for the right price ($${c.cost}).`, 'story', c.id);
    }
  }

  const next = TARGETS[s.targetIndex + 1];
  if (next && next.stage === t.stage) {
    startTarget(s, s.targetIndex + 1);
    addSuspicion(s, TUNING.captureNoise);
    return;
  }

  if (t.stage === 1) {
    // Gary joins; Stage 2 begins.
    s.stats.stage1At = s.time;
    s.stage = 2;
    s.allies.push(newAlly('gary', 'shooter'));
    pushEmail(s, 'Gary', 'Re: Truce', COWORKERS[0].joinEmail, 'story');
    // (With Old Friends, Kevin and Marjorie are already on your side.)
    if (!s.allies.some((a) => a.id === 'kevin')) pushEmail(s, 'Kevin', 'hi', 'I am the intern. I saw everything. I want in. ($35, or two donuts)', 'story', 'kevin');
    if (!s.allies.some((a) => a.id === 'marjorie')) pushEmail(s, 'Marjorie', 'A word', 'I have been here 31 years and I see everything. I could see things for you. ($95)', 'story', 'marjorie');
    s.events.push({ type: 'stage', stage: 2 });
    startTarget(s, s.targetIndex + 1);
    addSuspicion(s, TUNING.captureNoise);
    return;
  }

  // End of Stage 2: the Department War begins.
  s.stats.stage2At = s.time;
  s.stage = 3;
  s.targetResolve = 0;
  pushEmail(s, 'Accounting', 'We have noticed', 'Your department has acquired 400,000 rubber bands this quarter. We will be in touch. Regards, Accounting.', 'win');
  startWar(s);
  // Nobody in this office can let it go: your old rivals wait on the map for rematches.
  stepRematch(s);
  addSuspicion(s, TUNING.captureNoise);
  s.events.push({ type: 'stage', stage: 3 });
}

function startTarget(s: GameState, index: number) {
  s.targetIndex = index;
  const t = TARGETS[index];
  s.targetResolve = t.resolve;
  s.sinceLastHit = 999;
  if (t.id !== 'gary1') pushEmail(s, t.intro.from, t.intro.subject, t.intro.body, 'story');
  if (t.id === 'rick') s.nextReviewAt = s.time + TUNING.reviewEvery;
}

// ------------------------------------------------------------------ the step

/** Advances the world by dt seconds. Call with TUNING.stepSeconds. */
export function step(s: GameState, dt: number) {
  s.time += dt;
  const m = mods(s);
  const t = currentTarget(s);

  // Income
  s.bands += m.bandsPerSec * dt;
  s.salary += m.salaryPerSec * dt;

  // Cooling off
  const idle = s.time - s.lastShotAt >= TUNING.idleCoolDelay;
  const cool = (TUNING.baseCool + (idle ? TUNING.idleCool : 0) + m.coverCool + (s.lookBusy ? TUNING.lookBusyCool : 0)) * ballCoolMult(s);
  s.suspicion = Math.max(0, s.suspicion - cool * dt);
  checkThresholds(s);

  // Allies fire (at half speed while you're at your computer: they're covering for you)
  const shootersActive = t && s.time >= s.shooterLockUntil && !inMeeting(s);
  const interval = m.allyInterval * (s.lookBusy ? TUNING.computerAllySlow : 1);
  let outOfAmmo = false;
  for (const a of s.allies) {
    if (a.role !== 'shooter' || !shootersActive) continue;
    a.timer += dt;
    while (a.timer >= interval && currentTarget(s)) {
      a.timer -= interval;
      const power = allyPower(a.id, 'shooter', a.rank);
      if (!fire(s, 'ally', power, a.id)) {
        outOfAmmo = true;
        a.timer = 0;
        break;
      }
    }
  }
  if (outOfAmmo && s.time - s.outOfAmmoWarnedAt > 30) {
    s.outOfAmmoWarnedAt = s.time;
    pushTicker(s, 'Your shooters are out of bands. Order supplies or scrounge.');
  }

  // Target recovers when left alone
  const target = currentTarget(s);
  if (target) {
    s.sinceLastHit += dt;
    if (s.sinceLastHit > TUNING.recoverDelay) {
      s.targetResolve = Math.min(target.resolve, s.targetResolve + target.resolve * target.regenPct * dt);
    }
  }

  // Events
  walkbys(s, m.warning, m.walkbyIntervalMult);
  // Gary flicks back (in a rematch, only while you're actually fighting him).
  if (target && target.stage === 1 && s.time >= s.nextGaryFlickAt && (s.stage === 1 || s.time - s.lastShotAt < 60)) {
    s.nextGaryFlickAt = s.time + randRange(s, TUNING.garyFlickMin, TUNING.garyFlickMax);
    s.bands += TUNING.garyFlickBands;
    s.events.push({ type: 'enemyShot' });
    const lines = [
      'Gary flicks back. Two bands land on your desk. Thanks, Gary.',
      'Gary fires blindly over his monitor. You pocket the ammo.',
      'A band bounces off your keyboard. Free ammo.',
    ];
    pushTicker(s, lines[Math.floor(rand(s) * lines.length)]);
  }
  if (target?.id === 'rick' && s.time >= s.nextReviewAt) {
    s.nextReviewAt = s.time + TUNING.reviewEvery;
    addSuspicion(s, TUNING.reviewNoise);
    pushTicker(s, 'Rick schedules a performance review. Suspicion +4.');
    s.events.push({ type: 'review' });
  }
  if (s.time >= s.nextChatterAt) {
    s.nextChatterAt = s.time + randRange(s, 150, 260);
    const c = CHATTER[s.chatterIndex % CHATTER.length];
    s.chatterIndex++;
    pushEmail(s, c.from, c.subject, c.body, 'flavor');
  }
  if (s.time >= s.nextShipmentAt) {
    s.nextShipmentAt = s.time + randRange(s, 240, 480);
    if (rand(s) < 0.35) deliver(s, 25, true);
  }
  stepHr(s);
  stepAllies(s, dt);
  stepWork(s, dt);
  stepStaff(s, dt);
  stepOffice(s);
  stepGoals(s);
  stepBall(s);
  stepRematch(s);
  stepWar(s, addSuspicion);
  stepSiege(s, dt);
  stepPolitics(s, dt);
  stepTrophies(s);
  stepAsks(s);
  stepChat(s);
  stepSupplies(s);
  stepDale(s);
}

function walkbys(s: GameState, warning: number, intervalMult: number) {
  const w = s.walkby;
  if (w.arrivesAt === null && s.time >= w.nextAt) {
    w.arrivesAt = s.time + warning;
    s.events.push({ type: 'walkby' });
  }
  if (w.arrivesAt !== null && s.time >= w.arrivesAt) {
    w.arrivesAt = null;
    w.nextAt = s.time + randRange(s, TUNING.walkbyMin, TUNING.walkbyMax) * intervalMult;
    if (s.lookBusy) {
      s.stats.hides++;
      s.suspicion = Math.max(0, s.suspicion - TUNING.hideReward);
      const bonus = 5 * s.stage;
      s.salary += bonus;
      pushTicker(s, `Mr. Feeney glances at your spreadsheet. "Great hustle." Suspicion −${TUNING.hideReward}, +$${bonus}.`);
      s.work.hustleUntil = s.time + WORK.hustleWindow;
      s.events.push({ type: 'hidden' });
    } else {
      s.stats.walkbysSpotted++;
      const firing = s.time - s.lastShotAt <= 3;
      const amount = firing ? TUNING.caughtFiring : TUNING.caughtOpen;
      pushTicker(
        s,
        firing
          ? `Mr. Feeney watches a rubber band sail past his face. Suspicion +${amount}.`
          : `Mr. Feeney sees you staring at Gary's desk. Suspicion +${amount}.`,
      );
      s.events.push({ type: 'spotted' });
      addSuspicion(s, amount);
    }
    const boxNoise = boxSpotted(s);
    if (boxNoise > 0) {
      pushTicker(s, `Mr. Feeney eyes the unopened box on your desk. "Supplies?" Suspicion +${boxNoise}.`);
      s.events.push({ type: 'boxSpotted', noise: boxNoise });
      addSuspicion(s, boxNoise);
      chatEvent(s, 'boxSpotted');
    }
  }
}

/** Seconds until Mr. Feeney arrives, or null if no walk-by is in progress. */
export function walkbyCountdown(s: GameState) {
  return s.walkby.arrivesAt === null ? null : Math.max(0, s.walkby.arrivesAt - s.time);
}

// ------------------------------------------------------------------ actions

export type ActionResult = { ok: true } | { ok: false; reason: string };
const ok: ActionResult = { ok: true };
const no = (reason: string): ActionResult => ({ ok: false, reason });

/** Checks whether you could flick right now (used before starting to stretch the band). */
export function canFlick(s: GameState): ActionResult {
  if (!currentTarget(s)) return no('There is no one left to flick. For now.');
  if (s.lookBusy) return no('You are at your computer. Press Esc to get back to the war.');
  if (s.time < s.flickLockUntil) return no('You are on a written warning. No flicking for a bit.');
  if (s.bands < weapon(s).burst) return no('Out of bands. Scrounge your drawer or order supplies.');
  return ok;
}

/**
 * Fire your weapon. `charge` (0 to 1) is how far you stretched the band by
 * holding; `perfect` means you let go in the sweet spot at full stretch.
 */
export function flick(s: GameState, charge = 0, perfect = false): ActionResult {
  if (!currentTarget(s)) return no('There is no one left to flick. For now.');
  if (s.lookBusy) return no('You are at your computer. Press Esc to get back to the war.');
  if (s.time < s.flickLockUntil) return no('You are on a written warning. No flicking for a bit.');
  const w = weapon(s);
  if (s.bands < w.burst) return no('Out of bands. Scrounge your drawer or order supplies.');
  // Reloading: silently ignore shots faster than the weapon allows (no message, no spam).
  if (s.time + 1e-6 < s.nextFlickAt) return no('');
  s.nextFlickAt = s.time + w.reload;
  const c = Math.min(1, Math.max(0, charge));
  const p = perfect && c >= 1;
  if (c > 0.05) s.stats.charged++;
  if (p) s.stats.perfect++;
  fire(s, 'you', chargeMult(c, p), undefined, { charge: c, perfect: p });
  return ok;
}

/** You held the band too long and it snapped: the band is gone and it stung. */
export function snapBand(s: GameState): ActionResult {
  const w = weapon(s);
  s.bands = Math.max(0, s.bands - w.burst);
  s.stats.snapped++;
  s.events.push({ type: 'snap' });
  addSuspicion(s, CHARGE.snapNoise);
  pushTicker(s, 'You held it too long. The band snaps across your knuckles. Ow.');
  return ok;
}

/** The Shooters who join in a Barrage (everyone's on lockdown after you're caught). */
function barrageShooters(s: GameState) {
  return s.time < s.shooterLockUntil || inMeeting(s) ? [] : s.allies.filter((a) => a.role === 'shooter').map((a) => a.id);
}

/** How many bands a Barrage would throw right now: a pocketful each for you and every Shooter. */
export function barrageSize(s: GameState) {
  const cap = BARRAGE.perPerson * (1 + barrageShooters(s).length) * ballBarrageMult(s) * execMult(s, 'warchest');
  return Math.min(Math.floor(s.bands), Math.floor(cap));
}

/** Seconds until your team has reloaded for another Barrage (0 when ready). */
export function barrageCooldown(s: GameState) {
  return Math.max(0, s.barrageAt - s.time);
}

/** Barrages come with your team: from Stage 2 on (rematches too), while there's someone to throw at. */
export function barrageUnlocked(s: GameState) {
  return s.stage >= 2 && !!currentTarget(s);
}

export function canBarrage(s: GameState): ActionResult {
  if (!barrageUnlocked(s) || !currentTarget(s)) return no(s.stage < 2 ? 'You need a team for a Barrage.' : 'There is no one left to flick. For now.');
  if (s.lookBusy) return no('You are at your computer. Press Esc to get back to the war.');
  if (s.time < s.flickLockUntil) return no('You are on a written warning. No flicking for a bit.');
  if (s.time < s.barrageAt) return no(`Everyone’s still reloading (${Math.ceil(barrageCooldown(s))} s).`);
  if (s.bands < BARRAGE.min) return no(`A Barrage takes at least ${BARRAGE.min} bands.`);
  return ok;
}

/**
 * Barrage: you and your Shooters empty your pockets at once. Every band hits like a light
 * stretch, all in one go, so a stockpile turns into one huge volley. Loud, and once a minute.
 */
export function barrage(s: GameState): ActionResult {
  const can = canBarrage(s);
  if (!can.ok) return can;
  const t = currentTarget(s)!;
  const w = weapon(s);
  const m = mods(s);
  const shooters = barrageShooters(s);
  const n = barrageSize(s);
  s.bands -= n;
  let dmg = n * w.damage * BARRAGE.power * (t.damageMult ?? 1) * m.bandDamage * politicsDamage(s) * repDamage(s) * ladderDamage(s);
  const walled = wallUp(s);
  if (walled) dmg = hitWall(s, dmg * wallMult(s, 'barrage'));
  else s.targetResolve -= dmg;
  s.sinceLastHit = 0;
  s.lastShotAt = s.time;
  afterHit(s);
  s.barrageAt = s.time + BARRAGE.cooldown;
  s.stats.barrages = (s.stats.barrages ?? 0) + 1;
  s.stats.barrageDamage = (s.stats.barrageDamage ?? 0) + dmg;
  s.stats.damage += dmg;
  s.events.push({ type: 'barrage', damage: dmg, bands: n, shooters });
  chatEvent(s, 'barrage');
  pushTicker(s, `Barrage! ${n.toLocaleString('en-US')} bands in the air at once. ${t.name.split(' ')[0]} loses ${Math.round(dmg * toughness(s)).toLocaleString('en-US')} Resolve.`);
  const noise = (BARRAGE.noise + BARRAGE.noisePerBand * n) * m.allNoiseMult * m.yourNoiseMult * politicsNoise(s);
  addSuspicion(s, noise);
  if (fightingHr(s)) addEvidence(s, noise * POLITICS.evidence.noiseShare);
  if (!walled && s.targetResolve <= 0) capture(s);
  return ok;
}

/** Grab something from your desk drawer: the good stuff first, unless you pick a band. */
export function scrounge(s: GameState, pick?: 'band' | 'find') {
  return grab(s, pick);
}

/** Pays now; the bands arrive in a box a few seconds later (orders placed meanwhile ride along). */
export function orderSupplies(s: GameState): ActionResult {
  const o = mods(s).order;
  if (s.salary < o.price) return no(`A supply order costs $${o.price}.`);
  s.salary -= o.price;
  s.stats.ordersPlaced++;
  const p = s.supplies;
  if (p.order) p.order.amount += o.amount;
  else p.order = { amount: o.amount, arriveAt: s.time + SUPPLIES.deliverySeconds };
  addSuspicion(s, TUNING.orderNoise);
  return ok;
}

export function setLookBusy(s: GameState, on: boolean): ActionResult {
  s.lookBusy = on;
  if (!on) focusApp(s, null); // back to the war: rounds pause, a call ends
  return ok;
}

export function weaponAvailable(s: GameState, id: WeaponId) {
  const w = WEAPONS.find((w) => w.id === id)!;
  return s.stage >= w.stage && (!w.needsDept || deptTaken(s, w.needsDept));
}

export function buyWeapon(s: GameState, id: WeaponId): ActionResult {
  const w = WEAPONS.find((w) => w.id === id);
  if (!w) return no('Unknown weapon.');
  if (s.ownedWeapons.includes(id)) {
    if (isConfiscated(s, id)) return no('It’s in Mr. Feeney’s drawer. Dale can get it back (D).');
    s.weapon = id;
    return ok;
  }
  if (s.stage < w.stage) return no(`Unlocks in Stage ${w.stage}.`);
  if (!weaponAvailable(s, id)) return no('IT has the parts. Take IT first.');
  if (w.needsEngineer && !mods(s).hasEngineer) return no('Needs someone assigned as Engineer.');
  const price = priceOf(s, w.price);
  if (s.salary < price) return no(`Costs $${price}.`);
  s.salary -= price;
  s.ownedWeapons.push(id);
  s.weapon = id;
  pushTicker(s, `New weapon: ${w.name}.`);
  return ok;
}

export function upgradeAvailable(s: GameState, id: UpgradeId) {
  const u = UPGRADES.find((u) => u.id === id)!;
  if (s.stage < u.stage) return false;
  if (u.unlockAfter && !targetDefeated(s, u.unlockAfter)) return false;
  return true;
}

export function buyUpgrade(s: GameState, id: UpgradeId): ActionResult {
  const u = UPGRADES.find((u) => u.id === id);
  if (!u) return no('Unknown requisition.');
  if (has(s, id)) return no('Already approved.');
  if (!upgradeAvailable(s, id)) return no('Not available yet.');
  const price = priceOf(s, u.price);
  if (s.salary < price) return no(`Costs $${price}.`);
  s.salary -= price;
  s.upgrades.push(id);
  pushTicker(s, `Requisition approved: ${u.name}.`);
  return ok;
}

export function targetDefeated(s: GameState, targetId: string) {
  const idx = TARGETS.findIndex((t) => t.id === targetId);
  return s.stage > 2 || s.targetIndex > idx;
}

export function coworkerAvailable(s: GameState, id: CoworkerId) {
  const c = coworker(id);
  if (c.unlockAfter === 'stage2') return s.stage >= 2;
  return targetDefeated(s, c.unlockAfter);
}

export function recruit(s: GameState, id: CoworkerId): ActionResult {
  const c = coworker(id);
  if (s.allies.some((a) => a.id === id)) return no('Already on your team.');
  if (!coworkerAvailable(s, id)) return no('Not interested yet.');
  if (s.salary < c.cost) return no(`Costs $${c.cost}.`);
  s.salary -= c.cost;
  s.allies.push(newAlly(id, c.traitRole));
  pushEmail(s, c.name, 'Re: Can we talk?', c.joinEmail, 'story');
  pushTicker(s, `${c.name} joins your team as ${roleName(c.traitRole)}.`);
  addSuspicion(s, TUNING.recruitNoise);
  s.events.push({ type: 'recruit', id });
  chatEvent(s, `recruit:${id}`);
  return ok;
}

export function assign(s: GameState, id: CoworkerId, role: Role): ActionResult {
  const a = s.allies.find((a) => a.id === id);
  if (!a) return no('Not on your team.');
  if (role === 'guard' && s.stage !== 4) return no('Guards are for holding the floor (Stage 4).');
  a.role = role;
  a.timer = 0;
  return ok;
}

function roleName(r: Role) {
  return { shooter: 'a Shooter', gatherer: 'a Gatherer', lookout: 'a Lookout', cover: 'Cover', engineer: 'an Engineer', guard: 'a Guard' }[r];
}

// ------------------------------------------------------------------ Dale's black market

/** Dale's goods: every weapon, plus the requisitions Procurement would never approve. */
export const daleSells = (id: UpgradeId) => UPGRADES.find((u) => u.id === id)?.seller === 'dale';

function dealOptions(s: GameState): DaleDeal[] {
  const until = s.time + DALE.dealSeconds;
  const off = () => 1 - randRange(s, DALE.discount[0], DALE.discount[1]);
  const opts: DaleDeal[] = [];
  for (const w of WEAPONS) {
    if (w.price === 0 || s.ownedWeapons.includes(w.id) || !weaponAvailable(s, w.id)) continue;
    if (w.needsEngineer && !mods(s).hasEngineer) continue;
    opts.push({ kind: 'weapon', id: w.id, price: Math.ceil(priceOf(s, w.price) * off()), until, early: false });
  }
  for (const u of UPGRADES) {
    if (u.seller !== 'dale' || has(s, u.id) || u.stage > s.stage + 1) continue;
    const early = !upgradeAvailable(s, u.id);
    opts.push({ kind: 'upgrade', id: u.id, price: Math.ceil(priceOf(s, u.price) * (early ? DALE.earlyMarkup : off())), until, early });
  }
  // Dale reads the room: he leads with things you could actually pay for soon.
  const reachable = opts.filter((o) => o.price <= s.salary * 2 + 40);
  return reachable.length ? reachable : opts;
}

function dealOver(s: GameState, why: 'expired' | 'walkby' | 'taken' | 'passed') {
  s.dale.deal = null;
  s.dale.nextDealAt = s.time + randRange(s, DALE.dealGap[0], DALE.dealGap[1]);
  s.events.push({ type: 'dealGone', why });
}

function stepDale(s: GameState) {
  const d = s.dale;
  if (!d.introduced && s.time >= DALE.introAt) {
    d.introduced = true;
    pushTicker(s, 'Someone slipped a note under your keyboard: "Supply closet. Come alone. —D." (Press D.)');
    chatEvent(s, 'dale:intro');
  }
  if (d.deal) {
    if (s.walkby.arrivesAt !== null) dealOver(s, 'walkby');
    else if (s.time >= d.deal.until) dealOver(s, 'expired');
    return;
  }
  if (s.time < d.nextDealAt || s.lookBusy || s.walkby.arrivesAt !== null || s.war?.closet.raid || s.war?.counter?.attack || s.asks?.current || !currentTarget(s)) return;
  const opts = dealOptions(s);
  if (opts.length === 0) {
    d.nextDealAt = s.time + 60;
    return;
  }
  d.deal = opts[Math.floor(rand(s) * opts.length) % opts.length];
  s.stats.dealsOffered++;
  s.events.push({ type: 'deal' });
}

export function dealName(deal: DaleDeal) {
  return deal.kind === 'weapon' ? WEAPONS.find((w) => w.id === deal.id)!.name : UPGRADES.find((u) => u.id === deal.id)!.name;
}

/** Take Dale up on his offer. */
export function takeDeal(s: GameState): ActionResult {
  const deal = s.dale.deal;
  if (!deal || s.time >= deal.until) return no('Dale’s gone.');
  const owned = deal.kind === 'weapon' ? s.ownedWeapons.includes(deal.id as WeaponId) : has(s, deal.id as UpgradeId);
  if (owned) {
    dealOver(s, 'passed');
    return no('You already have one of those.');
  }
  if (s.salary < deal.price) return no(`Dale wants $${deal.price}. Come back when you’re liquid.`);
  s.salary -= deal.price;
  if (deal.kind === 'weapon') {
    s.ownedWeapons.push(deal.id as WeaponId);
    s.weapon = deal.id as WeaponId;
  } else s.upgrades.push(deal.id as UpgradeId);
  s.stats.dealsTaken++;
  pushTicker(s, `Dale slips you the ${dealName(deal)} for $${deal.price}. You didn’t get it from him.`);
  dealOver(s, 'taken');
  return ok;
}

export function passDeal(s: GameState) {
  if (s.dale.deal) dealOver(s, 'passed');
}

// ------------------------------------------------------------------ offline

/** Applies passive income for time spent away (no fights, no walk-bys). */
export function applyOffline(s: GameState, seconds: number) {
  const secs = Math.min(seconds, offlineCap(s, TUNING.offlineCapSeconds));
  if (secs < 10) return null;
  const wasBusy = s.lookBusy;
  s.lookBusy = false;
  const m = mods(s);
  s.lookBusy = wasBusy;
  const bands = m.bandsPerSec * secs;
  const passive = m.salaryPerSec * secs;
  s.bands += bands;
  s.salary += passive;
  // Your team kept working (and their Performance counts toward your next review).
  const team = staffOffline(s, secs);
  const salary = passive + team;
  s.suspicion = Math.max(0, s.suspicion - (TUNING.baseCool + TUNING.idleCool) * secs);
  // Push the next walk-by out so nobody gets spotted the instant they return.
  s.walkby = { nextAt: Math.max(s.walkby.nextAt, s.time + 30), arrivesAt: null };
  s.work.nextCallAt = Math.max(s.work.nextCallAt, s.time + 30);
  suppliesOffline(s);
  s.dale.deal = null;
  s.dale.nextDealAt = Math.max(s.dale.nextDealAt, s.time + 60);
  asksOffline(s);
  siegeOffline(s);
  politicsOffline(s, secs);
  // Nobody raids the closet while you're away (and one in progress gives up).
  s.war.closet.raid = null;
  s.war.closet.nextAt = Math.max(s.war.closet.nextAt, s.time + 60);
  if (bands >= 1 || salary >= 1) {
    pushEmail(
      s,
      'Out of Office',
      'While you were away',
      `You were gone ${formatDuration(secs)}. Your desk collected ${Math.floor(bands).toLocaleString('en-US')} bands and $${Math.floor(passive).toLocaleString('en-US')}.${team >= 1 ? ` Your team made $${Math.floor(team).toLocaleString('en-US')}.` : ''}${bands >= 100 && ballUnlocked(s) ? ` Wind the bands onto your ball${barrageUnlocked(s) ? ', or save them for a Barrage' : ''}.` : ''}`,
      'flavor',
    );
  }
  return { secs, bands, salary, team };
}

export function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${Math.floor(secs)} s`;
}

export { has };
