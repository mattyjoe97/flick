// Mr. Feeney's office: sneak in while he's out walking the floor.
//
//   His desk      search it (4 s) for whatever he's left lying around: petty cash, a pile of
//                 bands he's confiscated from someone, a write-up you can shred, or his
//                 calendar (book him into a meeting and his next round comes later). It takes
//                 him a while to leave something new.
//   His drawer    jimmy it open (6 s) and take back what he took from you: the bands he
//                 confiscated when he caught you, and your weapon if it's still in there.
//   His computer  peek at his calendar (3 s): for the next ten minutes you know exactly when
//                 his next round is.
//
// The catch: if his footsteps start while you're in there, he's on his way back. Slip out in
// time (straight onto your computer, like nothing happened) or he finds you in his office.
// A Fire Drill empties the floor: the safest time to snoop.

import { rand } from './rng';
import { payGrade } from './work';
import { jobPayMult } from './job';
import { staffPayPerMin } from './staff';
import { mods } from './mods';
import { pushTicker, type GameState } from './state';
import { WEAPONS } from './content';

export type SnoopId = 'desk' | 'drawer' | 'calendar';

export const SNOOP = {
  seconds: { desk: 4, drawer: 6, calendar: 3 } as Record<SnoopId, number>,
  deskRestock: 480, // seconds before there's something new on his desk
  calendarEvery: 600,
  peekSeconds: 600,
  cashMinutes: 5, // of your team's steady pay
  cashMin: 150, // times your pay grade
  bandsSeconds: 240, // of your bands per second
  bandsMin: 300,
  meeting: 180, // seconds his next round is pushed back
  shred: 0.15, // chance the desk has one of your write-ups (if you have any)
};

export interface FeeneyState {
  inside: boolean;
  busy: { what: SnoopId; until: number } | null;
  deskAt: number;
  calendarAt: number;
  /** You know when his rounds are until then. */
  peekUntil: number;
  /** Bands he's confiscated from you (in his drawer). */
  seized: number;
}

export function newFeeney(): FeeneyState {
  return { inside: false, busy: null, deskAt: 0, calendarAt: 0, peekUntil: -999, seized: 0 };
}

export type SnoopResult = { ok: true; text: string } | { ok: false; reason: string };

export function officeUnlocked(s: GameState) {
  return s.stage >= 2 || (s.job?.runs ?? 0) >= 1;
}

/** Why you can't go in right now (null when you can). */
export function officeClosed(s: GameState): string | null {
  if (!officeUnlocked(s)) return 'You don’t know which office is his yet.';
  if (s.walkby.arrivesAt !== null) return 'Not now: he’s out there, and he’s coming this way.';
  if (s.lookBusy) return 'Get up from your computer first.';
  return null;
}

export function inOffice(s: GameState) {
  return !!s.feeney?.inside;
}

export function enterOffice(s: GameState): SnoopResult {
  const closed = officeClosed(s);
  if (closed) return { ok: false, reason: closed };
  s.feeney.inside = true;
  s.feeney.busy = null;
  s.events.push({ type: 'office', inside: true });
  return { ok: true, text: 'You slip into Mr. Feeney’s office. Listen for footsteps.' };
}

/** Leave: back to your desk, or (with his footsteps coming) straight onto your computer. */
export function leaveOffice(s: GameState): 'desk' | 'computer' | null {
  if (!inOffice(s)) return null;
  s.feeney.inside = false;
  s.feeney.busy = null;
  s.events.push({ type: 'office', inside: false });
  return s.walkby.arrivesAt !== null ? 'computer' : 'desk';
}

/** Can you do this one now (and if not, why)? */
export function snoopBlocked(s: GameState, what: SnoopId): string | null {
  const f = s.feeney;
  if (!f.inside) return 'You’re not in his office.';
  if (f.busy) return 'One thing at a time.';
  if (what === 'desk' && s.time < f.deskAt) return `Nothing new on his desk. Check back in ${Math.ceil((f.deskAt - s.time) / 60)} min.`;
  if (what === 'drawer' && !drawerHas(s)) return 'His drawer has nothing of yours in it. (Yet.)';
  if (what === 'calendar' && s.time < f.calendarAt) return `You’ve seen his calendar. Look again in ${Math.ceil((f.calendarAt - s.time) / 60)} min.`;
  return null;
}

export function drawerHas(s: GameState) {
  return (s.feeney?.seized ?? 0) >= 1 || !!s.hr.confiscated;
}

export function startSnoop(s: GameState, what: SnoopId): SnoopResult {
  const blocked = snoopBlocked(s, what);
  if (blocked) return { ok: false, reason: blocked };
  s.feeney.busy = { what, until: s.time + SNOOP.seconds[what] };
  return { ok: true, text: what === 'desk' ? 'Rifling through his desk…' : what === 'drawer' ? 'Working the lock with a paperclip…' : 'Wiggling his mouse…' };
}

