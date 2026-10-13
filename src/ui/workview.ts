// Your actual job, on screen: the tray of waiting work on your desk, the ringing
// phone, and one card per task (email replies, call transfers, budget reviews,
// expense reports). Every control is a big button, with keys for speed.

import { type GameState } from '../sim/state';
import {
  answerTask,
  CALLERS,
  DIRECTORY,
  EMAILS,
  EXPENSE_RULE,
  findTask,
  nextTask,
  overdueCount,
  putDown,
  ringingCall,
  startTask,
  WORK,
  type TaskAnswer,
  type TaskResult,
  type WorkTask,
} from '../sim/work';
import { money } from './format';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ICONS: Record<WorkTask['kind'], string> = {
  email: '<svg viewBox="0 0 24 18"><rect x="1.5" y="1.5" width="21" height="15" rx="2"/><path d="M2 3 L12 10 L22 3"/></svg>',
  call: '<svg viewBox="0 0 24 18"><path d="M3 6 Q3 2 7 2 L17 2 Q21 2 21 6 L18 7 L17 5 L7 5 L6 7 Z"/><rect x="4" y="8" width="16" height="9" rx="2"/></svg>',
  sheet: '<svg viewBox="0 0 24 18"><rect x="1.5" y="1.5" width="21" height="15" rx="1"/><path d="M1.5 6.5 H22.5 M1.5 11.5 H22.5 M9 1.5 V16.5 M15.5 1.5 V16.5"/></svg>',
  expense: '<svg viewBox="0 0 24 18"><path d="M5 1.5 H19 V16.5 L16.5 15 L14 16.5 L11.5 15 L9 16.5 L6.5 15 L5 16.5 Z"/><path d="M8 5.5 H16 M8 8.5 H16 M8 11.5 H13"/></svg>',
};

const TITLES: Record<WorkTask['kind'], string> = {
  email: 'Reply to this email',
  call: 'Transfer the call',
  sheet: 'Budget review',
  expense: 'Expense report',
};

export interface WorkHooks {
  /** A task was finished (right or wrong). */
  done(result: TaskResult): void;
  say(text: string): void;
  ring(): void;
  /** Called before the work card opens (to drop out of Look Busy, cancel a stretch...). */
  beforeOpen(): void;
}

export class WorkView {
  private taskId: number | null = null;
  private answered = false;
  private flagged = new Set<number>();
  private approve: (boolean | null)[] = [];
  private lastRing = 0;
  private trayKey = '';

  constructor(
    private getState: () => GameState,
    private hooks: WorkHooks,
  ) {
    const dlg = this.dlg;
    $('work-later').addEventListener('click', () => this.close());
    $('work-close').addEventListener('click', () => this.close());
    $('work-next').addEventListener('click', () => this.openNext());
    $('work-submit').addEventListener('click', () => this.submit());
    // Esc (or the dialog closing any other way) puts an unfinished task back down.
    dlg.addEventListener('close', () => this.onClosed());
    dlg.addEventListener('keydown', (e) => this.onKey(e));
    $('work-body').addEventListener('click', (e) => this.onClick(e));
  }

  private get s() {
    return this.getState();
  }

  private get dlg() {
    return $<HTMLDialogElement>('work-dlg');
  }

  get isOpen() {
    return this.dlg.open;
  }

  /** Opens the next task: a ringing phone first, then the oldest waiting. */
  openNext() {
    const s = this.s;
    const t = nextTask(s);
    if (!t) {
      if (this.dlg.open) this.close();
      const wait = Math.max(0, Math.ceil(s.work.nextAt - s.time));
      this.hooks.say(`Your inbox is empty. Enjoy it while it lasts (about ${wait} s).`);
      return;
    }
    this.hooks.beforeOpen();
    if (!startTask(s, t.id).ok) return;
    this.taskId = t.id;
    this.answered = false;
    this.flagged.clear();
    this.approve = t.kind === 'expense' ? t.data.receipts.map(() => null) : [];
    this.build(t);
    if (!this.dlg.open) this.dlg.showModal();
    // Focus the card, not an answer (a focused answer looks pre-selected). Number keys answer.
    $('work-body').focus();
  }

  private close() {
    if (this.dlg.open) this.dlg.close();
  }

  private onClosed() {
    const s = this.s;
    if (!this.answered && s.work.activeId !== null) {
      const t = findTask(s, s.work.activeId);
      putDown(s);
      if (t?.kind === 'call') this.hooks.say('You hung up on the caller. That will get back to Mr. Feeney.');
    }
    this.taskId = null;
  }

  // ---------------------------------------------------------------- building

