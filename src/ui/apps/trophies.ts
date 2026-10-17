// Trophies: your shelf of achievements. They stay with you from job to job, and every one
// makes your pay a little better and your bands hit a little harder.

import type { GameState } from '../../sim/state';
import { TROPHIES, TROPHY_BONUS, trophyCount } from '../../sim/trophies';
import { esc, keyed, type AppCtx, type AppView } from './common';

/** A little trophy cup: gold if you've won it, a grey outline if not. */
export function cupSvg(won: boolean) {
  const fill = won ? '#e0b13c' : '#d9d5cc';
  const ink = won ? '#5b4512' : '#a8a398';
  return `<svg viewBox="0 0 48 56" aria-hidden="true"><path d="M12 6h24v10c0 9-5 15-12 15S12 25 12 16z" fill="${fill}" stroke="${ink}" stroke-width="2.5"/><path d="M12 10H5c0 8 4 12 8 12M36 10h7c0 8-4 12-8 12" fill="none" stroke="${ink}" stroke-width="2.5"/><rect x="21" y="31" width="6" height="9" fill="${fill}" stroke="${ink}" stroke-width="2.5"/><rect x="13" y="40" width="22" height="8" rx="1.5" fill="${won ? '#8a5a2b' : '#cfcac0'}" stroke="${ink}" stroke-width="2.5"/>${won ? '<path d="M17 11v6" stroke="#fff6d6" stroke-width="3" stroke-linecap="round"/>' : ''}</svg>`;
}

export class TrophiesApp implements AppView {
  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
  ) {}

  opened() {
    this.el.dataset.key = '';
  }

  render(s: GameState) {
    keyed(this.el, Object.keys(s.job.trophies).sort().join(','), () => this.html(s));
  }

  private html(s: GameState) {
    const n = trophyCount(s);
    const items = TROPHIES.map((t) => {
      const won = s.job.trophies[t.id] !== undefined;
      return `<li class="trophy${won ? ' won' : ''}" title="${esc(t.does)}">${cupSvg(won)}<b>${esc(t.name)}</b><small>${esc(t.does)}</small></li>`;
    }).join('');
    void this.ctx;
    return `<div class="trophies">
      <p class="trophy-sum"><b>${n} of ${TROPHIES.length}</b> won. Every trophy: pay +${Math.round(TROPHY_BONUS.pay * 100)}%, bands hit +${Math.round(TROPHY_BONUS.damage * 100)}% harder. Now: pay +${Math.round(TROPHY_BONUS.pay * 100 * n)}%, bands +${Math.round(TROPHY_BONUS.damage * 100 * n)}%. They come with you to every job.</p>
      <ul class="shelf">${items}</ul>
    </div>`;
  }
}
