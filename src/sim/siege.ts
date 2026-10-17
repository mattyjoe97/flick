// Stage 4: Floor Domination.
//
// The departments surrendered, but their people dug in at the floor's last two shared
// spaces: the Break Room (Gail and the Coffee Club) and the Corner Conference Room
// (Victoria Lang, VP of Operations). Both hide behind a wall of filing cabinets with a
// bar of its own: it comes down first, then their Resolve.
//
//   Walls      the Gatling (a drill) and Barrages hit them fully, other shots for half,
//              and your Engineers take them apart on their own
//   Break Room the Coffee Club tops up on coffee every 30 s (unplug their coffee machine)
//   Conference Victoria pulls your Shooters into a meeting every 45 s (start a reply-all storm)
//
// Meanwhile the departments you took try to take their desks back. Guards stop most
// counterattacks; you can push the rest back. One that gets through switches that
// department's prize off for a few minutes. Take both rooms and the floor is yours.
//
// Picking who to fight and winning a room live in war.ts, with the departments.

import { DEPARTMENTS, ROOMS, SIEGE, type DeptId, type RoomId } from './content';
import { mods, rolePower, weapon } from './mods';
import { rand, randRange } from './rng';
import { chatEvent } from './chat';
import { currentTarget, deptPerk, isRoom, perk, pushTicker, type GameState } from './state';
import { staffPayPerMin } from './staff';
import { payGrade } from './work';

const roomOf = (id: RoomId) => ROOMS.find((r) => r.room === id)!;
const deptOf = (id: DeptId) => DEPARTMENTS.find((d) => d.dept === id)!;

/** The room you're fighting right now, if any. */
export function fightingRoom(s: GameState): RoomId | null {
  const f = s.war?.fighting;
  return s.stage === 4 && f && isRoom(f) ? f : null;
}

/** Is there still a wall between you and whoever you're fighting? */
export function wallUp(s: GameState) {
  const r = fightingRoom(s);
  return !!r && s.war.rooms[r].wall > 0;
}

/** How hard a hit lands on a wall: the drill and Barrages fully, anything else for half. */
export function wallMult(s: GameState, kind: 'shot' | 'barrage') {
  return kind === 'barrage' || weapon(s).id === 'gatling' ? 1 : SIEGE.wallShot;
}

/** Knock some of the wall down (it comes down at zero). Returns what it actually took. */
export function hitWall(s: GameState, amount: number) {
  const r = fightingRoom(s);
  if (!r) return 0;
  const w = s.war.rooms[r];
  if (w.wall <= 0) return 0;
  const took = Math.min(w.wall, amount);
  w.wall -= took;
  if (w.wall <= 0.0001) {
    w.wall = 0;
    s.stats.walls = (s.stats.walls ?? 0) + 1;
    s.sinceLastHit = 0;
    pushTicker(s, `The filing-cabinet wall comes down! ${roomOf(r).short} is out in the open.`);
    s.events.push({ type: 'wallDown', id: r });
    chatEvent(s, 'wallDown');
  }
  return took;
}

/** Stage 4 begins: the first counterattack comes a couple of minutes in. */
export function startSiege(s: GameState) {
  s.war.counter = { attack: null, nextAt: s.time + SIEGE.counter.firstAt };
  s.war.meetingUntil = -999;
}

// ---------------------------------------------------------------- the rooms' tricks, and sabotage

/** Is this room's trick shut off by your sabotage right now? */
export function sabotaged(s: GameState, id: RoomId) {
  return s.time < s.war.rooms[id].sabotageUntil;
}

/** Your Shooters are stuck in one of Victoria's meetings. */
export function inMeeting(s: GameState) {
  return s.stage === 4 && s.time < s.war.meetingUntil;
}

/** What a sabotage costs: a few minutes of your team's pay (at least $500 × your pay grade). */
export function sabotageCost(s: GameState) {
  const v = Math.max(500 * payGrade(s).mult, staffPayPerMin(s, true) * SIEGE.sabotageMinutes);
  return Math.round(v / 50) * 50;
}

export type SiegeResult = { ok: true } | { ok: false; reason: string };

/** Unplug the Break Room's coffee machine, or start a reply-all storm on Leadership. */
export function sabotage(s: GameState, id: RoomId): SiegeResult {
  if (s.stage !== 4) return { ok: false, reason: 'Sabotage is for Stage 4.' };
  const w = s.war.rooms[id];
  if (w.taken) return { ok: false, reason: 'That room is yours already.' };
  if (sabotaged(s, id)) return { ok: false, reason: 'It’s already done.' };
  const cost = sabotageCost(s);
  if (s.salary < cost) return { ok: false, reason: `Dale wants $${cost.toLocaleString('en-US')} for that.` };
  s.salary -= cost;
  w.sabotageUntil = s.time + SIEGE.sabotageSeconds;
  if (id === 'conference') s.war.meetingUntil = Math.min(s.war.meetingUntil, s.time);
  s.stats.sabotages = (s.stats.sabotages ?? 0) + 1;
  pushTicker(
    s,
    id === 'breakroom'
      ? 'Dale unplugs the Break Room’s coffee machine and leaves. No coffee for 3 minutes. The Coffee Club is distraught.'
      : 'A reply-all storm hits Leadership: 400 people asking to be removed from the list. No meetings for 3 minutes.',
  );
  s.events.push({ type: 'sabotage', id });
  return { ok: true };
}

