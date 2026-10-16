// Messenger: a buddy list with away messages, and a conversation with each person.
// Their messages on the left, yours on the right, "Gary is typing…" while they write,
// and quick replies when there's something to say back.

import { buddies, readThread, replyOptions, sendReply, typing, chatName } from '../../sim/chat';
import type { GameState } from '../../sim/state';
import { officeTime } from '../format';
import { avatarHtml, esc, keyed, type AppCtx, type AppView } from './common';

export class MessengerApp implements AppView {
  private who: string | null = null;
  private convoOpen = false; // on a phone, the conversation replaces the list

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-who],button[data-say],button[data-back]');
      if (!b || b.disabled) return;
      if (b.dataset.who) {
        this.who = b.dataset.who;
        this.convoOpen = true;
      } else if (b.dataset.back !== undefined) this.convoOpen = false;
      else if (b.dataset.say !== undefined && this.who) {
        if (sendReply(this.ctx.get(), this.who, Number(b.dataset.say))) this.ctx.sound.type();
      }
      this.el.dataset.key = '';
    });
  }

  /** Open straight to someone's conversation (from a notification). */
  show(who: string) {
    this.who = who;
    this.convoOpen = true;
    this.el.dataset.key = '';
  }

  opened() {
    const s = this.ctx.get();
    if (!this.who || !s.chat.threads.some((t) => t.who === this.who)) {
      // The newest conversation with something unread, or the newest one.
      const byNew = [...s.chat.threads].sort((a, b) => (b.msgs[b.msgs.length - 1]?.t ?? 0) - (a.msgs[a.msgs.length - 1]?.t ?? 0));
      this.who = (byNew.find((t) => t.unread) ?? byNew[0])?.who ?? null;
    }
    this.el.dataset.key = '';
  }

  key(e: KeyboardEvent): boolean {
    if (!this.who) return false;
    const n = Number(e.key);
    if (n >= 1 && n <= 2 && replyOptions(this.ctx.get(), this.who).length >= n) {
      sendReply(this.ctx.get(), this.who, n - 1);
      this.ctx.sound.type();
      this.el.dataset.key = '';
      return true;
    }
    return false;
  }

  render(s: GameState) {
    // Reading a conversation marks it read.
    if (this.who) readThread(s, this.who);
    const th = s.chat.threads.find((t) => t.who === this.who);
    const typers = typing(s);
    const key = [
      this.who,
      this.convoOpen,
      th?.msgs.length ?? 0,
      th?.pending ?? '',
      typers.join(','),
      s.chat.threads.map((t) => `${t.who}:${t.unread}`).join(','),
      s.dale.introduced,
      s.stage,
      s.targetIndex,
    ].join('|');
    if (keyed(this.el, key, () => this.html(s, typers))) {
      const log = this.el.querySelector('.im-log');
      if (log) log.scrollTop = log.scrollHeight;
    }
  }

  private html(s: GameState, typers: string[]) {
    const list = buddies(s);
    const online = list.filter((b) => b.status === 'online').length;
    const buddyHtml = list
      .map((b) => {
        const th = s.chat.threads.find((t) => t.who === b.who);
        const unread = th?.unread ?? 0;
        return `<li><button type="button" data-who="${esc(b.who)}" class="buddy ${b.status}${b.who === this.who ? ' on' : ''}">
          <i class="dot" aria-label="${b.status}"></i>
          <span class="b-name">${esc(chatName(s, b.who))}</span>
          ${b.note ? `<span class="b-note">${b.status === 'away' ? 'Away: ' : ''}${esc(b.note)}</span>` : ''}
          ${unread ? `<b class="b-unread">${unread}</b>` : ''}
          ${typers.includes(b.who) ? '<span class="b-typing">typing…</span>' : ''}
        </button></li>`;
      })
      .join('');
    const th = s.chat.threads.find((t) => t.who === this.who);
    const buddy = list.find((b) => b.who === this.who);
    let convo = '<div class="im-empty"><p>Pick someone on the left to chat.</p></div>';
    if (this.who) {
      const msgs = (th?.msgs ?? [])
        .map(
          (m) => `<li class="${m.mine ? 'mine' : 'theirs'}">${m.mine ? '' : avatarHtml(this.who!)}<span class="im-bubble">${esc(m.text)}</span><time>${officeTime(m.t)}</time></li>`,
        )
        .join('');
      const opts = replyOptions(s, this.who);
      const compose = opts.length
        ? `<div class="im-replies">${opts.map((o, i) => `<button type="button" class="im-chip" data-say="${i}"><kbd>${i + 1}</kbd>${esc(o)}</button>`).join('')}</div>`
        : `<div class="im-input" aria-hidden="true">Nothing to say back right now.</div>`;
      convo = `<header class="im-head">
          <button type="button" class="im-back" data-back aria-label="Back to buddies">‹</button>
          ${avatarHtml(this.who)}
          <div><b>${esc(chatName(s, this.who))}</b>${buddy?.note ? `<small>${buddy.status === 'away' ? 'Away: ' : ''}${esc(buddy.note)}</small>` : ''}</div>
        </header>
        <ol class="im-log">${msgs || '<li class="im-none">No messages yet.</li>'}</ol>
        <p class="im-typing">${typers.includes(this.who) ? `${esc(chatName(s, this.who))} is typing<span class="dots"><i></i><i></i><i></i></span>` : ''}</p>
        ${compose}`;
    }
    return `<div class="im${this.convoOpen ? ' convo-open' : ''}">
      <aside class="im-buddies"><h3>Buddies <small>(${online} online)</small></h3><ul>${buddyHtml}</ul></aside>
      <section class="im-convo">${convo}</section>
    </div>`;
  }
}
