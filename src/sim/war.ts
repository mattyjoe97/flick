// Stage 3: the Department War.
//
// After Rick, the rest of the floor: IT, Accounting, the Mailroom and Marketing. You pick
// who to fight on the map, and can switch whenever you like (each department keeps the
// damage you did). Every department you take gives you something for good and puts the
// others on alert, so they get tougher. Each boss has one trick:
//
//   IT          a firewall goes up now and then and stops half of every shot
//   Accounting  quick taps only hit for half: stretch your shots
//   Mailroom    Big Tony fires back (free bands, but loud)
//   Marketing   Skyler rebrands once, at half Resolve, and gets some back
//
// Dale's supply closet is contested ground meanwhile: it pays you bands while it's yours,
// and the departments you haven't taken sneak in to raid it.
//
// Take all four and Stage 4 begins: the Break Room and the Conference Room, dug in behind
// filing cabinets (see siege.ts for the walls, the rooms' tricks and the counterattacks).
// Picking who to fight, and winning, lives here for both stages. The rematches never stop.

import { addReview, reviewNeed, TOP_RANK } from './career';
import { chatEvent } from './chat';
import { COWORKERS, DEPARTMENTS, ROOMS, SIEGE, WAR, type DeptId, type RoomId } from './content';
import { mods, rolePower } from './mods';
import { rand, randRange } from './rng';
import { fightingRematch, startRematch } from './rematch';
import { currentTarget, deptMax, deptTaken, isDept, isRoom, newWar, pushEmail, pushTicker, roomTaken, type GameState } from './state';
import { fightingRoom, startSiege } from './siege';
import { staffPayPerMin } from './staff';
import { payGrade } from './work';

export const dept = (id: DeptId) => DEPARTMENTS.find((d) => d.dept === id)!;
export const room = (id: RoomId) => ROOMS.find((r) => r.room === id)!;

/** Departments still holding out, in map order. */
export function deptsLeft(s: GameState) {
  return DEPARTMENTS.filter((d) => !deptTaken(s, d.dept));
}

/** The department you're fighting right now, if any. */
export function fightingDept(s: GameState): DeptId | null {
  const f = s.war?.fighting;
  return s.stage === 3 && f && isDept(f) ? f : null;
}

/** Rick's gone: the Department War begins (with IT, until you pick someone on the map). */
export function startWar(s: GameState) {
  s.war = newWar();
  s.war.closet.nextAt = s.time + WAR.closet.firstAt;
  pushEmail(
    s,
    'Mr. Feeney',
    'Org chart update',
    'With Rick working from home indefinitely, the east side of the floor now reports to you. IT, Accounting, the Mailroom and Marketing have asked me to pass on that they "do not recognize this." Please keep it professional.',
    'story',
  );
  load(s, 'it');
  chatEvent(s, 'war:start');
}

/** Puts the fight you're leaving on hold, with whatever Resolve it has left. */
function shelve(s: GameState) {
  const id = fightingDept(s);
  const r = fightingRoom(s);
  if (id) s.war.depts[id].share = Math.max(0, Math.min(1, s.targetResolve / deptMax(s, id)));
  else if (r) s.war.rooms[r].share = Math.max(0, Math.min(1, s.targetResolve / room(r).resolve));
  else if (s.rematch) s.rematch.left = Math.max(0, s.targetResolve);
}

/** Turns your desk toward someone: their Resolve comes back where you left it. */
function load(s: GameState, to: DeptId | RoomId | 'rematch') {
  s.war.fighting = to;
  s.sinceLastHit = 0;
  if (to === 'rematch') {
    if (!s.rematch) startRematch(s, 1, 0);
    s.targetResolve = s.rematch!.left ?? s.rematch!.resolve;
    return;
  }
  if (isRoom(to)) {
    const w = s.war.rooms[to];
    s.targetResolve = w.share * room(to).resolve;
    s.war.coffeeAt = s.time + SIEGE.coffee.every;
    s.war.meetingAt = s.time + SIEGE.meeting.every;
    if (!w.met) {
      w.met = true;
      const info = room(to);
      pushEmail(s, info.intro.from, info.intro.subject, info.intro.body, 'story');
    }
    return;
  }
  const d = s.war.depts[to];
  s.targetResolve = d.share * deptMax(s, to);
  if (to === 'mailroom') s.war.tonyAt = s.time + WAR.tony.every;
  if (!d.met) {
    d.met = true;
    const info = dept(to);
    pushEmail(s, info.intro.from, info.intro.subject, info.intro.body, 'story');
  }
}

export type WarResult = { ok: true } | { ok: false; reason: string };

