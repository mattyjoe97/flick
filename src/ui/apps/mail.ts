// Mail: work email arrives in bursts (To do) and story email in the Inbox.
// Each work email needs one thing: a Reply (pick the right one), Forward to the right
// department, or Delete. Clear the burst before the clock runs out.

import { COWORKERS, ROLES, type CoworkerId } from '../../sim/content';
import { coworkerAvailable, recruit } from '../../sim/engine';
import { reviewReady } from '../../sim/career';
import type { GameState } from '../../sim/state';
import { answerMail, burstSize, startRound, type MailAnswer } from '../../sim/work';
import { DEPARTMENTS, MAIL } from '../../sim/workdata';
import { officeTime } from '../format';
import { faceSvg } from '../portraits';
import { RIVAL } from '../../sim/rival';
import { clockHtml, esc, keyed, money, resultHtml, updateClock, type AppCtx, type AppView } from './common';

type Mode = 'reply' | 'forward' | null;

export class MailApp implements AppView {
  work = 'mail' as const;
  private folder: 'work' | 'inbox' = 'work';
  private sel = 0;
  private mode: Mode = null;
  private advanceAt = 0;
  private outcome: { text: string; ok: boolean } | null = null;
  private storySel: number | null = null;
  private seenStory = 0;
  private showResult = 0; // the round id whose result card to show

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
    private hooks: { recruited(id: CoworkerId): void; review(): void },
  ) {
    el.addEventListener('click', (e) => this.onClick(e));
  }

  opened() {
    const s = this.ctx.get();
    s.unread = 0;
    this.seenStory = s.inbox[0]?.id ?? 0;
    // Work first, if there's any; otherwise the inbox.
    if (!s.work.rounds.mail && s.work.mailWaiting === 0 && s.inbox.length) this.folder = 'inbox';
    this.el.dataset.key = '';
  }

  private get s() {
    return this.ctx.get();
  }

  // ---------------------------------------------------------------- input

  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-folder],[data-act],[data-reply],[data-dept],[data-item],[data-story],[data-recruit],[data-start],[data-review]');
    if (!b || (b as HTMLButtonElement).disabled) return;
    const d = b.dataset;
    if (d.folder) {
      this.folder = d.folder as 'work' | 'inbox';
      this.mode = null;
      if (this.folder === 'inbox') this.seenStory = this.s.inbox[0]?.id ?? 0;
    } else if (d.start !== undefined) this.start();
    else if (d.item !== undefined) {
      this.sel = Number(d.item);
      this.mode = null;
    } else if (d.act) this.act(d.act as 'reply' | 'forward' | 'delete' | 'back');
    else if (d.reply !== undefined) this.answer({ act: 'reply', choice: Number(d.reply) });
    else if (d.dept) this.answer({ act: 'forward', dept: d.dept as (typeof DEPARTMENTS)[number] });
    else if (d.story) this.storySel = Number(d.story);
    else if (d.review !== undefined) return this.hooks.review();
    else if (d.recruit) {
      const id = d.recruit as CoworkerId;
      const r = recruit(this.s, id);
      if (r.ok) this.hooks.recruited(id);
      else this.ctx.say(r.reason);
    }
    this.ctx.sound.type();
    this.el.dataset.key = '';
  }

  key(e: KeyboardEvent): boolean {
    if (this.folder !== 'work') return false;
    const s = this.s;
    const r = s.work.rounds.mail;
    const k = e.key.toLowerCase();
    if (!r) {
      if (k === 'enter' || k === ' ') {
        this.start();
        return true;
      }
      return false;
    }
    const n = Number(e.key);
    if (this.mode === 'reply' && n >= 1 && n <= 3) this.answer({ act: 'reply', choice: n - 1 });
    else if (this.mode === 'forward' && n >= 1 && n <= DEPARTMENTS.length) this.answer({ act: 'forward', dept: DEPARTMENTS[n - 1] });
    else if (k === 'r') this.act('reply');
    else if (k === 'f') this.act('forward');
    else if (k === 'd' || k === 'delete') this.act('delete');
    else if (k === 'backspace') this.act('back');
    else return false;
    this.el.dataset.key = '';
    return true;
  }

  private start() {
    const s = this.s;
    if (startRound(s, 'mail')) {
      this.sel = 0;
      this.mode = null;
      this.outcome = null;
      this.showResult = 0;
    }
  }

  private act(a: 'reply' | 'forward' | 'delete' | 'back') {
    const r = this.s.work.rounds.mail;
    const item = r?.mail![this.sel];
    if (!r || item?.state !== 'open') return;
    if (a === 'back') this.mode = null;
    else if (a === 'delete') this.answer({ act: 'delete' });
    // Replying to something that didn't need a reply is a mistake on the spot.
    else if (a === 'reply' && MAIL[item.idx].act !== 'reply') this.answer({ act: 'reply', choice: 0 });
    else this.mode = this.mode === a ? null : a;
  }

  private answer(a: MailAnswer) {
    const s = this.s;
    const r = s.work.rounds.mail;
    if (!r) return;
    const res = answerMail(s, this.sel, a);
    if (!res) return;
    this.mode = null;
    this.outcome = { text: res.text, ok: res.ok };
    if (!res.ok) this.ctx.sound.miss();
    if (!s.work.rounds.mail) this.showResult = r.id;
    else this.advanceAt = performance.now() + 1100;
  }

  // ---------------------------------------------------------------- drawing

  render(s: GameState) {
    const r = s.work.rounds.mail;
    // After showing what happened, move on to the next email still open.
    if (r && this.advanceAt && performance.now() > this.advanceAt) {
      this.advanceAt = 0;
      const next = r.mail!.findIndex((m, i) => m.state === 'open' && i > this.sel);
      const any = r.mail!.findIndex((m) => m.state === 'open');
      this.sel = next >= 0 ? next : Math.max(0, any);
      this.outcome = null;
    }
    const last = s.work.last?.kind === 'mail' && s.work.last.id === this.showResult ? s.work.last : null;
    const unreadStory = s.inbox.filter((m) => m.id > this.seenStory).length;
    const key = [
      this.folder,
      r ? `${r.id}:${r.mail!.map((m) => m.state).join('')}:${this.sel}:${this.mode}:${this.outcome ? 1 : 0}` : '-',
      Math.min(s.work.mailWaiting, burstSize(s)),
      last?.id ?? '',
      s.inbox[0]?.id ?? 0,
      unreadStory,
      this.storySel ?? '',
      s.allies.length,
      reviewReady(s),
    ].join('|');
    keyed(this.el, key, () => this.html(s, last));
    updateClock(this.el, r);
    // Recruit buttons grey out until you can afford them.
    this.el.querySelectorAll<HTMLButtonElement>('button[data-price]').forEach((b) => (b.disabled = s.salary < Number(b.dataset.price)));
  }

  private html(s: GameState, last: GameState['work']['last']) {
    const r = s.work.rounds.mail;
    const todo = (r ? r.items - r.done : 0) + s.work.mailWaiting;
    const unreadStory = s.inbox.filter((m) => m.id > this.seenStory).length;
    const folders = `<nav class="mail-folders" aria-label="Folders">
      <button type="button" data-folder="work" class="${this.folder === 'work' ? 'on' : ''}">To do${todo ? ` <b>${todo}</b>` : ''}</button>
      <button type="button" data-folder="inbox" class="${this.folder === 'inbox' ? 'on' : ''}">Inbox${unreadStory ? ` <b>${unreadStory}</b>` : ''}</button>
    </nav>`;
    return `<div class="mail">${folders}<div class="mail-pane">${this.folder === 'work' ? this.workHtml(s, last) : this.inboxHtml(s)}</div></div>`;
  }

  private workHtml(s: GameState, last: GameState['work']['last']) {
    const r = s.work.rounds.mail;
    if (!r) {
      const n = Math.min(s.work.mailWaiting, burstSize(s));
      const outcome = this.outcome ? `<p class="outcome ${this.outcome.ok ? 'ok' : 'bad'}">${esc(this.outcome.text)}</p>` : '';
      if (last) return outcome + resultHtml(last, { label: n ? `Next batch (${n})` : 'Waiting for mail…', data: 'data-start', disabled: !n });
      if (n)
        return `<div class="start-card"><h3>${n} new work email${n > 1 ? 's' : ''}</h3>
          <p>Each one needs one thing: <b>Reply</b> if it’s for you, <b>Forward</b> it to the right department if it isn’t, or <b>Delete</b> it if nobody needs it. Clear them before the clock runs out.</p>
          <button type="button" class="win-action strong" data-start>Open them <kbd>Enter</kbd></button></div>`;
      return `<div class="start-card quiet"><h3>Inbox zero.</h3><p>Savor it. More is on its way.</p></div>`;
    }
    const items = r.mail!;
    const item = items[this.sel] ?? items[0];
    const m = MAIL[item.idx];
    const mark = (st: string) => (st === 'right' ? '✓' : st === 'wrong' ? '✗' : '');
    const list = items
      .map(
        (it, i) =>
          `<li><button type="button" data-item="${i}" class="${i === this.sel ? 'on' : ''} ${it.state}"><b>${esc(MAIL[it.idx].from)}</b><span>${esc(MAIL[it.idx].subject)}</span><i aria-hidden="true">${mark(it.state)}</i></button></li>`,
      )
      .join('');
    let actions = '';
    if (item.state === 'open') {
      if (this.mode === 'reply')
        actions = `<p class="work-ask">Reply with:</p><div class="mail-options">${item.order
          .map((ri, pos) => {
            const rep = m.replies![ri];
            return `<button type="button" class="option" data-reply="${pos}"><kbd>${pos + 1}</kbd>${rep.replyAll ? '<span class="reply-all">Reply All</span>' : ''}<span>${esc(rep.text)}</span></button>`;
          })
          .join('')}</div><button type="button" class="link-btn" data-act="back">Back</button>`;
      else if (this.mode === 'forward')
        actions = `<p class="work-ask">Forward to:</p><div class="mail-options depts">${DEPARTMENTS.map(
          (d, i) => `<button type="button" class="option" data-dept="${d}"><kbd>${i + 1}</kbd>${d}</button>`,
        ).join('')}</div><button type="button" class="link-btn" data-act="back">Back</button>`;
      else
        actions = `<div class="mail-actions">
          <button type="button" class="tool-act reply" data-act="reply"><span class="glyph" aria-hidden="true">↩</span>Reply <kbd>R</kbd></button>
          <button type="button" class="tool-act forward" data-act="forward"><span class="glyph" aria-hidden="true">➜</span>Forward <kbd>F</kbd></button>
          <button type="button" class="tool-act delete" data-act="delete"><span class="glyph" aria-hidden="true">✕</span>Delete <kbd>D</kbd></button>
        </div>`;
    } else if (this.outcome) actions = `<p class="outcome ${this.outcome.ok ? 'ok' : 'bad'}">${esc(this.outcome.text)}</p>`;
    return `${clockHtml(`Email ${Math.min(r.done + 1, r.items)} of ${r.items}`)}
      <div class="mail-split">
        <ol class="mail-list">${list}</ol>
        <article class="mail-read">
          <header class="mail-head"><span><b>From:</b> ${esc(m.from)}</span><span><b>Subject:</b> ${esc(m.subject)}</span></header>
          <p class="mail-text">${esc(m.body)}</p>
          ${actions}
        </article>
      </div>`;
  }

  private inboxHtml(s: GameState) {
    if (!s.inbox.length) return `<div class="start-card quiet"><h3>Nothing yet.</h3></div>`;
    const sel = s.inbox.find((m) => m.id === this.storySel) ?? s.inbox[0];
    const list = s.inbox
      .slice(0, 30)
      .map(
        (m) =>
          `<li><button type="button" data-story="${m.id}" class="${m.id === sel.id ? 'on' : ''} ${m.kind}${m.id > this.seenStory ? ' fresh' : ''}"><b>${esc(m.from)}</b><span>${esc(m.subject)}</span><time>${officeTime(m.t)}</time></button></li>`,
      )
      .join('');
    return `<div class="mail-split">
      <ol class="mail-list">${list}</ol>
      <article class="mail-read">
        <header class="mail-head${sel.from === RIVAL.name ? ' with-face' : ''}">${sel.from === RIVAL.name ? `<span class="mail-face">${faceSvg('chad', /won/i.test(sel.subject) || sel.subject.includes('😎') ? 'happy' : sel.subject.startsWith('re:') ? 'worried' : 'smug')}</span>` : ''}<span><b>From:</b> ${esc(sel.from)}</span><span><b>Subject:</b> ${esc(sel.subject)}</span><time>${officeTime(sel.t)}</time></header>
        <p class="mail-text">${esc(sel.body)}</p>
        ${this.recruitHtml(s, sel.recruit)}
        ${sel.review ? (reviewReady(s) ? `<p class="mail-recruit"><button type="button" class="win-action strong" data-review>Go to your performance review</button></p>` : `<p class="mail-recruit"><span class="stamp blue">Done</span> You’ve had this review.</p>`) : ''}
      </article>
    </div>`;
  }

  /** A coworker asking to join: hire them right from the email. */
  private recruitHtml(s: GameState, id: CoworkerId | undefined) {
    if (!id) return '';
    const c = COWORKERS.find((x) => x.id === id)!;
    if (s.allies.some((a) => a.id === id))
      return `<p class="mail-recruit"><span class="stamp blue">On your team</span> Change ${esc(c.name)}’s role in the Org Chart, or click them in the office.</p>`;
    if (!coworkerAvailable(s, id)) return '';
    return `<p class="mail-recruit"><button type="button" class="win-action strong" data-recruit="${id}" data-price="${c.cost}">Recruit ${esc(c.name)}: ${money(c.cost)}</button>
      <span class="hint">${esc(c.trait)}: best as a ${esc(ROLES.find((x) => x.id === c.traitRole)!.name)}.</span></p>`;
  }
}
