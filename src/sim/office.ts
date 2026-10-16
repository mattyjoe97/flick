// The office around you: Bailey asleep in her bed by your desk, and office moments.
//
// Bailey hears Mr. Feeney's shoes before you do (a little extra walk-by warning), and
// a scratch behind the ears calms you down. Every few minutes something good happens for
// a few seconds (pizza in the break room, a stray rubber band ball, a spot bonus, Bailey
// finding something, and once your friends work here, Muffins and Joey) and you grab it
// with a tap. Moments are only ever good, and missing one costs nothing.

import { BAILEY, MOMENTS, TEAMS, type MomentKind } from './content';
import { mods } from './mods';
import { randRange, rand } from './rng';
import { currentTarget, pushTicker, type GameState } from './state';
import { leadName, seats, staffPayPerMin } from './staff';
import { payGrade } from './work';

/** What each moment says, and who's in it (for its picture). */
export const MOMENT_TEXT: Record<MomentKind, { title: string; text: string; grab: string }> = {
  pizza: { title: 'Pizza in the break room!', text: 'Everyone works twice as fast for a minute.', grab: 'Grab a slice' },
  ball: { title: 'A rubber band ball rolled out', text: 'From under Gary’s desk. Finders keepers.', grab: 'Grab it' },
  vending: { title: 'The vending machine is stuck', text: 'Free snacks for anyone who shakes it. Calming.', grab: 'Shake it' },
  bonus: { title: 'Spot bonuses!', text: 'Mr. Feeney is handing out envelopes. Look busy.', grab: 'Take one' },
  coffee: { title: 'Fresh pot of coffee', text: 'Your work pays double for a bit.', grab: 'Pour a cup' },
  bailey: { title: 'Bailey found something', text: 'She’s very proud of it. Go see.', grab: 'Good girl!' },
  muffins: { title: 'Muffins is on a desk', text: 'Across the aisle, eyeing a stapler.', grab: 'Let him' },
  joey: { title: 'Joey has a tennis ball', text: 'Mr. Feeney looks… interested.', grab: 'Throw it' },
};

function hired(s: GameState, pet: 'muffins' | 'joey') {
  const t = TEAMS.find((x) => x.pet === pet)!;
  return seats(s, t.id) > 0;
}

/** Which moments can happen right now. */
function possible(s: GameState): MomentKind[] {
  const out: MomentKind[] = ['pizza', 'ball', 'vending', 'bonus', 'coffee', 'bailey'];
  if (hired(s, 'muffins') && currentTarget(s)) out.push('muffins', 'muffins');
  if (hired(s, 'joey')) out.push('joey', 'joey');
  return out;
}

export function stepOffice(s: GameState) {
  const o = s.office;
  if (o.moment && s.time >= o.moment.until) {
    s.events.push({ type: 'momentGone', kind: o.moment.kind });
    o.moment = null;
  }
  // Nothing new while Mr. Feeney is walking up: there's enough going on.
  if (!o.moment && s.time >= o.nextAt && s.walkby.arrivesAt === null) {
    const list = possible(s);
    const kind = list[Math.floor(rand(s) * list.length) % list.length];
    o.moment = { kind, until: s.time + MOMENTS.seconds };
    o.nextAt = s.time + MOMENTS.seconds + randRange(s, MOMENTS.gap[0], MOMENTS.gap[1]);
    s.events.push({ type: 'moment', kind });
  }
}

/** Grab the moment that's up. Returns what happened, or null if there's nothing to grab. */
export function claimMoment(s: GameState): string | null {
  const o = s.office;
  const m = o.moment;
  if (!m || s.time >= m.until) return null;
  o.moment = null;
  s.stats.moments = (s.stats.moments ?? 0) + 1;
  let text = '';
  const bandsFound = () => Math.max(30, Math.round(mods(s).bandsPerSec * MOMENTS.bandsSeconds));
  switch (m.kind) {
    case 'pizza':
      o.pizzaUntil = s.time + MOMENTS.pizzaSeconds;
      text = 'Pizza! Your team works twice as fast, and your work pays more, for a minute.';
      break;
    case 'ball': {
      const n = bandsFound();
      s.bands += n;
      text = `You unwind the ball: +${n} bands.`;
      break;
    }
    case 'vending':
      s.suspicion = Math.max(0, s.suspicion - MOMENTS.vendingCalm);
      text = `Free snacks. Everyone calms down. Suspicion −${MOMENTS.vendingCalm}.`;
      break;
    case 'bonus': {
      const n = Math.round(Math.max(25 * payGrade(s).mult, staffPayPerMin(s, true) * MOMENTS.bonusMinutes));
      s.salary += n;
      text = `A spot bonus: +$${n.toLocaleString('en-US')}.`;
      break;
    }
    case 'coffee':
      s.work.hustleUntil = s.time + MOMENTS.coffeeSeconds;
      text = 'Fresh coffee. Your work pays double for a bit.';
      break;
    case 'bailey': {
      const n = Math.round(bandsFound() * 0.6);
      const cash = Math.round(5 * payGrade(s).mult);
      s.bands += n;
      s.salary += cash;
      text = `Bailey drops a tangle of ${n} rubber bands and $${cash} in loose change at your feet.`;
      break;
    }
    case 'muffins': {
      const t = currentTarget(s);
      if (t) {
        const hit = Math.round(s.targetResolve * MOMENTS.muffinsShare);
        s.targetResolve = Math.max(1, s.targetResolve - hit);
        text = `Muffins knocks ${t.name.split(' ')[0]}’s stapler off the desk. They lose ${hit.toLocaleString('en-US')} Resolve, and their dignity.`;
      } else text = 'Muffins knocks a stapler off an empty desk. Morale improves.';
      break;
    }
    case 'joey':
      s.walkby.nextAt = Math.max(s.walkby.nextAt, s.time) + MOMENTS.joeyDelay;
      s.suspicion = Math.max(0, s.suspicion - MOMENTS.joeyCalm);
      text = `Joey brings Mr. Feeney the ball. And again. And again. He won’t be walking by for a while.`;
      break;
  }
  pushTicker(s, text);
  s.events.push({ type: 'momentClaimed', kind: m.kind, text });
  return text;
}

/** Scratch Bailey behind the ears. Calms you down (not more than once every 20 seconds). */
export function petBailey(s: GameState) {
  const o = s.office;
  const calmed = s.time - o.pettedAt >= BAILEY.petEvery;
  s.stats.pets = (s.stats.pets ?? 0) + 1;
  if (calmed) {
    o.pettedAt = s.time;
    s.suspicion = Math.max(0, s.suspicion - BAILEY.petCalm);
  }
  s.events.push({ type: 'petted', calmed });
  return calmed;
}

/** Who brings which pet to work (for pictures and lines). */
export function petOwner(s: GameState, pet: 'muffins' | 'joey') {
  return leadName(s, TEAMS.find((x) => x.pet === pet)!);
}