/** Pick who to fight from the map (a department in Stage 3, a room in Stage 4, or the rematches). */
export function fight(s: GameState, to: DeptId | RoomId | 'rematch'): WarResult {
  if (s.stage < 3) return { ok: false, reason: 'The Department War starts after Rick.' };
  if (s.stage >= 5) return { ok: false, reason: 'The whole floor is yours already.' };
  if (to !== 'rematch') {
    if (isDept(to) && s.stage !== 3) return { ok: false, reason: `${dept(to).label} is already yours.` };
    if (isRoom(to) && s.stage !== 4) return { ok: false, reason: 'Take the four departments first.' };
    if (isDept(to) && deptTaken(s, to)) return { ok: false, reason: `${dept(to).label} is already yours.` };
    if (isRoom(to) && roomTaken(s, to)) return { ok: false, reason: `The ${room(to).label} is already yours.` };
  }
  if (s.war.fighting === to) return { ok: true };
  shelve(s);
  load(s, to);
  const label = to === 'rematch' ? '' : isDept(to) ? dept(to).label : `the ${room(to).label}`;
  pushTicker(s, to === 'rematch' ? 'You turn back to your old rivals for a rematch.' : `You turn your desk toward ${label}. ${(isDept(to) ? dept(to) : room(to as RoomId)).name} sees you coming.`);
  s.events.push({ type: 'fight', id: to });
  return { ok: true };
}

/** What taking a department is worth: its bounty, or ten minutes of your team's pay if that's more. */
export function deptBounty(s: GameState, id: DeptId) {
  return Math.round(Math.max(dept(id).bounty * payGrade(s).mult, staffPayPerMin(s, true) * WAR.bountyMinutes));
}

/** The department you were fighting surrenders. */
export function deptWon(s: GameState) {
  const id = fightingDept(s);
  if (!id) return;
  const d = dept(id);
  const w = s.war.depts[id];
  w.taken = true;
  w.share = 0;
  s.desks += d.desks;
  const bounty = deptBounty(s, id);
  s.salary += bounty;
  s.stats.bounties += bounty;
  s.stats.depts = (s.stats.depts ?? 0) + 1;
  if (s.career.rank < TOP_RANK) addReview(s, reviewNeed(s.career.rank) * WAR.review);
  s.events.push({ type: 'pay', amount: bounty, source: 'bounty', note: d.bountyNote });
  s.events.push({ type: 'capture', targetId: d.id });
  s.events.push({ type: 'deptTaken', id });
  pushEmail(s, d.defeat.from, d.defeat.subject, d.defeat.body, 'win');
  pushTicker(s, `${d.label} surrenders! +${d.desks} desks, and ${d.bountyNote}: +$${bounty.toLocaleString('en-US')}. You get ${d.perk}.`);
  chatEvent(s, `capture:${d.id}`);
  // Whoever was raiding the closet for them gives up.
  if (s.war.closet.raid?.dept === id) s.war.closet.raid = null;

  const left = deptsLeft(s);
  if (left.length) {
    load(s, left[0].dept);
    s.events.push({ type: 'fight', id: left[0].dept });
    pushTicker(s, `The other departments are on alert: they're ${Math.round((WAR.reinforce - 1) * 100)}% tougher now. Next up: ${left[0].label} (or pick on the map).`);
    return;
  }

  // All four departments: Stage 4, Floor Domination.
  s.stats.stage3At = s.time;
  s.stage = 4;
  s.war.closet = { raid: null, nextAt: 0, lostUntil: -999 };
  startSiege(s);
  load(s, 'breakroom');
  pushEmail(s, 'HR', 'Floor 4', 'It has come to our attention that the entire 4th floor now reports to you, apart from the break room and the corner conference room. HR would like to remind everyone that we are neutral, and that we are watching.', 'win');
  pushTicker(s, 'All four departments are yours. Their people have dug in at the Break Room and the Conference Room, behind filing cabinets.');
  s.events.push({ type: 'stage', stage: 4 });
}

/** What taking a room is worth: its bounty, or fifteen minutes of your team's pay if that's more. */
export function roomBounty(s: GameState, id: RoomId) {
  return Math.round(Math.max(room(id).bounty * payGrade(s).mult, staffPayPerMin(s, true) * SIEGE.bountyMinutes));
}

