// Corporate Challenges: today's three (real-world days), how far along each is, what they pay,
// and your streak of days with all three done.

import { challenge, challengeCash, DAILY, fullDayRep } from '../../sim/daily';
import type { GameState } from '../../sim/state';
import { esc, keyed, money, type AppCtx, type AppView } from './common';

export class ChallengesApp implements AppView {
  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
  ) {}

  opened() {
    this.el.dataset.key = '';
    const d = this.ctx.get().daily;
    if (d) d.fresh = false;
  }

  render(s: GameState) {
    const d = s.daily;
    const cash = challengeCash(s);
    // Cash is rounded so it doesn't redraw every tick as your pay creeps up.
    const key = [d.day, d.streak, d.lastFull, ...d.list.map((g) => `${g.done}${g.paid ? 'p' : ''}`), cash.toPrecision(2), fullDayRep(s)].join('|');
    keyed(this.el, key, () => this.html(s, cash));
  }

  private html(s: GameState, cash: number) {
    const d = s.daily;
    if (!d.list.length) {
      return `<div class="challenges"><p class="ch-empty">Corporate sends three challenges every day. The first ones arrive once the war really gets going (Stage 2).</p></div>`;
    }
    const doneToday = d.lastFull === d.day;
    const rows = d.list
      .map((g) => {
        const c = challenge(g.id)!;
        const share = Math.min(1, g.done / c.target);
        return `<li class="ch-row${g.paid ? ' done' : ''}">
          <span class="ch-box" aria-hidden="true">${g.paid ? '✓' : ''}</span>
          <span class="ch-text"><b>${esc(c.text)}</b>
            <span class="ch-bar"><i style="width:${(share * 100).toFixed(1)}%"></i></span>
            <small>${Math.min(g.done, c.target)} / ${c.target}${g.paid ? ' · paid' : ` · pays ${money(cash)}`}</small></span>
        </li>`;
      })
      .join('');
    const streak = Math.min(DAILY.streakCap, d.streak);
    const week = Array.from({ length: DAILY.streakCap }, (_, i) => `<i class="${i < streak ? 'on' : ''}"></i>`).join('');
    const all = doneToday
      ? `All three done today. Paid ${fullDayRep(s)} Reputation. New ones tomorrow.`
      : `All three today: <b>+${fullDayRep(s)} Reputation</b>${d.streak > 0 ? ` (day ${d.streak + 1} in a row)` : ''}.`;
    return `<div class="challenges">
      <p class="ch-head">Today’s challenges <small>New ones every day. Only what you do after they arrive counts.</small></p>
      <ul class="ch-list">${rows}</ul>
      <p class="ch-all">${all}</p>
      <div class="ch-streak"><span>Streak: <b>${d.streak} day${d.streak === 1 ? '' : 's'}</b></span><span class="ch-week" aria-hidden="true">${week}</span></div>
      <p class="ch-note">Every day in a row you finish all three pays more Reputation, up to ${DAILY.streakCap}× at a week. Miss a day and it starts over.</p>
    </div>`;
  }
}
