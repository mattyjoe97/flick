// Job Search: the New Job restart. It turns up on your desktop once you've closed HR's case.
//
// The top card is your Reputation (to spend, earned in all, and how much harder it makes
// your bands hit) and what quitting now would add. Then the offers: every other company,
// with its rules, and a two-step "hand in your notice". Then your résumé perks, bought with
// Reputation and kept forever, and the jobs you've left.

import { COMPANIES, LADDER, PERKS, STOCK, type CompanyId } from '../../sim/content';
import { buyPerk, canQuit, offers, perkCost, repDamage, repForRun, stockRep } from '../../sim/job';
import { buyStock, closedAt, stockOpen, stockPrice, tierFloor, tierName } from '../../sim/ladder';
import { company, perk, type GameState } from '../../sim/state';
import { money } from '../format';
import { esc, keyed, type AppCtx, type AppView } from './common';

/** A multiplier as people say it: +64%, or ×12 once it's that big. */
const boost = (mult: number) => (mult >= 10 ? `×${Math.round(mult).toLocaleString('en-US')}` : `+${Math.round((mult - 1) * 100)}%`);

export class JobsApp implements AppView {
  private confirm: CompanyId | null = null;
  private note: { text: string; ok: boolean } | null = null;
  /** Which tier's offers you're looking at (your highest, unless you pick another). */
  private tier: number | null = null;

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
    private hooks: { quit(to: CompanyId, tier: number): void },
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
      else if (d.tier !== undefined) {
        this.tier = Number(d.tier);
        this.confirm = null;
      } else if (d.stock !== undefined) {
        const n = buyStock(s, d.stock === 'max' ? 9999 : 1);
        this.note = n ? { text: `Bought ${n} share${n > 1 ? 's' : ''}.`, ok: true } : { text: `The next share costs ${money(stockPrice(s))}.`, ok: false };
        if (n) this.ctx.sound.stamp();
        else this.ctx.sound.miss();
      } else if (d.quit) {
        this.hooks.quit(d.quit as CompanyId, this.pickedTier(s));
        return;
      }
      this.el.dataset.key = '';
    });
  }

  opened() {
    this.confirm = null;
    this.note = null;
    this.tier = null;
    this.el.dataset.key = '';
  }

  private pickedTier(s: GameState) {
    return Math.min(s.job.top, this.tier ?? s.job.top);
  }

  render(s: GameState) {
    const afford = stockOpen(s) && s.salary >= stockPrice(s);
    const key = [s.job.reputation, repForRun(s), s.stage, JSON.stringify(s.job.perks), this.confirm ?? '', this.note?.text ?? '', this.pickedTier(s), s.job.top, s.stock, afford].join('|');
    keyed(this.el, key, () => this.html(s));
  }

  private html(s: GameState) {
    const rep = repForRun(s);
    const can = canQuit(s);
    const picked = this.pickedTier(s);
    const here = s.job.tier ?? 0;
    const offerCards = offers(s, picked)
      .map((c) => {
        const asking = this.confirm === c.id;
        return `<article class="offer${asking ? ' asking' : ''}">
          <h4>${esc(c.name)}${picked > 0 ? ` <small class="offer-tier">${esc(tierName(picked))}</small>` : ''}</h4>
          <p class="offer-pitch">${esc(c.pitch)}</p>
          <ul>${c.rulesText.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          ${
            asking
              ? `<p class="offer-sure">Quit ${esc(company(s).short)} for ${esc(c.short)}${picked > 0 ? ` (${esc(tierName(picked))})` : ''}? You start over on day one, with +${rep} Reputation.</p>
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
      .map((h) => `<li>${esc(COMPANIES.find((c) => c.id === h.company)!.name)}${h.tier ? ` (${esc(tierName(h.tier))})` : ''}: ${h.minutes} min, reached Stage ${Math.min(h.stage, 6) === 6 ? '5 (case closed)' : h.stage}, +${h.rep.toLocaleString('en-US')} Reputation</li>`)
      .join('');
    // The career ladder: where you are, and how close the next tier is.
    const closed = closedAt(s, s.job.top);
    const ladderNote =
      s.job.top > here
        ? `<b>${esc(tierName(s.job.top))}</b> is recruiting you. Pick it below: everyone there is ${(LADDER.toughness ** (s.job.top - here)).toLocaleString('en-US')}× as tough as here, and a job is worth ${(LADDER.rep ** (s.job.top - here)).toLocaleString('en-US')}× the Reputation.`
        : `Close HR’s case at ${LADDER.closes} jobs here and <b>${esc(tierName(here + 1))}</b> starts recruiting you: ${closed} of ${LADDER.closes} so far.`;
    const tiers =
      s.job.top > 0
        ? `<div class="tier-pick" role="group" aria-label="Which offices">${Array.from({ length: s.job.top + 1 }, (_, i) => `<button type="button" class="win-action${i === picked ? ' strong' : ''}" data-tier="${i}" aria-pressed="${i === picked}">${esc(tierName(i))}</button>`).join('')}</div>
           <p class="case-note">${esc(tierName(picked))}, Floor ${tierFloor(picked)}${picked > 0 ? `: everyone is ${(LADDER.toughness ** picked).toLocaleString('en-US')}× as tough as at a Regional Office, work pays ${Math.round(LADDER.pay ** picked * 100) / 100}× as much, and Reputation is ×${(LADDER.rep ** picked).toLocaleString('en-US')}.` : '.'}</p>`
        : '';
    // Company stock: money now, Reputation when you leave.
    const shares = s.stock ?? 0;
    const price = stockPrice(s);
    const stock = stockOpen(s)
      ? `<section class="case-card stock-card">
          <div class="case-row"><span class="case-label">Company stock</span><b>${shares} share${shares === 1 ? '' : 's'}</b></div>
          <p class="case-note">Every share adds ${Math.round(STOCK.rep * 100)}% to the Reputation this job earns you when you leave${shares ? `: right now +${Math.round(shares * STOCK.rep * 100)}%, ${stockRep(s).toLocaleString('en-US')} of your ${rep.toLocaleString('en-US')}` : ''}. Each one costs more than the last, and they’re cashed in when you go.</p>
          <div class="offer-acts"><button type="button" class="win-action${s.salary >= price ? ' strong' : ''}" data-stock="1" ${s.salary >= price ? '' : 'disabled'}>Buy a share · ${money(price)}</button><button type="button" class="win-action" data-stock="max" ${s.salary >= price ? '' : 'disabled'}>Buy max</button></div>
        </section>`
      : '';
    return `<div class="jobs">
      <section class="case-card rep-card">
        <div class="case-row"><span class="case-label">Reputation</span><b class="case-pd">${s.job.reputation.toLocaleString('en-US')}</b></div>
        <p class="case-note">${s.job.earned.toLocaleString('en-US')} earned in all. Your reputation precedes you: your bands hit ${boost(repDamage(s))} harder${s.job.earned ? '' : ' (every point you earn adds a little)'}.</p>
        <div class="case-row"><span class="case-label">Quit now</span><b>${can.ok ? `+${rep.toLocaleString('en-US')} Reputation` : esc(can.reason)}</b></div>
        <p class="case-note">You earn more the further you get, the higher your title, the more bounties you collected${here > 0 ? `, and the higher the office (×${(LADDER.rep ** here).toLocaleString('en-US')} at ${esc(tierName(here))})` : ''}. You keep Bailey, your ball and your names; everything else stays behind.</p>
      </section>
      ${stock}
      ${this.note ? `<p class="memo-note${this.note.ok ? ' ok' : ''}" role="status">${esc(this.note.text)}</p>` : ''}
      <section class="case-card ladder-card">
        <div class="case-row"><span class="case-label">Career ladder</span><b>${esc(tierName(here))}</b></div>
        <p class="case-note">${ladderNote}</p>
      </section>
      <h3 class="jobs-h">Offers</h3>
      ${tiers}
      <div class="offer-list">${offerCards}</div>
      <h3 class="jobs-h">Your résumé</h3>
      <div class="perk-list">${perkCards}</div>
      ${past ? `<h3 class="jobs-h">Past jobs</h3><ul class="past-jobs">${past}</ul>` : ''}
    </div>`;
  }
}
