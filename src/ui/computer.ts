// Your work computer: a retro desktop that takes over the screen when you press
// Esc. While you're on it Mr. Feeney can't catch you, Suspicion cools, and the
// apps are where the actual work (and the empire management) happens:
//
//   Mail         story messages, plus work emails to reply to (a mini-game)
//   Phone        the desk phone: answer, then transfer the caller
//   Spreadsheet  fix the flagged cells (the old Look Busy game)
//   Expenses     approve or deny receipts (sometimes your own rubber bands)
//   Messenger    coworkers and rivals messaging you
//   Procurement  requisitions;  Supply Catalog  band orders;  Org Chart  your team
//
// The war screen's App renders the Procurement and Org Chart lists into their
// panes; everything else on the computer lives here.

import { readChat } from '../sim/chat';
import { orderSupplies } from '../sim/engine';
import { SUPPLIES } from '../sim/supplies';
import { setSheetOpen } from '../sim/minigame';
import { has, mods } from '../sim/mods';
import { type GameState } from '../sim/state';
import {
  answerTask,
  basePay,
  CALLERS,
  DIRECTORY,
  EMAILS,
  EXPENSE_RULE,
  expenseReport,
  findTask,
  putDown,
  ringingCall,
  startTask,
  WORK,
  workEmails,
  type TaskAnswer,
  type TaskResult,
  type WorkTask,
} from '../sim/work';
import { portraitSvg } from './portraits';
import { fmt, money, officeTime } from './format';

export type AppId = 'mail' | 'phone' | 'sheet' | 'expenses' | 'chat' | 'procure' | 'catalog' | 'org';