// ---------------------------------------------------------------- counterattacks

/** What a pushed-back counterattack drops: a few seconds of your band income. */
function counterDrop(s: GameState) {
  return Math.max(SIEGE.counter.dropMin, Math.round(mods(s).bandsPerSec * SIEGE.counter.dropSeconds));
}

/** Push a counterattack back: your desks stay yours, and they leave their bands behind. */
export function holdLine(s: GameState): SiegeResult & { bands?: number } {
  const c = s.war.counter;
  const a = c.attack;
  if (!a) return { ok: false, reason: 'Nobody’s after your desks right now.' };
  const bands = counterDrop(s);
  s.bands += bands;
  c.attack = null;
  c.nextAt = s.time + randRange(s, SIEGE.counter.gap[0], SIEGE.counter.gap[1]);
  s.stats.countersHeld = (s.stats.countersHeld ?? 0) + 1;
  pushTicker(s, `You hold the line. ${deptOf(a.dept).short}’s people back off and leave ${bands.toLocaleString('en-US')} bands behind.`);
  s.events.push({ type: 'counterOver', dept: a.dept, how: 'held', bands });
  return { ok: true, bands };
}

function stepCounter(s: GameState) {
  const c = s.war.counter;
  if (c.attack) {
    if (s.time < c.attack.until) return;
    // Delegation (a résumé perk): your people hold the line for you.
    if (perk(s, 'delegate')) {
      holdLine(s);
      return;
    }
    const a = c.attack;
    c.attack = null;
    c.nextAt = s.time + randRange(s, SIEGE.counter.gap[0], SIEGE.counter.gap[1]);
    s.war.depts[a.dept].lostUntil = s.time + SIEGE.counter.lost;
    s.stats.countersLost = (s.stats.countersLost ?? 0) + 1;
    pushTicker(s, `${deptOf(a.dept).label} took its desks back! Its prize is off for ${SIEGE.counter.lost / 60} minutes.`);
    s.events.push({ type: 'counterOver', dept: a.dept, how: 'lost', bands: 0 });
    chatEvent(s, 'counterLost');
    return;
  }
  if (s.time < c.nextAt) return;
  if (s.lookBusy || s.walkby.arrivesAt !== null || s.dale.deal || s.asks?.current || !currentTarget(s)) return;
  const pool = DEPARTMENTS.filter((d) => deptPerk(s, d.dept));
  if (!pool.length) {
    c.nextAt = s.time + 60;
    return;
  }
  const who = pool[Math.floor(rand(s) * pool.length) % pool.length].dept;
  const chance = Math.min(SIEGE.counter.guardMax, rolePower(s, 'guard') * SIEGE.counter.guardEach);
  if (rand(s) < chance) {
    const bands = counterDrop(s);
    s.bands += bands;
    c.nextAt = s.time + randRange(s, SIEGE.counter.gap[0], SIEGE.counter.gap[1]);
    s.stats.countersHeld = (s.stats.countersHeld ?? 0) + 1;
    pushTicker(s, `${deptOf(who).label} tries to take its desks back. Your Guards turn them around. ${bands.toLocaleString('en-US')} bands left behind.`);
    s.events.push({ type: 'counterOver', dept: who, how: 'guards', bands });
    return;
  }
  c.attack = { dept: who, until: s.time + SIEGE.counter.seconds };
  pushTicker(s, `${deptOf(who).label} is trying to take its desks back! Hold the line.`);
  s.events.push({ type: 'counter', dept: who });
}

// ---------------------------------------------------------------- every step of Stage 4

export function stepSiege(s: GameState, dt: number) {
  if (s.stage !== 4) return;
  const r = fightingRoom(s);
  if (r) {
    const w = s.war.rooms[r];
    // Your Engineers take the wall apart, bit by bit.
    if (w.wall > 0) {
      const eng = rolePower(s, 'engineer');
      if (eng > 0) hitWall(s, eng * SIEGE.engineerDps * dt);
    }
    // The Coffee Club tops up.
    if (r === 'breakroom' && s.time >= s.war.coffeeAt) {
      s.war.coffeeAt = s.time + SIEGE.coffee.every;
      const max = roomOf(r).resolve;
      if (!sabotaged(s, r) && s.targetResolve < max) {
        s.targetResolve = Math.min(max, s.targetResolve + max * SIEGE.coffee.share);
        s.events.push({ type: 'coffee' });
      }
    }
    // Victoria calls a meeting, and your Shooters have to go.
    if (r === 'conference' && s.time >= s.war.meetingAt) {
      s.war.meetingAt = s.time + SIEGE.meeting.every;
      if (!sabotaged(s, r) && s.allies.some((a) => a.role === 'shooter')) {
        s.war.meetingUntil = s.time + SIEGE.meeting.seconds;
        s.events.push({ type: 'meeting' });
      }
    }
  }
  stepCounter(s);
}

/** Time away: no counterattacks, and nobody's in a meeting when you get back. */
export function siegeOffline(s: GameState) {
  if (!s.war) return;
  s.war.counter.attack = null;
  s.war.counter.nextAt = Math.max(s.war.counter.nextAt, s.time + 60);
  s.war.meetingUntil = -999;
}