/** How far along the thing you're doing is (0 to 1), or null. */
export function snoopProgress(s: GameState) {
  const b = s.feeney?.busy;
  if (!b) return null;
  return Math.min(1, 1 - (b.until - s.time) / SNOOP.seconds[b.what]);
}

/** You know his schedule: seconds until his next round (null if you don't). */
export function nextRoundKnown(s: GameState) {
  if (!s.feeney || s.time >= s.feeney.peekUntil) return null;
  return s.walkby.arrivesAt !== null ? 0 : Math.max(0, s.walkby.nextAt - s.time);
}

/** He caught you taking bands: they go in his drawer. */
export function seize(s: GameState, bands: number) {
  if (s.feeney && bands > 0) s.feeney.seized += Math.floor(bands);
}

function finish(s: GameState, what: SnoopId) {
  const f = s.feeney;
  f.busy = null;
  s.stats.snoops = (s.stats.snoops ?? 0) + 1;
  let text = '';
  if (what === 'calendar') {
    f.calendarAt = s.time + SNOOP.calendarEvery;
    f.peekUntil = s.time + SNOOP.peekSeconds;
    text = 'You’ve got his calendar: for the next 10 minutes you know exactly when his next round is.';
  } else if (what === 'drawer') {
    const bands = Math.floor(f.seized);
    const gun = s.hr.confiscated;
    f.seized = 0;
    s.bands += bands;
    if (gun) s.hr.confiscated = null;
    const name = gun ? WEAPONS.find((w) => w.id === gun.weapon)!.name : null;
    text = `Got it open. ${bands >= 1 ? `${bands.toLocaleString('en-US')} of your bands` : ''}${bands >= 1 && name ? ' and ' : ''}${name ? `your ${name}` : ''}: back where they belong.`;
    pushTicker(s, 'Mr. Feeney’s desk drawer is lighter than he left it.');
  } else {
    f.deskAt = s.time + SNOOP.deskRestock;
    const roll = rand(s);
    const shred = s.hr.writeUps > 0 && roll < SNOOP.shred;
    if (shred) {
      s.hr.writeUps--;
      text = 'One of your write-ups, waiting to go to HR. Into the shredder it goes. One fewer in your file.';
      pushTicker(s, 'HR can’t find one of your write-ups. Nobody knows where it went.');
    } else if (roll < 0.35) {
      const cash = Math.round(Math.max(SNOOP.cashMin * payGrade(s).mult * jobPayMult(s), staffPayPerMin(s, true) * SNOOP.cashMinutes));
      s.salary += cash;
      s.events.push({ type: 'pay', amount: cash, source: 'bounty', note: 'his petty cash' });
      text = `His petty cash tin. +$${cash.toLocaleString('en-US')}. He’ll blame accounting.`;
    } else if (roll < 0.7) {
      const bands = Math.round(Math.max(SNOOP.bandsMin, mods(s).bandsPerSec * SNOOP.bandsSeconds));
      s.bands += bands;
      text = `A shoebox of bands he confiscated from somebody else. +${bands.toLocaleString('en-US')} bands.`;
    } else {
      if (s.walkby.arrivesAt === null) s.walkby.nextAt = Math.max(s.walkby.nextAt, s.time) + SNOOP.meeting;
      text = 'His calendar’s open. You book him into a three-minute “Quick Sync” with nobody: his next round comes later.';
    }
  }
  s.events.push({ type: 'snooped', what, text });
}

/** Every step: finish what you're doing. (Him walking in on you is in the walk-by code.) */
export function stepFeeney(s: GameState) {
  const f = s.feeney;
  if (!f?.inside || !f.busy) return;
  if (s.time >= f.busy.until) finish(s, f.busy.what);
}

/** He's back: you're still in his office. */
export function caughtInOffice(s: GameState) {
  s.feeney.inside = false;
  s.feeney.busy = null;
  s.stats.officeCaught = (s.stats.officeCaught ?? 0) + 1;
  s.events.push({ type: 'office', inside: false });
  s.events.push({ type: 'officeCaught' });
  pushTicker(s, 'Mr. Feeney opens his office door. You’re standing behind his desk. “…Can I help you?”');
}

/** Saves: you're never inside his office when you load. */
export function feeneyForLoad(saved: Partial<FeeneyState> | undefined): FeeneyState {
  const f = { ...newFeeney(), ...(saved ?? {}), inside: false, busy: null };
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  f.deskAt = num(f.deskAt, 0);
  f.calendarAt = num(f.calendarAt, 0);
  f.peekUntil = num(f.peekUntil, -999);
  f.seized = Math.max(0, Math.floor(num(f.seized, 0)));
  return f;
}
