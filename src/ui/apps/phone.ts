// Phone: pick up, listen, and put the caller through to the right extension. The
// directory gets reshuffled every morning, so read it. Some callers want you
// ("Speaking"), some are pranks (hang up), and sometimes it's Mr. Feeney checking in.

import type { GameState } from '../../sim/state';
import { answerCall, answerPhone, directory, type CallAnswer } from '../../sim/work';
import { CALLERS, DEPARTMENTS, PEOPLE } from '../../sim/workdata';
import { clockHtml, esc, keyed, resultHtml, updateClock, type AppCtx, type AppView } from './common';

export class PhoneApp implements AppView {
  work = 'call' as const;
  private outcome: { text: string; ok: boolean } | null = null;
  private showResult = 0;

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-ext],button[data-call]');
      if (!b || b.disabled) return;
      if (b.dataset.ext) this.answer({ act: 'transfer', ext: Number(b.dataset.ext) });
      else if (b.dataset.call === 'answer') this.pickUp();
      else if (b.dataset.call === 'self') this.answer({ act: 'self' });
      else if (b.dataset.call === 'hangup') this.answer({ act: 'hangup' });
    });
  }

  private get s() {
    return this.ctx.get();
  }

  /** Pick up the ringing phone (from here, the desk phone, or W). */
  pickUp() {
    if (answerPhone(this.s)) {
      this.outcome = null;
      this.showResult = 0;
      this.el.dataset.key = '';
    }
  }

  private answer(a: CallAnswer) {
    const s = this.s;
    const r = s.work.rounds.call;
    if (!r) return;
    const res = answerCall(s, a);
    if (!res) return;
    this.outcome = { text: res.text, ok: res.ok };
    this.showResult = r.id;
    if (!res.ok) this.ctx.sound.miss();
    else this.ctx.sound.type();
    this.el.dataset.key = '';
  }

  key(e: KeyboardEvent): boolean {
    const s = this.s;
    const k = e.key.toLowerCase();
    if (s.work.rounds.call) {
      const n = Number(e.key);
      if (n >= 1 && n <= 9) this.answer({ act: 'transfer', ext: n });
      else if (k === 's') this.answer({ act: 'self' });
      else if (k === 'h') this.answer({ act: 'hangup' });
      else return false;
      return true;
    }
    if (s.work.ringing && (k === 'enter' || k === ' ' || k === 'w')) {
      this.pickUp();
      return true;
    }
    return false;
  }

  render(s: GameState) {
    const r = s.work.rounds.call;
    const last = s.work.last?.kind === 'call' && s.work.last.id === this.showResult ? s.work.last : null;
    const day = Math.floor(s.time / 480);
    keyed(this.el, [r?.id ?? '', !!s.work.ringing, last?.id ?? '', day, s.stats.callsMissed].join('|'), () => this.html(s, last));
    updateClock(this.el, r);
  }

  private html(s: GameState, last: GameState['work']['last']) {
    const r = s.work.rounds.call;
    const dir = directory(s);
    const byExt = [...DEPARTMENTS].sort((a, b) => dir[a] - dir[b]);
    const directoryHtml = `<aside class="phone-dir" aria-label="Today's phone directory">
      <h3>Directory <small>(updated this morning)</small></h3>
      <ul class="dir-depts">${byExt.map((d) => `<li><span>${d}</span><b>${dir[d]}</b></li>`).join('')}</ul>
      <h4>People</h4>
      <ul class="dir-people">${Object.entries(PEOPLE)
        .map(([name, dept]) => `<li><span>${name}</span><i>${dept}</i></li>`)
        .join('')}</ul>
    </aside>`;
    let main = '';
    if (r) {
      const c = CALLERS[r.caller!];
      main = `<div class="phone-lcd on">LINE 1 · CONNECTED</div>
        <p class="caller"><span class="caller-tag">On the line:</span> “${esc(c.line)}”</p>
        ${clockHtml('Their patience')}
        <div class="phone-pad" role="group" aria-label="Transfer to extension">${[1, 2, 3, 4, 5, 6, 7, 8, 9]
          .map((n) => `<button type="button" class="key" data-ext="${n}">${n}</button>`)
          .join('')}</div>
        <div class="phone-more">
          <button type="button" class="win-action" data-call="self">“Speaking.” It’s for me <kbd>S</kbd></button>
          <button type="button" class="win-action hang" data-call="hangup">Hang up <kbd>H</kbd></button>
        </div>`;
    } else if (s.work.ringing) {
      main = `<div class="phone-lcd ring">LINE 1 · RINGING</div>
        <div class="phone-idle ringing"><p class="big">Ring ring!</p><button type="button" class="win-action strong" data-call="answer">Answer <kbd>Enter</kbd></button></div>`;
    } else {
      const outcome = this.outcome ? `<p class="outcome ${this.outcome.ok ? 'ok' : 'bad'}">${esc(this.outcome.text)}</p>` : '';
      main = `<div class="phone-lcd">NO CALLS</div>${outcome}${last ? resultHtml(last) : ''}
        <p class="hint">The desk phone rings every minute or two, even when you’re at war. Read the caller, then put them through using today’s directory. Some want you (“Speaking”), some are pranks (hang up). Calls missed so far: ${s.stats.callsMissed}.</p>`;
    }
    return `<div class="ph-app"><div class="phone-main">${main}</div>${directoryHtml}</div>`;
  }
}
