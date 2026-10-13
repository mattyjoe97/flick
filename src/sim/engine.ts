import { CHARGE, CHATTER, COWORKERS, PROMOTION, ROLES, SHEET_TUNING, TARGETS, TUNING, UPGRADES, WEAPONS, chargeMult, type CoworkerId, type Role, type UpgradeId, type WeaponId } from './content';
import { stepSheet } from './minigame';
import { allyPower, coworker, has, isConfiscated, mods, onFinalWarning, weapon } from './mods';
import { rand, randRange } from './rng';
import { currentTarget, newAlly, pushEmail, pushTicker, type GameState } from './state';
import { isWorking, overdueCount, setSuspicionHook, stepWork } from './work';

// ------------------------------------------------------------------ helpers

/** Adds Suspicion through Lookouts, and triggers getting caught at 100. */
export function addSuspicion(s: GameState, amount: number) {
  const m = mods(s);
  s.suspicion += amount * (1 - m.lookoutCut);
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
  const lost = Math.floor(s.bands * TUNING.caughtBandLoss);
  s.bands -= lost;
  s.suspicion = TUNING.caughtResetTo;
  s.flickLockUntil = s.time + TUNING.caughtFlickLock;
  s.shooterLockUntil = s.time + TUNING.caughtShooterLock;
  s.lookBusy = false;
  s.work.activeId = null;

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
  pushTicker(s, `Caught. Write-up ${s.hr.writeUps} of ${TUNING.writeUpsToFinal}.${takenName ? ` Mr. Feeney keeps your ${takenName}.` : ''}${t && regrouped >= 1 ? ` ${t.name.split(' ')[0]} regroups while you're gone.` : ''}`);
  s.events.push({ type: 'caught', writeUps: s.hr.writeUps, confiscated: taken, lostBands: lost, regrouped });
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
  }
  s.suspicion = 0;
  s.hr = { writeUps: 0, lastWriteUpAt: s.time, confiscated: null };
  s.lookBusy = false;
  s.work.activeId = null;
  s.flickLockUntil = 0;
  s.shooterLockUntil = 0;
  s.walkby = { nextAt: s.time + TUNING.firstWalkby / 2, arrivesAt: null };
  pushEmail(s, 'HR', 'Separation notice', 'Effective immediately, your position has been eliminated. Please return your badge and take only personal items. Security will escort you out.', 'warning');
  pushEmail(s, 'HR', 'Re: Separation notice', 'Please disregard the previous email. Due to a filing error there is no record of your separation, or of you. Welcome back! Your desk is where you left it. The rubber bands are not.', 'story');
  pushTicker(s, `Fired. You carry a box past every desk on the floor. On Monday, HR has lost the paperwork.`);
  s.events.push({ type: 'fired', lostBands, lostDesks, stage: s.stage });
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
  if (s.salary < price) return no(`Lost and Found wants $${price}.`);
  s.salary -= price;
  const w = WEAPONS.find((w) => w.id === c.weapon)!;
  s.hr.confiscated = null;
  s.stats.buyBacks++;
  pushTicker(s, `Lost and Found returns your ${w.name}. The form asked for a description. You wrote "${w.name.split(' ')[0].toLowerCase()}".`);
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
  const dmg = w.damage * w.burst * powerMult * (t.damageMult ?? 1);
  s.targetResolve -= dmg;
  s.sinceLastHit = 0;
  s.lastShotAt = s.time;
  s.stats.shots++;
  s.stats.damage += dmg;
  s.events.push({ type: 'shot', damage: dmg, by, allyId, charge: shot.charge, perfect: shot.perfect });
  const stretch = 1 + CHARGE.noisePerCharge * shot.charge;
  const noise = TUNING.noisePerShot * w.noise * m.allNoiseMult * stretch * (by === 'you' ? m.yourNoiseMult : 1);
  addSuspicion(s, noise);
  if (s.targetResolve <= 0) capture(s);
  return true;
}