const APP_TITLES: Record<AppId, string> = {
  mail: 'Mail',
  phone: 'Phone',
  sheet: 'Spreadsheet',
  expenses: 'Expenses',
  chat: 'Messenger',
  procure: 'Procurement Portal',
  catalog: 'Office Supply Catalog',
  org: 'Org Chart',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface ComputerHooks {
  done(result: TaskResult): void;
  say(text: string): void;
  ring(): void;
  click(): void;
  ordered(): void;
}

type MailSel = { kind: 'work'; id: number } | { kind: 'story'; id: number } | null;

export class ComputerView {
  private app: AppId | null = null;
  private mailSel: MailSel = null;
  private lastResult: { app: AppId; html: string; until: number } | null = null;
  private approve: (boolean | null)[] = [];
  private expenseId: number | null = null;
  private keys = new Map<string, string>();
  private lastRing = 0;
  private seenMail = 0; // newest story email id you've seen in Mail

  constructor(
    private getState: () => GameState,
    private hooks: ComputerHooks,
  ) {
    $('desktop').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-app]');
      if (b) this.openApp(b.dataset.app as AppId);
    });
    $('win-close').addEventListener('click', () => this.openApp(null));
    $('incoming-answer').addEventListener('click', () => this.answerCall());
    $('mail-list').addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-mail]');
      if (!li) return;
      const [kind, id] = li.dataset.mail!.split(':');
      this.selectMail({ kind: kind as 'work' | 'story', id: Number(id) });
    });
    for (const id of ['mail-read', 'phone-body', 'expenses-body', 'catalog-body']) {
      $(id).addEventListener('click', (e) => this.onClick(e));
    }
  }

  private get s() {
    return this.getState();
  }

  get current() {
    return this.app;
  }

  // ---------------------------------------------------------------- open, close, switch

  /** The computer just came up (you pressed Esc, or picked up the phone). */
  opened() {
    this.keys.clear();
    if (this.app) this.openApp(this.app);
    else $('back-btn').focus();
  }

  /** You went back to the war. */
  closed() {
    putDown(this.s);
    setSheetOpen(this.s, false);
    this.expenseId = null;
  }

  openApp(app: AppId | null) {
    const s = this.s;
    // Leaving an app puts down whatever you were working on in it.
    if (this.app !== app) {
      putDown(s);
      this.expenseId = null;
      this.lastResult = null;
    }
    this.app = app;
    setSheetOpen(s, app === 'sheet');
    $('window').hidden = app === null;
    $('desktop').classList.toggle('behind', app !== null);
    document.querySelectorAll<HTMLElement>('.win-body .app').forEach((el) => (el.hidden = el.dataset.app !== app));
    $('task-open').textContent = app ? APP_TITLES[app] : '';
    if (!app) return;
    $('win-title').textContent = APP_TITLES[app];
    $('win-ico').className = `win-ico ico ico-${app}`;
    this.keys.clear();
    this.hooks.click();
    if (app === 'chat') readChat(s);
    if (app === 'mail') {
      s.unread = 0;
      this.seenMail = s.inbox[0]?.id ?? 0;
      const first = workEmails(s)[0];
      this.selectMail(first ? { kind: 'work', id: first.id } : s.inbox[0] ? { kind: 'story', id: s.inbox[0].id } : null);
    }
    if (app === 'expenses') this.startExpense();
    this.render();
  }

  /** Answer the ringing phone (from the war screen or the computer). */
  answerCall() {
    const s = this.s;
    const call = ringingCall(s);
    if (!call) {
      this.openApp('phone');
      return;
    }
    if (this.app !== 'phone') this.openApp('phone');
    startTask(s, call.id);
    this.keys.delete('phone');
    this.render();
  }

  // ---------------------------------------------------------------- mail

  private selectMail(sel: MailSel) {
    const s = this.s;
    putDown(s);
    this.mailSel = sel;
    this.lastResult = null;
    if (sel?.kind === 'work') startTask(s, sel.id);
    this.keys.delete('mail-read');
    this.keys.delete('mail-list');
  }

  private renderMail() {
    const s = this.s;
    const work = workEmails(s);
    const listKey = `${work.map((w) => w.id).join(',')}|${s.inbox[0]?.id ?? 0}|${this.mailSel?.kind}:${this.mailSel?.id}`;
    if (this.keys.get('mail-list') !== listKey) {
      this.keys.set('mail-list', listKey);
      const sel = this.mailSel;
      const rows = [
        ...work.map((t) => {
          const e = EMAILS[t.data.idx];
          const on = sel?.kind === 'work' && sel.id === t.id;
          return `<li data-mail="work:${t.id}" class="work${on ? ' on' : ''}"><span class="m-flag">Reply</span><b>${esc(e.from)}</b><span>${esc(e.subject)}</span></li>`;
        }),
        ...s.inbox.slice(0, 30).map((m) => {
          const on = sel?.kind === 'story' && sel.id === m.id;
          const fresh = m.id > this.seenMail;
          return `<li data-mail="story:${m.id}" class="${m.kind}${on ? ' on' : ''}${fresh ? ' fresh' : ''}"><time>${officeTime(m.t)}</time><b>${esc(m.from)}</b><span>${esc(m.subject)}</span></li>`;
        }),
      ];
      $('mail-list').innerHTML = rows.join('') || '<li class="empty">Inbox zero. Savor it.</li>';
    }

    const sel = this.mailSel;
    const result = this.lastResult?.app === 'mail' ? this.lastResult : null;
    const readKey = `${sel?.kind}:${sel?.id}|${result ? 'r' : ''}`;
    if (this.keys.get('mail-read') === readKey) return;
    this.keys.set('mail-read', readKey);
    const pane = $('mail-read');
    if (result) {
      const next = workEmails(s)[0];
      pane.innerHTML = `${result.html}${next ? `<button type="button" class="win-action" data-next-mail="${next.id}">Next email to answer</button>` : '<p class="hint">That’s every email that needs a reply. Nice.</p>'}`;
      return;
    }
    if (!sel) {
      pane.innerHTML = '<p class="hint">Pick an email on the left.</p>';
      return;
    }
    if (sel.kind === 'story') {
      const m = s.inbox.find((x) => x.id === sel.id);
      pane.innerHTML = m
        ? `<header class="mail-head"><span><b>From:</b> ${esc(m.from)}</span><span><b>Subject:</b> ${esc(m.subject)}</span><time>${officeTime(m.t)}</time></header><p class="mail-text">${esc(m.body)}</p>`
        : '<p class="hint">That email is gone.</p>';
      return;
    }
    const t = findTask(s, sel.id);
    if (!t || t.kind !== 'email') {
      pane.innerHTML = '<p class="hint">That email is gone.</p>';
      return;
    }
    const e = EMAILS[t.data.idx];
    pane.innerHTML = `
      <header class="mail-head"><span><b>From:</b> ${esc(e.from)}</span><span><b>Subject:</b> ${esc(e.subject)}</span></header>
      <p class="mail-text">${esc(e.body)}</p>
      <p class="work-ask">Reply with:</p>
      <div class="replies">${t.data.order
        .map((ri, pos) => {
          const r = e.replies[ri];
          return `<button type="button" class="reply-btn" data-choice="${pos}"><kbd>${pos + 1}</kbd>${r.replyAll ? '<span class="reply-all">Reply All</span>' : ''}<span>${esc(r.text)}</span></button>`;
        })
        .join('')}</div>
      <div class="fast-bar" data-fast="email"><span></span><em>Fast bonus</em></div>`;
  }

  // ---------------------------------------------------------------- phone

  private renderPhone() {
    const s = this.s;
    const active = s.work.activeId !== null ? findTask(s, s.work.activeId) : undefined;
    const ringing = ringingCall(s);
    const result = this.lastResult?.app === 'phone' ? this.lastResult : null;
    const key = `${active?.kind === 'call' ? active.id : ''}|${ringing?.id ?? ''}|${result ? 'r' : ''}`;
    if (this.keys.get('phone') === key) return;
    this.keys.set('phone', key);
    const body = $('phone-body');
    if (result) {
      body.innerHTML = result.html;
      return;
    }
    if (active?.kind === 'call') {
      const c = CALLERS[active.data.caller];
      body.innerHTML = `
        <p class="caller"><span class="caller-tag">On the line:</span> “${esc(c.line)}”</p>
        <div class="call-grid">
          <div class="directory" aria-label="Phone directory"><b>Extensions</b>${DIRECTORY.map((d) => `<span>${esc(d.name)} <i>${d.ext}</i></span>`).join('')}</div>
          <div class="keypad" role="group" aria-label="Dial an extension">${[1, 2, 3, 4, 5, 6, 7, 8, 9]
            .map((n) => `<button type="button" class="key" data-ext="${n}">${n}</button>`)
            .join('')}</div>
        </div>
        <p class="work-ask">Dial the extension that can help them.</p>
        <div class="fast-bar" data-fast="call"><span></span><em>Fast bonus</em></div>`;
      return;
    }
    if (ringing) {
      body.innerHTML = `<div class="phone-idle ringing"><p class="big">Line 1 is ringing</p><button type="button" class="win-action" data-answer="1">Answer</button></div>`;
      return;
    }
    body.innerHTML = `<div class="phone-idle"><p class="big">No calls right now.</p>
      <p class="hint">The desk phone rings every minute or two, even when you’re away from your computer. Answering puts you here, safe from walk-bys, and transferring the caller to the right extension pays ${money(basePay(s, 'call'))}.</p>
      <p class="hint">Calls missed so far: ${fmt(s.stats.callsMissed)}. Nobody keeps track. Probably.</p></div>`;
  }

  // ---------------------------------------------------------------- expenses

  private startExpense() {
    const s = this.s;
    const r = expenseReport(s);
    if (!r || this.expenseId === r.id) return;
    putDown(s);
    startTask(s, r.id);
    this.expenseId = r.id;
    this.approve = r.data.receipts.map(() => null);
    this.keys.delete('expenses');
  }

  private renderExpenses() {
    const s = this.s;
    const r = expenseReport(s);
    const result = this.lastResult?.app === 'expenses' ? this.lastResult : null;
    if (!result && r && this.expenseId !== r.id) this.startExpense();
    const key = `${r?.id ?? ''}|${result ? 'r' : ''}`;
    const body = $('expenses-body');
    if (this.keys.get('expenses') !== key) {
      this.keys.set('expenses', key);
      if (result) body.innerHTML = result.html + '<p class="hint" id="exp-next"></p>';
      else if (!r) body.innerHTML = '<p class="hint" id="exp-next"></p>';
      else {
        body.innerHTML = `
          <p class="rule">${esc(EXPENSE_RULE)}</p>
          <div class="exp-receipts">${r.data.receipts
            .map(
              (x, i) => `<div class="exp-receipt${x.yours ? ' yours' : ''}" data-receipt="${i}">
                ${x.yours ? '<span class="yours-note">← yours</span>' : ''}
                <span class="r-item">${esc(x.item)}</span>
                <span class="r-cat">${esc(x.cat)}</span>
                <span class="r-amt">${money(x.amount)}</span>
                <span class="r-choice">
                  <button type="button" class="ok-btn" data-approve="${i}" aria-pressed="false">Approve</button>
                  <button type="button" class="no-btn" data-deny="${i}" aria-pressed="false">Deny</button>
                </span>
              </div>`,
            )
            .join('')}</div>
          <div class="fast-bar" data-fast="expense"><span></span><em>Fast bonus</em></div>
          <button type="button" class="win-action" data-submit-expense="1" disabled>File the report</button>`;
      }
    }
    const next = document.getElementById('exp-next');
    if (next) {
      const wait = Math.max(0, Math.ceil(s.work.expenseAt - s.time));
      const text = r ? '' : wait > 0 ? `The next expense report lands in ${wait} s.` : 'The next expense report is loading…';
      if (next.textContent !== text) next.textContent = text;
    }
  }

  private decide(i: number, ok: boolean) {
    this.approve[i] = ok;
    const card = document.querySelector(`#expenses-body [data-receipt="${i}"]`);
    card?.querySelector('.ok-btn')?.setAttribute('aria-pressed', String(ok));
    card?.querySelector('.no-btn')?.setAttribute('aria-pressed', String(!ok));
    card?.classList.toggle('approved', ok);
    card?.classList.toggle('denied', !ok);
    const submit = document.querySelector<HTMLButtonElement>('#expenses-body [data-submit-expense]');
    if (submit) submit.disabled = this.approve.some((v) => v === null);
  }

  // ---------------------------------------------------------------- chat, catalog

  private renderChat() {
    const s = this.s;
    const key = String(s.chat.log[s.chat.log.length - 1]?.id ?? 0);
    if (this.keys.get('chat') === key) return;
    this.keys.set('chat', key);
    readChat(s);
    const log = $('chat-log');
    log.innerHTML =
      s.chat.log
        .map((m) => `<li><span class="who">${esc(m.from)}</span><span class="bubble">${esc(m.text)}</span><time>${officeTime(m.t)}</time></li>`)
        .join('') || '<li class="empty">No messages yet. Everyone is pretending to work.</li>';
    log.scrollTop = log.scrollHeight;
  }

  private renderCatalog() {
    const s = this.s;
    const o = mods(s).order;
    const bulk = has(s, 'bulk');
    const key = `${o.price}:${o.amount}:${s.salary >= o.price}`;
    if (this.keys.get('catalog') === key) return;
    this.keys.set('catalog', key);
    $('catalog-body').innerHTML = `
      <div class="product">
        <div class="product-art" aria-hidden="true"></div>
        <div><h3>Rubber bands, assorted (${o.amount})</h3>
        <p>${bulk ? 'Bulk pricing approved by Procurement.' : 'Standard office pack. Procurement can approve bulk pricing.'} It arrives at your desk in a box ${SUPPLIES.deliverySeconds} seconds later. Ordering makes a little noise: someone has to sign for it.</p>
        <p class="price">${money(o.price)}</p>
        <button type="button" class="win-action" data-order="1"${s.salary < o.price ? ' disabled' : ''}>Add to cart and check out</button></div>
      </div>
      <p class="hint">Shortcut from the war: press O to send an order, and O again to open the box when it lands.</p>`;
  }

  // ---------------------------------------------------------------- input

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (d.choice !== undefined) this.answerMail(Number(d.choice));
    else if (d.ext !== undefined) this.answerPhone(Number(d.ext));
    else if (d.answer !== undefined) this.answerCall();
    else if (d.approve !== undefined) this.decide(Number(d.approve), true);
    else if (d.deny !== undefined) this.decide(Number(d.deny), false);
    else if (d.submitExpense !== undefined) this.fileExpense();
    else if (d.nextMail !== undefined) this.selectMail({ kind: 'work', id: Number(d.nextMail) });
    else if (d.order !== undefined) {
      if (orderSupplies(this.s).ok) this.hooks.ordered();
      this.keys.delete('catalog');
    }
  }

  /** Keys while the computer is up (number keys answer). Returns true if used. */
  onKey(e: KeyboardEvent): boolean {
    if (e.repeat) return false;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return false;
    const s = this.s;
    if (this.app === 'mail' && this.mailSel?.kind === 'work' && n <= 3 && !this.lastResult) {
      this.answerMail(n - 1);
      return true;
    }
    if (this.app === 'phone' && s.work.activeId !== null && findTask(s, s.work.activeId)?.kind === 'call') {
      this.answerPhone(n);
      return true;
    }
    return false;
  }

  private answerMail(choice: number) {
    if (this.mailSel?.kind !== 'work') return;
    this.finish('mail', this.mailSel.id, { kind: 'email', choice });
    this.mailSel = null;
  }

  private answerPhone(ext: number) {
    const s = this.s;
    const id = s.work.activeId;
    if (id === null) return;
    this.finish('phone', id, { kind: 'call', ext });
  }

  private fileExpense() {
    if (this.expenseId === null || this.approve.some((v) => v === null)) return;
    this.finish('expenses', this.expenseId, { kind: 'expense', approve: this.approve.map(Boolean) });
    this.expenseId = null;
  }

  private finish(app: AppId, id: number, a: TaskAnswer) {
    const r = answerTask(this.s, id, a);
    if (!r) return;
    this.hooks.done(r);
    const bits = [
      r.pay > 0 ? `+${money(r.pay)}` : '',
      r.suspicion < -0.5 ? `Suspicion ${Math.round(r.suspicion)}` : r.suspicion > 0.5 ? `Suspicion +${Math.round(r.suspicion)}` : '',
      r.bonusBands ? `+${r.bonusBands} bands` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const html = `<div class="work-result ${r.ok ? 'good' : 'bad'}"><span class="stamp-big">${r.ok ? 'Done' : 'Oops'}</span><p>${esc(r.text)}</p>${bits ? `<p class="result-bits">${bits}</p>` : ''}</div>`;
    this.lastResult = { app, html, until: performance.now() + 4000 };
    this.keys.clear();
    this.render();
  }

  // ---------------------------------------------------------------- reflection

  /** Mr. Feeney walks behind you: you see him in the monitor glass. */
  reflect() {
    const r = $('reflection');
    r.innerHTML = `${portraitSvg('feeney', 'happy')}<span class="bubble-reflect">Great hustle.</span>`;
    r.classList.remove('pass');
    void r.offsetWidth;
    r.classList.add('pass');
  }

  // ---------------------------------------------------------------- every frame

  render() {
    const s = this.s;

    // Badges on the desktop icons.
    const work = workEmails(s).length;
    badge('badge-mail', work + s.unread);
    badge('badge-phone', ringingCall(s) ? '!' : 0);
    badge('badge-expenses', expenseReport(s) ? 1 : 0);
    badge('badge-chat', s.chat.unread);

    // A call comes in while you're in another app.
    const ringing = ringingCall(s);
    const incoming = $('incoming');
    incoming.hidden = !ringing || this.app === 'phone';
    if (ringing) {
      const now = performance.now();
      if (now - this.lastRing > 1500) {
        this.lastRing = now;
        this.hooks.ring();
      }
    }

    // Taskbar
    setText('tray-clock', officeTime(s.time));
    setText('tray-cool', `Suspicion ${Math.round(Math.min(100, s.suspicion))} and cooling`);

    if (this.lastResult && performance.now() > this.lastResult.until && this.app !== 'mail') {
      this.lastResult = null;
      this.keys.clear();
    }

    switch (this.app) {
      case 'mail':
        this.renderMail();
        break;
      case 'phone':
        this.renderPhone();
        break;
      case 'expenses':
        this.renderExpenses();
        break;
      case 'chat':
        this.renderChat();
        break;
      case 'catalog':
        this.renderCatalog();
        break;
    }

    // Fast-bonus bars on an open task.
    const bar = document.querySelector<HTMLElement>(`.app:not([hidden]) .fast-bar`);
    if (bar && s.work.activeId !== null) {
      const t = findTask(s, s.work.activeId);
      if (t) {
        const left = Math.max(0, WORK.fast[t.kind] - (s.time - s.work.activeSince));
        (bar.firstElementChild as HTMLElement).style.width = `${(left / WORK.fast[t.kind]) * 100}%`;
        bar.classList.toggle('gone', left <= 0);
      }
    }
  }
}

function badge(id: string, v: number | string) {
  const el = document.getElementById(id);
  if (!el) return;
  const show = v !== 0 && v !== '';
  el.hidden = !show;
  const t = typeof v === 'number' ? (v > 9 ? '9+' : String(v)) : v;
  if (show && el.textContent !== t) el.textContent = t;
}

function setText(id: string, t: string) {
  const el = document.getElementById(id);
  if (el && el.textContent !== t) el.textContent = t;
}

export type { WorkTask };
