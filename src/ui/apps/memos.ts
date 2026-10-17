// Memos (Stage 5): office policy, paid for with Plausible Deniability.
//
// The top card is the investigation: your Deniability (and what earns it), HR's goodwill
// toward you (send enough memos and the case closes) and HR's case file (fill it and HR
// takes one of your departments). Below it, the memos you can send, each a sheet of paper
// with what it does, what it costs, and whether it's in force, cooling down or ready.

import { setFill } from '../fill';
import { HR_DIRECTOR, MEMOS, POLITICS, type MemoId } from '../../sim/content';
import { canSendMemo, memoCooldown, pdPerMin, sendMemo } from '../../sim/politics';
import type { GameState } from '../../sim/state';
import { esc, keyed, type AppCtx, type AppView } from './common';

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

export class MemosApp implements AppView {
  private note: { text: string; ok: boolean } | null = null;

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
    private hooks: { sent(id: MemoId): void },
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-memo]');
      if (!b || b.disabled) return;
      const id = b.dataset.memo as MemoId;
      const r = sendMemo(this.ctx.get(), id);
      if (r.ok) {
        this.note = { text: `Sent: ${MEMOS.find((m) => m.id === id)!.name}.`, ok: true };
        this.ctx.sound.stamp();
        this.hooks.sent(id);
      } else {
        this.note = { text: r.reason, ok: false };
        this.ctx.sound.miss();
      }
      this.el.dataset.key = '';
    });
  }

  opened() {
    this.note = null;
    this.el.dataset.key = '';
  }

  render(s: GameState) {
    if (s.stage !== 5 || !s.war?.politics) {
      keyed(this.el, 'closed', () => `<div class="memos"><p class="memo-empty">HR isn’t investigating anyone. Yet.</p></div>`);
      return;
    }
    const p = s.war.politics;
    // Rebuild when a memo changes state (ready, in force, cooling down, affordable); the numbers tick in place.
    const key = [MEMOS.map((m) => `${m.id}:${p.memos[m.id].until > s.time ? 'on' : ''}${memoCooldown(s, m.id) > 0 ? 'cd' : ''}${p.pd >= m.cost ? '$' : ''}`).join(','), this.note?.text ?? ''].join('|');
    keyed(this.el, key, () => this.html(s));
    this.tick(s);
  }

  private html(s: GameState) {
    const p = s.war.politics;
    const cards = MEMOS.map((m) => {
      const on = p.memos[m.id].until > s.time;
      const cd = memoCooldown(s, m.id);
      const can = canSendMemo(s, m.id).ok;
      const state = on ? `<b class="memo-on">In force <span data-memo-on="${m.id}"></span></b>` : cd > 0 ? `<span class="memo-cd">Ready in <span data-memo-cd="${m.id}"></span></span>` : '';
      return `<article class="memo${on ? ' on' : ''}">
        <header><span class="memo-to">To: All Staff</span><span class="memo-cost">${m.cost} Deniability</span></header>
        <h4>${esc(m.name)}</h4>
        <p>${esc(m.does)}</p>
        <footer>${state}<button type="button" class="win-action${can ? ' strong' : ''}" data-memo="${m.id}" ${can ? '' : 'disabled'}>Send</button></footer>
      </article>`;
    }).join('');
    return `<div class="memos">
      <section class="case-card">
        <div class="case-row"><span class="case-label">Plausible Deniability</span><b class="case-pd" data-pd></b></div>
        <p class="case-note">Earned by real work: rounds you finish (A +${POLITICS.pd.grade.A}, B +${POLITICS.pd.grade.B}), Cover teammates and your teams (<span data-pd-rate></span> a minute).</p>
        <div class="case-row"><span class="case-label">HR goodwill</span><span class="perf case-bar good"><span class="perf-fill" data-goodwill-fill></span><b data-goodwill></b></span></div>
        <p class="case-note">Every memo you send counts. At ${POLITICS.goodwill}, HR closes the case on you, no fight needed. (Or flick ${esc(HR_DIRECTOR.name.split(' ')[0])}’s Resolve to nothing.)</p>
        <div class="case-row"><span class="case-label">HR’s case file</span><span class="perf case-bar evidence"><span class="perf-fill" data-evidence-fill></span><b data-evidence></b></span></div>
        <p class="case-note">Fills when you get caught, when you’re loud around HR, and when you miss an interview. If it fills, HR takes one of your departments.</p>
      </section>
      ${this.note ? `<p class="memo-note${this.note.ok ? ' ok' : ''}" role="status">${esc(this.note.text)}</p>` : ''}
      <div class="memo-list">${cards}</div>
    </div>`;
  }

  /** The numbers that change every frame, updated in place. */
  private tick(s: GameState) {
    const p = s.war.politics;
    const set = (sel: string, v: string) => {
      const el = this.el.querySelector(sel);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set('[data-pd]', String(Math.floor(p.pd)));
    set('[data-pd-rate]', `+${pdPerMin(s).toFixed(1)}`);
    set('[data-goodwill]', `${Math.floor(p.goodwill)} / ${POLITICS.goodwill}`);
    set('[data-evidence]', `${Math.round(p.evidence)}%`);
    const gw = this.el.querySelector<HTMLElement>('[data-goodwill-fill]');
    setFill(gw, p.goodwill / POLITICS.goodwill);
    const ev = this.el.querySelector<HTMLElement>('[data-evidence-fill]');
    setFill(ev, p.evidence / 100);
    for (const m of MEMOS) {
      set(`[data-memo-on="${m.id}"]`, clock(Math.max(0, p.memos[m.id].until - s.time)));
      set(`[data-memo-cd="${m.id}"]`, clock(memoCooldown(s, m.id)));
    }
  }
}