function capture(s: GameState) {
  const t = currentTarget(s);
  if (!t) return;
  s.desks += t.desks;
  pushEmail(s, t.defeat.from, t.defeat.subject, t.defeat.body, t.stage === 1 && t.id !== 'gary4' ? 'story' : 'win');
  s.events.push({ type: 'capture', targetId: t.id });
  if (t.desks > 0) pushTicker(s, `${t.name} surrenders. +${t.desks} desk${t.desks > 1 ? 's' : ''} captured.`);
  else pushTicker(s, `${t.name} falls back.`);

  // Newly available coworkers
  for (const c of COWORKERS) {
    if (c.unlockAfter === t.id && c.cost > 0) {
      pushEmail(s, c.name, 'Can we talk?', `${c.who}. Word gets around. I might be interested in joining you, for the right price ($${c.cost}).`, 'story');
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
    pushEmail(s, 'Kevin', 'hi', 'I am the intern. I saw everything. I want in. ($30, or two donuts)', 'story');
    pushEmail(s, 'Marjorie', 'A word', 'I have been here 31 years and I see everything. I could see things for you. ($80)', 'story');
    s.events.push({ type: 'stage', stage: 2 });
    startTarget(s, s.targetIndex + 1);
    addSuspicion(s, TUNING.captureNoise);
    return;
  }

  // End of Stage 2: end of the first slice.
  s.stats.stage2At = s.time;
  s.stage = 3;
  s.targetResolve = 0;
  addSuspicion(s, TUNING.captureNoise);
  pushEmail(s, 'Accounting', 'We have noticed', 'Your department has acquired 400,000 rubber bands this quarter. We will be in touch. Regards, Accounting.', 'win');
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
  // Overdue work: nobody forgets about you while your inbox is overflowing.
  const slacking = overdueCount(s) > 0;
  const cool = (slacking ? 0 : TUNING.baseCool + (idle ? TUNING.idleCool : 0)) + m.coverCool + (s.lookBusy ? TUNING.lookBusyCool : 0);
  s.suspicion = Math.max(0, s.suspicion - cool * dt);
  checkThresholds(s);

  // Allies fire
  const shootersActive = t && !s.lookBusy && s.time >= s.shooterLockUntil;
  let outOfAmmo = false;
  for (const a of s.allies) {
    if (a.role !== 'shooter' || !shootersActive) continue;
    a.timer += dt;
    while (a.timer >= m.allyInterval && currentTarget(s)) {
      a.timer -= m.allyInterval;
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
  if (target && target.stage === 1 && s.time >= s.nextGaryFlickAt) {
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
    if (rand(s) < 0.35) {
      s.bands += 25;
      pushTicker(s, 'A supply shipment arrives addressed to you. 25 bands. Nobody asks.');
    }
  }
  stepHr(s);
  stepAllies(s, dt);
  stepWork(s, dt);
  stepSheet(s);
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
    if (s.lookBusy || isWorking(s)) {
      s.stats.hides++;
      s.suspicion = Math.max(0, s.suspicion - TUNING.hideReward);
      const bonus = 5 * s.stage;
      s.salary += bonus;
      pushTicker(s, `Mr. Feeney glances at your spreadsheet. "Great hustle." Suspicion −${TUNING.hideReward}, +$${bonus}.`);
      s.sheet.hustleUntil = s.time + SHEET_TUNING.hustleWindow;
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
  if (s.stage > 2) return no('There is no one left to flick. For now.');
  if (s.lookBusy) return no('You are looking busy. Close the spreadsheet first.');
  if (s.work.activeId !== null) return no('Finish your task first (or put it down).');
  if (s.time < s.flickLockUntil) return no('You are on a written warning. No flicking for a bit.');
  if (s.bands < weapon(s).burst) return no('Out of bands. Scrounge your drawer or order supplies.');
  return ok;
}

/**
 * Fire your weapon. `charge` (0 to 1) is how far you stretched the band by
 * holding; `perfect` means you let go in the sweet spot at full stretch.
 */
export function flick(s: GameState, charge = 0, perfect = false): ActionResult {
  if (s.stage > 2) return no('There is no one left to flick. For now.');
  if (s.lookBusy) return no('You are looking busy. Close the spreadsheet first.');
  if (s.work.activeId !== null) return no('Finish your task first (or put it down).');
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

export function scrounge(s: GameState): ActionResult {
  const n = mods(s).scrounge;
  s.bands += n;
  s.stats.bandsScrounged += n;
  return ok;
}

export function orderSupplies(s: GameState): ActionResult {
  const o = mods(s).order;
  if (s.salary < o.price) return no(`A supply order costs $${o.price}.`);
  s.salary -= o.price;
  s.bands += o.amount;
  addSuspicion(s, TUNING.orderNoise);
  return ok;
}

export function setLookBusy(s: GameState, on: boolean): ActionResult {
  s.lookBusy = on;
  return ok;
}

export function weaponAvailable(s: GameState, id: WeaponId) {
  const w = WEAPONS.find((w) => w.id === id)!;
  return s.stage >= w.stage;
}

export function buyWeapon(s: GameState, id: WeaponId): ActionResult {
  const w = WEAPONS.find((w) => w.id === id);
  if (!w) return no('Unknown weapon.');
  if (s.ownedWeapons.includes(id)) {
    if (isConfiscated(s, id)) return no('It’s in Mr. Feeney’s drawer. Get it back from Lost and Found.');
    s.weapon = id;
    return ok;
  }
  if (!weaponAvailable(s, id)) return no(`Unlocks in Stage ${w.stage}.`);
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
  return ok;
}

export function assign(s: GameState, id: CoworkerId, role: Role): ActionResult {
  const a = s.allies.find((a) => a.id === id);
  if (!a) return no('Not on your team.');
  a.role = role;
  a.timer = 0;
  return ok;
}

function roleName(r: Role) {
  return { shooter: 'a Shooter', gatherer: 'a Gatherer', lookout: 'a Lookout', cover: 'Cover', engineer: 'an Engineer' }[r];
}

// ------------------------------------------------------------------ offline

/** Applies passive income for time spent away (no fights, no walk-bys). */
export function applyOffline(s: GameState, seconds: number) {
  const secs = Math.min(seconds, TUNING.offlineCapSeconds);
  if (secs < 10) return null;
  const wasBusy = s.lookBusy;
  s.lookBusy = false;
  const m = mods(s);
  s.lookBusy = wasBusy;
  const bands = m.bandsPerSec * secs;
  const salary = m.salaryPerSec * secs;
  s.bands += bands;
  s.salary += salary;
  s.suspicion = Math.max(0, s.suspicion - (TUNING.baseCool + TUNING.idleCool) * secs);
  // Push the next walk-by out so nobody gets spotted the instant they return.
  s.walkby = { nextAt: Math.max(s.walkby.nextAt, s.time + 30), arrivesAt: null };
  s.work.nextAt = Math.max(s.work.nextAt, s.time + 8);
  if (bands >= 1 || salary >= 1) {
    pushEmail(
      s,
      'Out of Office',
      'While you were away',
      `You were gone ${formatDuration(secs)}. Your desk collected ${Math.floor(bands).toLocaleString('en-US')} bands and $${Math.floor(salary).toLocaleString('en-US')}.`,
      'flavor',
    );
  }
  return { secs, bands, salary };
}

export function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${Math.floor(secs)} s`;
}

export { has };
