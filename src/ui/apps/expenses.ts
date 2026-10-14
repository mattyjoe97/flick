// Expenses: Accounting sends a report; stamp each receipt APPROVED or DENIED by
// today's rule (it changes every morning, and gets an exception once you're senior).
// Your own rubber band order sometimes turns up in the pile. Approving it is free bands,
// and Accounting notices.

import type { GameState } from '../../sim/state';
import { ruleText, stampReceipt, startRound, todaysRule, type Receipt } from '../../sim/work';
import { clockHtml, esc, keyed, money, resultHtml, updateClock, type AppCtx, type AppView } from './common';

export class ExpensesApp implements AppView {
  work = 'expense' as const;
  private hold: { i: number; until: number } | null = null; // the receipt just stamped, shown for a beat
  private outcome: { text: string; ok: boolean } | null = null;
  private showResult = 0;

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-stamp],button[data-start]');
      if (!b || b.disabled) return;
      if (b.dataset.start !== undefined) this.start();
      else this.stamp(b.dataset.stamp === '1');
    });
  }

  private get s() {
    return this.ctx.get();
  }

  private start() {
    if (startRound(this.s, 'expense')) {
      this.outcome = null;
      this.hold = null;
      this.showResult = 0;
      this.ctx.sound.type();
      this.el.dataset.key = '';
    }
  }

  private current(): number {
    const r = this.s.work.rounds.expense;
    return r ? r.receipts!.findIndex((x) => x.state === 'open') : -1;
  }

  private stamp(approve: boolean) {
    const s = this.s;
    const r = s.work.rounds.expense;
    if (!r || this.hold) return;
    const i = this.current();
    if (i < 0) return;
    const res = stampReceipt(s, i, approve);
    if (!res) return;
    this.ctx.sound.stamp();
    if (!res.ok) this.ctx.sound.miss();
    this.outcome = { text: res.text, ok: res.ok };
    this.hold = { i, until: performance.now() + 520 };
    if (!s.work.rounds.expense) this.showResult = r.id;
    this.el.dataset.key = '';
  }

  key(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (!this.s.work.rounds.expense) {
      if (k === 'enter' || k === ' ') {
        this.start();
        return true;
      }
      return false;
    }
    if (k === 'a' || k === 'arrowleft') this.stamp(true);
    else if (k === 'd' || k === 'arrowright') this.stamp(false);
    else return false;
    return true;
  }

  render(s: GameState) {
    const r = s.work.rounds.expense;
    if (this.hold && performance.now() > this.hold.until) {
      this.hold = null;
      this.el.dataset.key = '';
    }
    const last = s.work.last?.kind === 'expense' && s.work.last.id === this.showResult ? s.work.last : null;
    const wait = Math.max(0, Math.ceil(s.work.expenseAt - s.time));
    const key = [r ? `${r.id}:${r.receipts!.map((x) => x.state[0]).join('')}` : '-', this.hold?.i ?? '', last?.id ?? '', wait > 0, Math.floor(s.time / 480), r?.rule?.except ?? todaysRule(s).except].join('|');
    keyed(this.el, key, () => this.html(s, last));
    updateClock(this.el, r);
    const w = this.el.querySelector('.exp-wait');
    if (w) {
      const t = wait > 0 ? `The next report lands in ${wait} s.` : '';
      if (w.textContent !== t) w.textContent = t;
    }
  }

  private receiptHtml(rc: Receipt, cls = '') {
    const stamp = rc.state === 'open' ? '' : `<span class="ink-stamp ${rc.state}">${rc.state === 'approved' ? 'Approved' : 'Denied'}</span>`;
    return `<div class="slip ${cls}${rc.yours ? ' yours' : ''}">
      ${rc.yours ? '<span class="yours-note">← your order</span>' : ''}
      <p class="r-head">${esc(rc.cat.toUpperCase())}</p>
      <p class="r-item">${esc(rc.item)}</p>
      <p class="r-row"><span>Submitted by</span><b>${esc(rc.by)}</b></p>
      <p class="r-total"><span>TOTAL</span><b>${money(rc.amount)}</b></p>
      ${stamp}
    </div>`;
  }

  private html(s: GameState, last: GameState['work']['last']) {
    const r = s.work.rounds.expense;
    const rule = r?.rule ?? todaysRule(s);
    const ruleHtml = `<div class="exp-rule"><span>Today’s rule</span><p>${esc(ruleText(rule))}</p></div>`;
    if (!r) {
      const outcome = this.outcome ? `<p class="outcome ${this.outcome.ok ? 'ok' : 'bad'}">${esc(this.outcome.text)}</p>` : '';
      const ready = s.time >= s.work.expenseAt;
      const card = last
        ? resultHtml(last, { label: 'Next report', data: 'data-start', disabled: !ready })
        : ready
          ? `<div class="start-card"><h3>An expense report from Accounting</h3><p>Stamp each receipt <b>Approved</b> or <b>Denied</b> by today’s rule. The rule changes every morning.</p><button type="button" class="win-action strong" data-start>Open the report <kbd>Enter</kbd></button></div>`
          : '';
      return `<div class="expenses">${ruleHtml}${outcome}${card}<p class="hint exp-wait"></p></div>`;
    }
    const list = r.receipts!;
    const showI = this.hold ? this.hold.i : this.current();
    const cur = list[showI];
    const done = list.filter((x) => x.state !== 'open').length;
    const tray = (state: 'approved' | 'denied') =>
      list
        .map((x, i) => ({ x, i }))
        .filter(({ x, i }) => x.state === state && i !== showI)
        .map(({ x }) => `<span class="mini-receipt ${x.right === false ? 'bad' : ''}">${money(x.amount)}</span>`)
        .join('');
    const pile = list.filter((x, i) => x.state === 'open' && i !== showI).length;
    const outcome = this.outcome ? `<p class="outcome ${this.outcome.ok ? 'ok' : 'bad'}">${esc(this.outcome.text)}</p>` : '<p class="outcome"></p>';
    return `<div class="expenses">${ruleHtml}
      ${clockHtml(`Receipt ${Math.min(done + 1, list.length)} of ${list.length}`)}
      <div class="exp-desk">
        <div class="exp-tray"><h4>Approved</h4>${tray('approved')}</div>
        <div class="exp-current"><div class="slip-stack${pile ? ' piled' : ''}">${cur ? this.receiptHtml(cur, this.hold ? 'just-stamped' : 'fresh') : ''}</div></div>
        <div class="exp-tray"><h4>Denied</h4>${tray('denied')}</div>
      </div>
      <div class="exp-buttons">
        <button type="button" class="stamp-btn approve" data-stamp="1"${this.hold ? ' disabled' : ''}>Approve <kbd>A</kbd></button>
        <button type="button" class="stamp-btn deny" data-stamp="0"${this.hold ? ' disabled' : ''}>Deny <kbd>D</kbd></button>
      </div>
      ${outcome}
    </div>`;
  }
}
