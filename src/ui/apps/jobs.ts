// Job Search: the New Job restart. It turns up on your desktop once you've closed HR's case.
//
// The top card is your Reputation (to spend, earned in all, and how much harder it makes
// your bands hit) and what quitting now would add. Then the offers: every other company,
// with its rules, and a two-step "hand in your notice". Then your résumé perks, bought with
// Reputation and kept forever, and the jobs you've left.

import { COMPANIES, PERKS, type CompanyId } from '../../sim/content';
import { buyPerk, canQuit, offers, perkCost, repDamage, repForRun } from '../../sim/job';
import { company, perk, type GameState } from '../../sim/state';
import { esc, keyed, type AppCtx, type AppView } from './common';

export class JobsApp implements AppView {
  private confirm: CompanyId | null = null;
  private note: { text: string; ok: boolean } | null = null;

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
    private hooks: { quit(to: CompanyId): void },
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      const d = b.dataset;
      const s = this.ctx.get();
      if (d.perk) {
        const r = buyPerk(s, d.perk as (typeof PERKS)[number]['id']);
        this.note = r.ok ? { text: `Added to your résumé: ${PERKS.find((p) => p.id === d.perk)!.name}.`, ok: true } : { text: r.reason, ok: false };
        if (r.ok) this.ctx.sound.stamp();
        else this.ctx.sound.miss();
      } else if (d.offer) {
        const can = canQuit(s);
        if (!can.ok) {
          this.note = { text: can.reason, ok: false };
          this.ctx.sound.miss();
        } else this.confirm = d.offer as CompanyId;
      } else if (d.cancel !== undefined) this.confirm = null;
      else if (d.quit) {
        this.hooks.quit(d.quit as CompanyId);
        return;
      }
      this.el.dataset.key = '';
    });
  }

  opened() {
    this.confirm = null;
    this.note = null;
    this.el.dataset.key = '';
  }

  render(s: GameState) {
    const key = [s.job.reputation, repForRun(s), s.stage, JSON.stringify(s.job.perks), this.confirm ?? '', this.note?.text ?? ''].join('|');
    keyed(this.el, key, () => this.html(s));
  }

  private html(s: GameState) {
    const here = company(s);
    const rep = repForRun(s);
    const can = canQuit(s);
    const bonus = Math.round((repDamage(s) - 1) * 100);
    const offerCards = offers(s)
      .map((c) => {
        const asking = this.confirm === c.id;
        return `<article class="offer${asking ? ' asking' : ''}">
          <h4>${esc(c.name)}</h4>
          <p class="offer-pitch">${esc(c.pitch)}</p>
          <ul>${c.rulesText.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          ${
            asking
              ? `<p class="offer-sure">Quit ${esc(here.short)} for ${esc(c.short)}? You start over on day one, with +${rep} Reputation.</p>
                 <div class="offer-acts"><button type="button" class="win-action" data-cancel>Not yet</button><button type="button" class="win-action strong" data-quit="${c.id}">Hand in my notice</button></div>`
              : `<button type="button" class="win-action${can.ok ? ' strong' : ''}" data-offer="${c.id}" ${can.ok ? '' : 'disabled'}>Accept offer</button>`
          }
        </article>`;
      })
      .join('');
    const perkCards = PERKS.map((p) => {
      const level = perk(s, p.id);
      const cost = perkCost(s, p.id);
      const afford = cost !== null && s.job.reputation >= cost;
      return `<article class="perk${level ? ' owned' : ''}">
        <header><b>${esc(p.name)}</b>${p.max > 1 ? `<span class="perk-lv">${level} / ${p.max}</span>` : level ? '<span class="perk-lv">Yours</span>' : ''}</header>
        <p>${esc(p.does)}</p>
        ${cost === null ? '<span class="perk-max">Maxed out</span>' : `<button type="button" class="win-action${afford ? ' strong' : ''}" data-perk="${p.id}" ${afford ? '' : 'disabled'}>${cost} Reputation</button>`}
      </article>`;
    }).join('');
    const past = s.job.history
      .slice()
      .reverse()
      .map((h) => `<li>${esc(COMPANIES.find((c) => c.id === h.company)!.name)}: ${h.minutes} min, reached Stage ${Math.min(h.stage, 6) === 6 ? '5 (case closed)' : h.stage}, +${h.rep} Reputation</li>`)
      .join('');
    return `<div class="jobs">
      <section class="case-card rep-card">
        <div class="case-row"><span class="case-label">Reputation</span><b class="case-pd">${s.job.reputation}</b></div>
        <p class="case-note">${s.job.earned} earned in all. Your reputation precedes you: your bands hit ${bonus}% harder${s.job.earned ? '' : ' (every point you earn adds a little)'}.</p>
        <div class="case-row"><span class="case-label">Quit now</span><b>${can.ok ? `+${rep} Reputation` : esc(can.reason)}</b></div>
        <p class="case-note">You earn more the further you get, the higher your title, and the more bounties you collected at ${esc(here.short)}. You keep Bailey, your ball and your names; everything else stays behind.</p>
      </section>
      ${this.note ? `<p class="memo-note${this.note.ok ? ' ok' : ''}" role="status">${esc(this.note.text)}</p>` : ''}
      <h3 class="jobs-h">Offers</h3>
      <div class="offer-list">${offerCards}</div>
      <h3 class="jobs-h">Your résumé</h3>
      <div class="perk-list">${perkCards}</div>
      ${past ? `<h3 class="jobs-h">Past jobs</h3><ul class="past-jobs">${past}</ul>` : ''}
    </div>`;
  }
}