  private build(t: WorkTask) {
    $('work-h').textContent = TITLES[t.kind];
    $('work-result').hidden = true;
    $('work-later').hidden = false;
    $('work-later').textContent = t.kind === 'call' ? 'Hang up' : 'Put it down';
    $('work-next').hidden = true;
    $('work-close').hidden = true;
    $('work-submit').hidden = t.kind !== 'sheet' && t.kind !== 'expense';
    $('work-fast').hidden = false;
    const body = $('work-body');
    body.className = `work-body work-${t.kind}`;
    switch (t.kind) {
      case 'email': {
        const e = EMAILS[t.data.idx];
        body.innerHTML = `
          <div class="email-card">
            <div class="email-head"><span><b>From:</b> ${esc(e.from)}</span><span><b>Subject:</b> ${esc(e.subject)}</span></div>
            <p class="email-text">${esc(e.body)}</p>
          </div>
          <p class="work-ask">Pick a reply:</p>
          <div class="replies">${t.data.order
            .map((ri, pos) => {
              const r = e.replies[ri];
              return `<button type="button" class="reply-btn" data-choice="${pos}"><kbd>${pos + 1}</kbd>${r.replyAll ? '<span class="reply-all">Reply All</span>' : ''}<span>${esc(r.text)}</span></button>`;
            })
            .join('')}</div>`;
        break;
      }
      case 'call': {
        const c = CALLERS[t.data.caller];
        body.innerHTML = `
          <p class="caller"><span class="caller-tag">On the line:</span> “${esc(c.line)}”</p>
          <div class="call-grid">
            <div class="directory" aria-label="Phone directory"><b>Extensions</b>${DIRECTORY.map((d) => `<span>${esc(d.name)} <i>${d.ext}</i></span>`).join('')}</div>
            <div class="keypad" role="group" aria-label="Dial an extension">${[1, 2, 3, 4, 5, 6, 7, 8, 9]
              .map((n) => `<button type="button" class="key" data-ext="${n}">${n}</button>`)
              .join('')}</div>
          </div>
          <p class="work-ask">Dial the extension that can help them.</p>`;
        break;
      }
      case 'sheet': {
        body.innerHTML = `
          <p class="work-ask">Flag every line where <b>Actual</b> is over <b>Budget</b>, then submit.</p>
          <table class="budget">
            <thead><tr><th></th><th>Line item</th><th>Budget</th><th>Actual</th></tr></thead>
            <tbody>${t.data.rows
              .map(
                (r, i) => `<tr><td><button type="button" class="flag-btn" data-row="${i}" aria-pressed="false" aria-label="Flag ${esc(r.name)}"><kbd>${i + 1}</kbd></button></td>
                <td>${esc(r.name)}</td><td>${money(r.budget)}</td><td>${money(r.actual)}</td></tr>`,
              )
              .join('')}</tbody>
          </table>`;
        break;
      }
      case 'expense': {
        body.innerHTML = `
          <p class="rule">${esc(EXPENSE_RULE)}</p>
          <div class="receipts">${t.data.receipts
            .map(
              (r, i) => `<div class="receipt${r.yours ? ' yours' : ''}" data-receipt="${i}">
                ${r.yours ? '<span class="yours-note">← yours</span>' : ''}
                <span class="r-item">${esc(r.item)}</span>
                <span class="r-cat">${esc(r.cat)}</span>
                <span class="r-amt">${money(r.amount)}</span>
                <span class="r-choice">
                  <button type="button" class="ok-btn" data-approve="${i}" aria-pressed="false">Approve</button>
                  <button type="button" class="no-btn" data-deny="${i}" aria-pressed="false">Deny</button>
                </span>
              </div>`,
            )
            .join('')}</div>`;
        break;
      }
    }
    this.syncSubmit();
  }

  // ---------------------------------------------------------------- input

