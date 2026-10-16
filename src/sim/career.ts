// Your career. Performance comes from things done right at your computer (a clean,
// quick round adds a bonus) and, a little, from your team's work. When the bar fills,
// Mr. Feeney wants to see you: go to your review and you're promoted. Work pays more
// at every rank, some ranks let you hire a new team, and the top is CEO.
//
// The bar stops at full until you show up for the review, so promotions never happen
// while you're away; they wait for you.

import { CAREER, PAY_GRADES, TEAMS } from './content';
import { chatEvent } from './chat';
import { pushEmail, type GameState } from './state';

export const TOP_RANK = PAY_GRADES.length - 1;

/** Performance needed to go from `rank` to the next one. */
export function reviewNeed(rank: number) {
  return Math.round(CAREER.first * Math.pow(CAREER.growth, rank));
}

export function reviewReady(s: GameState) {
  return s.career.rank < TOP_RANK && s.career.review >= reviewNeed(s.career.rank);
}

/** Adds Performance (up to a full bar). Tells you once when the review is ready. */
export function addReview(s: GameState, points: number) {
  const c = s.career;
  if (points <= 0 || c.rank >= TOP_RANK) return;
  const need = reviewNeed(c.rank);
  const was = c.review >= need;
  c.review = Math.min(need, c.review + points);
  if (!was && c.review >= need) {
    s.events.push({ type: 'reviewReady', rank: c.rank + 1 });
    pushEmail(s, 'Mr. Feeney', 'Got a minute?', `Swing by my office when you can. It’s about your performance. (Good news.)`, 'win');
    s.inbox[0].review = true;
  }
}

/** The questions Mr. Feeney asks in a review. Every answer is fine; it's a formality. */
export const REVIEW_QUESTIONS: { q: string; a: [string, string, string]; then: [string, string, string] }[] = [
  { q: 'Where do you see yourself in five years?', a: ['In your chair', 'Right here, synergizing', 'Honestly? Lunch'], then: ['Ha! Bold. I like bold.', 'That’s what I like to hear.', 'Ha! Me too.'] },
  { q: 'What would you say is your greatest weakness?', a: ['I care too much', 'Rubber bands', 'Mondays'], then: ['A classic. Good answer.', '…I’ll pretend I didn’t hear that.', 'Aren’t they everyone’s?'] },
  { q: 'How would your coworkers describe you?', a: ['A team player', 'Hard to hit', 'Present'], then: ['That’s what Gary said. Sort of.', 'Interesting choice of words.', 'Showing up is half the job!'] },
  { q: 'Can you tell me about a time you showed leadership?', a: ['Every day, really', 'I reorganized the supply closet', 'I’d rather not say'], then: ['Love the confidence.', 'Dale mentioned that.', 'Discretion. Very managerial.'] },
  { q: 'What’s one thing you’d change about the office?', a: ['More meetings', 'Better coffee', 'Thicker cubicle walls'], then: ['Music to my ears.', 'Noted. It won’t happen, but noted.', 'Why would you need that?'] },
  { q: 'Are you a self-starter?', a: ['I started myself this morning', 'Absolutely', 'Define “starter”'], then: ['Ha! That counts.', 'I knew it.', 'That’s the spirit, I think.'] },
];

export function reviewQuestion(s: GameState) {
  return REVIEW_QUESTIONS[s.career.rank % REVIEW_QUESTIONS.length];
}

/** Go to your review: you're promoted (if the bar is full). */
export function promote(s: GameState): boolean {
  if (!reviewReady(s)) return false;
  const c = s.career;
  c.rank++;
  c.review = 0;
  const g = PAY_GRADES[c.rank];
  const team = TEAMS.find((t) => t.unlockRank === c.rank);
  const note = team ? ` You can now hire ${/^[aeiou]/i.test(team.title) ? 'an' : 'a'} ${team.title.toLowerCase()} (Staffing).` : '';
  pushEmail(s, 'HR', `Congratulations, ${g.title}!`, `Your promotion to ${g.title} is effective immediately. Your work now pays ×${g.mult}.${note} There is cake in the break room. There was cake in the break room.`, 'win');
  s.events.push({ type: 'promoted', rank: c.rank });
  chatEvent(s, 'promoted');
  return true;
}