/** The room you were fighting gives up. */
export function roomWon(s: GameState) {
  const id = fightingRoom(s);
  if (!id) return;
  const r = room(id);
  const w = s.war.rooms[id];
  w.taken = true;
  w.share = 0;
  w.wall = 0;
  s.desks += r.desks;
  const bounty = roomBounty(s, id);
  s.salary += bounty;
  s.stats.bounties += bounty;
  s.stats.rooms = (s.stats.rooms ?? 0) + 1;
  if (s.career.rank < TOP_RANK) addReview(s, reviewNeed(s.career.rank) * SIEGE.review);
  s.events.push({ type: 'pay', amount: bounty, source: 'bounty', note: r.bountyNote });
  s.events.push({ type: 'capture', targetId: r.id });
  s.events.push({ type: 'roomTaken', id });
  pushEmail(s, r.defeat.from, r.defeat.subject, r.defeat.body, 'win');
  pushTicker(s, `The ${r.label} is yours! ${r.bountyNote.charAt(0).toUpperCase()}${r.bountyNote.slice(1)}: +$${bounty.toLocaleString('en-US')}. You get ${r.perk}.`);
  chatEvent(s, `capture:${r.id}`);
  const other = ROOMS.find((x) => !roomTaken(s, x.room));
  if (other) {
    load(s, other.room);
    s.events.push({ type: 'fight', id: other.room });
    return;
  }
  // The floor is yours. Stage 5 is next.
  s.stats.stage4At = s.time;
  s.stage = 5;
  s.war.counter = { attack: null, nextAt: 0 };
  s.war.meetingUntil = -999;
  s.war.fighting = 'rematch';
  // Nothing left to guard: Guards go back to what they're best at.
  for (const a of s.allies) if (a.role === 'guard') a.role = COWORKERS.find((c) => c.id === a.id)!.traitRole;
  if (!s.rematch) startRematch(s, 1, 0);
  s.targetResolve = s.rematch!.left ?? s.rematch!.resolve;
  s.sinceLastHit = 0;
  pushEmail(s, 'HR', 'Re: Floor 4', 'The break room and the corner conference room now report to you as well. HR has opened a file. It is a very thick file.', 'win');
  pushTicker(s, 'The whole 4th floor is yours: every desk, the break room and the corner office. HR has opened a file.');
  s.events.push({ type: 'stage', stage: 5 });
}

// ---------------------------------------------------------------- the bosses' tricks

/** IT's firewall: up for the last few seconds of every cycle. */
export function firewallUp(s: GameState) {
  if (fightingDept(s) !== 'it') return false;
  const f = WAR.firewall;
  const t = Math.round(s.time * 10) % (f.every * 10);
  return t >= (f.every - f.up) * 10;
}

/** Seconds until the firewall goes up (or, while it's up, comes down). */
export function firewallClock(s: GameState) {
  const f = WAR.firewall;
  const t = (Math.round(s.time * 10) % (f.every * 10)) / 10;
  return t >= f.every - f.up ? f.every - t : f.every - f.up - t;
}

/** How hard a shot lands on whoever you're fighting (the firewall, Doris and taps). */
export function shotMult(s: GameState, by: 'you' | 'ally', charge: number) {
  let m = 1;
  if (firewallUp(s)) m *= WAR.firewall.mult;
  if (fightingDept(s) === 'accounting' && by === 'you' && charge < WAR.tapBelow) m *= WAR.tapMult;
  // The Break Room's coffee: your own shots hit harder.
  if (by === 'you' && roomTaken(s, 'breakroom')) m *= SIEGE.coffeeShots;
  return m;
}

/** After every hit: Skyler rebrands the first time she drops below half. */
export function afterHit(s: GameState) {
  if (fightingDept(s) !== 'marketing') return;
  const w = s.war.depts.marketing;
  const max = deptMax(s, 'marketing');
  if (w.rebranded || s.targetResolve <= 0 || s.targetResolve >= max * WAR.rebrandAt) return;
  w.rebranded = true;
  s.targetResolve = Math.min(max, s.targetResolve + max * WAR.rebrandBack);
  pushTicker(s, 'Skyler announces a rebrand. New logo, new energy: she gets a quarter of her Resolve back.');
  s.events.push({ type: 'rebrand' });
  chatEvent(s, 'rebrand');
}

// ---------------------------------------------------------------- the supply closet

/** The closet's yours (and paying out bands) unless a raid just got away. */
export { closetIsYours as closetHeld } from './mods';

/** The bands a chased-off raider drops. */
function raidDrop(s: GameState) {
  return Math.max(WAR.closet.dropMin, Math.round(mods(s).bandsPerSec * WAR.closet.dropSeconds));
}

/** Chase the raiders out of the closet: they drop what they grabbed. */
export function chaseRaid(s: GameState): WarResult & { bands?: number } {
  const c = s.war.closet;
  const raid = c.raid;
  if (!raid) return { ok: false, reason: 'Nobody’s in the closet.' };
  const bands = raidDrop(s);
  s.bands += bands;
  c.raid = null;
  c.nextAt = s.time + randRange(s, WAR.closet.gap[0], WAR.closet.gap[1]);
  s.stats.raidsStopped = (s.stats.raidsStopped ?? 0) + 1;
  pushTicker(s, `You chase ${dept(raid.dept).name} out of the supply closet. They drop ${bands.toLocaleString('en-US')} bands on the way out.`);
  s.events.push({ type: 'raidOver', dept: raid.dept, how: 'chased', bands });
  chatEvent(s, 'raid:chased');
  return { ok: true, bands };
}