  private onClick(e: Event) {
    if (this.answered) return;
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!el) return;
    const t = this.current();
    if (!t) return;
    if (el.dataset.choice !== undefined) this.answer({ kind: 'email', choice: Number(el.dataset.choice) });
    else if (el.dataset.ext !== undefined) this.answer({ kind: 'call', ext: Number(el.dataset.ext) });
    else if (el.dataset.row !== undefined) this.toggleRow(Number(el.dataset.row));
    else if (el.dataset.approve !== undefined) this.decide(Number(el.dataset.approve), true);
    else if (el.dataset.deny !== undefined) this.decide(Number(el.dataset.deny), false);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key.toLowerCase() === 'w' && this.answered) {
      e.preventDefault();
      this.openNext();
      return;
    }
    if (this.answered) return;
    const t = this.current();
    if (!t) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= 9 && !e.repeat) {
      if (t.kind === 'email' && n <= 3) this.answer({ kind: 'email', choice: n - 1 });
      else if (t.kind === 'call') this.answer({ kind: 'call', ext: n });
      else if (t.kind === 'sheet' && n <= t.data.rows.length) this.toggleRow(n - 1);
      else return;
      e.preventDefault();
    }
  }

  private toggleRow(i: number) {
    if (this.flagged.has(i)) this.flagged.delete(i);
    else this.flagged.add(i);
    const b = this.dlg.querySelector(`[data-row="${i}"]`);
    b?.setAttribute('aria-pressed', String(this.flagged.has(i)));
    b?.closest('tr')?.classList.toggle('flagged', this.flagged.has(i));
  }

  private decide(i: number, ok: boolean) {
    this.approve[i] = ok;
    const card = this.dlg.querySelector(`[data-receipt="${i}"]`);
    card?.querySelector('.ok-btn')?.setAttribute('aria-pressed', String(ok));
    card?.querySelector('.no-btn')?.setAttribute('aria-pressed', String(!ok));
    card?.classList.toggle('approved', ok);
    card?.classList.toggle('denied', !ok);
    this.syncSubmit();
  }

  private syncSubmit() {
    const t = this.current();
    const b = $<HTMLButtonElement>('work-submit');
    if (t?.kind === 'expense') b.disabled = this.approve.some((v) => v === null);
    else b.disabled = false;
  }

  private submit() {
    const t = this.current();
    if (!t || this.answered) return;
    if (t.kind === 'sheet') this.answer({ kind: 'sheet', flagged: [...this.flagged] });
    else if (t.kind === 'expense' && !this.approve.some((v) => v === null)) this.answer({ kind: 'expense', approve: this.approve.map(Boolean) });
  }

  private current() {
    return this.taskId === null ? undefined : findTask(this.s, this.taskId);
  }

  private answer(a: TaskAnswer) {
    if (this.taskId === null) return;
    const r = answerTask(this.s, this.taskId, a);
    if (!r) return;
    this.answered = true;
    this.hooks.done(r);
    const box = $('work-result');
    box.hidden = false;
    box.className = `work-result ${r.ok ? 'good' : 'bad'}`;
    const bits = [r.pay > 0 ? `+${money(r.pay)}` : '', r.suspicion < -0.5 ? `Suspicion ${Math.round(r.suspicion)}` : r.suspicion > 0.5 ? `Suspicion +${Math.round(r.suspicion)}` : '', r.bonusBands ? `+${r.bonusBands} bands` : '']
      .filter(Boolean)
      .join(' · ');
    box.innerHTML = `<span class="stamp-big">${r.ok ? 'Done' : 'Oops'}</span><p>${esc(r.text)}</p>${bits ? `<p class="result-bits">${bits}</p>` : ''}`;
    $('work-fast').hidden = true;
    $('work-later').hidden = true;
    $('work-submit').hidden = true;
    const more = this.s.work.queue.length;
    const next = $('work-next');
    next.hidden = more === 0;
    next.innerHTML = `Next task (${more}) <kbd>W</kbd>`;
    $('work-close').hidden = false;
    (more > 0 ? next : $('work-close')).focus();
    this.dlg.querySelectorAll<HTMLButtonElement>('#work-body button').forEach((b) => (b.disabled = true));
  }

  // ---------------------------------------------------------------- every frame

  render() {
    const s = this.s;
    const q = s.work.queue;

    // Desk tray: what's waiting.
    const overdue = overdueCount(s);
    const sub = q.length === 0 ? 'Inbox empty' : `${q.length} waiting${overdue ? ` · ${overdue} overdue` : ''}`;
    const sEl = $('work-sub');
    if (sEl.textContent !== sub) sEl.textContent = sub;
    $('work-btn').classList.toggle('overdue', overdue > 0);
    $('work-btn').classList.toggle('waiting', q.length > 0);
    const key = q.map((t) => t.kind).join(',');
    if (key !== this.trayKey) {
      this.trayKey = key;
      $('work-icons').innerHTML = q.map((t) => `<i class="ic ic-${t.kind}">${ICONS[t.kind]}</i>`).join('');
    }
    const mini = document.querySelector<HTMLButtonElement>('button[data-mini="work"]');
    if (mini) {
      const label = q.length ? `Do work (${q.length})` : 'Do work';
      if (mini.textContent !== label) mini.textContent = label;
    }

    // The phone.
    const call = ringingCall(s);
    const banner = $('call-banner');
    banner.hidden = !call || this.dlg.open;
    $('phone-btn').classList.toggle('ringing', !!call);
    if (call && call.kind === 'call') {
      const left = Math.max(0, call.data.ringUntil - s.time);
      $('call-fill').style.width = `${(left / WORK.ringSeconds) * 100}%`;
      const now = performance.now();
      if (now - this.lastRing > 1500) {
        this.lastRing = now;
        this.hooks.ring();
      }
    }

    // The fast-bonus timer on an open task.
    if (this.dlg.open && !this.answered) {
      const t = this.current();
      if (!t || s.work.activeId !== this.taskId) {
        // It was taken away underneath us (e.g. caught while working).
        this.close();
        return;
      }
      const left = Math.max(0, WORK.fast[t.kind] - (s.time - s.work.activeSince));
      $('work-fast-fill').style.width = `${(left / WORK.fast[t.kind]) * 100}%`;
      $('work-fast').classList.toggle('gone', left <= 0);
    }
  }
}
