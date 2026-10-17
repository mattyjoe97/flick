// Rematches: once the department is yours, the people you beat keep coming back.
//
// They come one after another (Gary, Brad, the Printer Corner, the Task Force, Rick, and
// once the four departments are yours, the department bosses too), starting at half their old
// Resolve and a third tougher every round after that. Each one is worth a bounty (the old
// one, growing each round and with your pay grade, or a few minutes of your team's pay if
// that's more) and a little Performance toward your next promotion. So the war never just
// ends, and your weapons, the Barrage and the ball always have a use.
//
// During the Department War they're a side option on the map: whoever's up waits, with
// whatever Resolve they had left, while you fight a department.

import { addReview, reviewNeed, TOP_RANK } from './career';
import { chatEvent } from './chat';
import { REMATCH, targetById } from './content';
import { currentTarget, pushTicker, rematchOrder, type GameState } from './state';
import { staffPayPerMin } from './staff';
import { payGrade } from './work';

/** Are you fighting the rematches right now (rather than a department)? */
export function fightingRematch(s: GameState) {
  return s.stage >= 6 || (s.stage >= 3 && s.war.fighting === 'rematch');
}

/** What the `index`th rematch of `round` is like: how tough, and what it pays. */
export function rematchStats(s: GameState, round: number, index: number) {
  const id = rematchOrder(s)[index];
  const base = targetById(id)!;
  const resolve = Math.round(base.resolve * REMATCH.first * Math.pow(REMATCH.growth, round - 1));
  const old = base.bounty * (1 + REMATCH.bountyGrowth * (round - 1)) * payGrade(s).mult;
  const team = staffPayPerMin(s, true) * (REMATCH.bountyMinutes[REMATCH.order.indexOf(id)] ?? 1);
  return { resolve, bounty: Math.round(Math.max(old, team)) };
}

/** What beating the current rematch pays: whichever is more, what it was worth when it walked up or what it's worth now (your team grows while you're busy elsewhere). */
export function rematchBounty(s: GameState) {
  const r = s.rematch;
  if (!r) return 0;
  return Math.max(r.bounty, rematchStats(s, r.round, r.index).bounty);
}

/** The next one walks up. */
export function startRematch(s: GameState, round: number, index: number) {
  const st = rematchStats(s, round, index);
  s.rematch = { round, index, resolve: st.resolve, bounty: st.bounty, left: st.resolve };
  const id = rematchOrder(s)[index];
  if (fightingRematch(s)) {
    s.targetResolve = st.resolve;
    s.sinceLastHit = 999;
    if (id === 'rick') s.nextReviewAt = s.time + 30;
    const line = REMATCH.lines[id];
    pushTicker(s, `${line.intro}${round > 1 ? ` (Round ${round}.)` : ''}`);
  }
  s.events.push({ type: 'rematch', round, index });
}

/** You won a rematch: the bounty, a bit of Performance, and the next one. */
export function rematchWon(s: GameState) {
  const r = s.rematch;
  const t = currentTarget(s);
  if (!r || !t) return;
  const bounty = rematchBounty(s);
  s.salary += bounty;
  s.stats.bounties += bounty;
  s.stats.rematches = (s.stats.rematches ?? 0) + 1;
  const share = REMATCH.review[REMATCH.order.indexOf(t.id)] ?? 0.02;
  if (s.career.rank < TOP_RANK) addReview(s, reviewNeed(s.career.rank) * share);
  s.events.push({ type: 'pay', amount: bounty, source: 'bounty', note: t.bountyNote });
  s.events.push({ type: 'capture', targetId: t.id });
  pushTicker(s, `${REMATCH.lines[t.id].defeat} You find ${t.bountyNote}: +$${bounty.toLocaleString('en-US')}, and Performance.`);
  if (s.stats.rematches === 1) chatEvent(s, 'rematch');
  const last = r.index >= rematchOrder(s).length - 1;
  startRematch(s, last ? r.round + 1 : r.round, last ? 0 : r.index + 1);
}

/** Old saves (and the moment the war ends): someone is always up for a rematch. */
export function stepRematch(s: GameState) {
  if (s.stage >= 3 && !s.rematch) startRematch(s, 1, 0);
  // One that's been waiting a while is worth what your team makes now, not back then.
  else if (s.rematch) s.rematch.bounty = rematchBounty(s);
}