/** Raids come every few minutes from a department you haven't taken, while you're at war. */
function stepRaids(s: GameState) {
  const c = s.war.closet;
  if (c.raid) {
    if (s.time < c.raid.until) return;
    const raid = c.raid;
    c.raid = null;
    c.nextAt = s.time + randRange(s, WAR.closet.gap[0], WAR.closet.gap[1]);
    const chance = Math.min(WAR.closet.lookoutMax, rolePower(s, 'lookout') * WAR.closet.lookoutEach);
    if (rand(s) < chance) {
      const bands = raidDrop(s);
      s.bands += bands;
      s.stats.raidsStopped = (s.stats.raidsStopped ?? 0) + 1;
      pushTicker(s, `Your Lookouts catch ${dept(raid.dept).short} in the supply closet and walk them out. ${bands.toLocaleString('en-US')} bands recovered.`);
      s.events.push({ type: 'raidOver', dept: raid.dept, how: 'lookout', bands });
      return;
    }
    // They got away: the closet is theirs for a bit, and the bands go back to their department.
    c.lostUntil = s.time + WAR.closet.lost;
    s.stats.raidsLost = (s.stats.raidsLost ?? 0) + 1;
    const w = s.war.depts[raid.dept];
    if (!w.taken) {
      if (fightingDept(s) === raid.dept) s.targetResolve = Math.min(deptMax(s, raid.dept), s.targetResolve + deptMax(s, raid.dept) * WAR.closet.heal);
      else w.share = Math.min(1, w.share + WAR.closet.heal);
    }
    pushTicker(s, `${dept(raid.dept).label} got away with a box of bands. The supply closet is theirs for ${WAR.closet.lost / 60} minutes.`);
    s.events.push({ type: 'raidOver', dept: raid.dept, how: 'lost', bands: 0 });
    chatEvent(s, 'raid:lost');
    return;
  }
  const left = deptsLeft(s);
  if (!left.length || s.time < c.nextAt || s.time < c.lostUntil) return;
  if (s.lookBusy || s.walkby.arrivesAt !== null || s.dale.deal || s.asks?.current || !currentTarget(s)) return;
  const who = left[Math.floor(rand(s) * left.length) % left.length].dept;
  // Someone at the front desk is watching the closet: they're caught on the way in.
  if (s.time < (s.asks?.watchUntil ?? -999)) {
    const bands = raidDrop(s);
    s.bands += bands;
    c.nextAt = s.time + randRange(s, WAR.closet.gap[0], WAR.closet.gap[1]);
    s.stats.raidsStopped = (s.stats.raidsStopped ?? 0) + 1;
    pushTicker(s, `${dept(who).short} from ${dept(who).label} tries to sneak into the supply closet and gets caught at the front desk. ${bands.toLocaleString('en-US')} bands recovered.`);
    s.events.push({ type: 'raidOver', dept: who, how: 'lookout', bands });
    return;
  }
  c.raid = { dept: who, until: s.time + WAR.closet.seconds };
  pushTicker(s, `${dept(who).label} is raiding the supply closet! Chase them off before they get away.`);
  s.events.push({ type: 'raid', dept: who });
}

/** The Department War's clockwork, every step of Stage 3. */
export function stepWar(s: GameState, addSuspicion: (s: GameState, amount: number) => void) {
  if (s.stage !== 3) return;
  // Big Tony fires back while you're fighting him.
  if (fightingDept(s) === 'mailroom' && s.time >= s.war.tonyAt) {
    s.war.tonyAt = s.time + WAR.tony.every;
    if (s.time - s.lastShotAt < 60) {
      s.bands += WAR.tony.bands;
      s.events.push({ type: 'enemyShot' });
      const lines = [
        `Big Tony fires back. ${WAR.tony.bands} bands land on your desk with a thud.`,
        'Tony sends a fistful of bands over the cubicle wall. Return to sender.',
        `A wad of ${WAR.tony.bands} bands hits your monitor. Tony has plenty more.`,
      ];
      pushTicker(s, lines[Math.floor(rand(s) * lines.length) % lines.length]);
      addSuspicion(s, WAR.tony.noise);
    }
  }
  stepRaids(s);
}

/** Saves made before Stage 4 existed that had already taken all four departments: it opens, from your rematch. */
export function siegeForOldSave(s: GameState) {
  s.war.fighting = 'rematch';
  startSiege(s);
}

/** Old saves made in rematch mode: the Department War opens, starting from your rematch. */
export function warForOldSave(s: GameState) {
  s.war = newWar();
  s.war.fighting = 'rematch';
  s.war.closet.nextAt = s.time + WAR.closet.firstAt;
}

export { fightingRematch };
