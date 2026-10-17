// Pieces the computer's apps share: the round clock, the grade card, avatars.

import daleHead from '../../assets/art/dale-head.webp';
import { co } from '../co';
import { TEAMS } from '../../sim/content';
import type { GameState } from '../../sim/state';
import type { Grade, Round, RoundResult, WorkKind } from '../../sim/work';
import { faceSvg } from '../portraits';
import { PORTRAITS } from '../portrait-art';

export const esc = (text: string) =>
  co(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const money = (n: number) => `$${n < 100 ? n.toFixed(2).replace(/\.00$/, '') : Math.round(n).toLocaleString('en-US')}`;

/** One app inside a window on the computer. */
export interface AppView {
  /** The work this app does (its round's clock runs while it's open), if any. */
  work?: WorkKind;
  opened?(): void;
  closed?(): void;
  render(s: GameState): void;
  /** Keys while the app is open. Return true if used. */
  key?(e: KeyboardEvent): boolean;
}

export interface AppCtx {
  get(): GameState;
  sound: {
    type(): void;
    stamp(): void;
    miss(): void;
  };
  say(text: string): void;
}

/** The bar that drains as a round's clock runs. */
export function clockHtml(label = '') {
  return `<div class="round-clock" role="timer"><span class="round-clock-fill"></span><b class="round-clock-left"></b>${label ? `<em>${esc(label)}</em>` : ''}</div>`;
}

export function updateClock(root: HTMLElement, r: Round | null) {
  const el = root.querySelector<HTMLElement>('.round-clock');
  if (!el || !r) return;
  const left = Math.max(0, r.limit - r.used);
  const share = left / r.limit;
  (el.querySelector('.round-clock-fill') as HTMLElement).style.width = `${share * 100}%`;
  el.classList.toggle('low', share < 0.25);
  el.classList.toggle('fast', r.used <= r.limit * 0.6);
  const t = `${Math.ceil(left)} s`;
  const b = el.querySelector('.round-clock-left')!;
  if (b.textContent !== t) b.textContent = t;
}

const GRADE_NOTE: Record<Grade, string> = {
  A: 'Flawless, and quick.',
  B: 'Clean work.',
  C: 'One slip.',
  D: 'Sloppy.',
  F: 'See me.',
};

const DONE_TITLE: Record<WorkKind, string> = {
  mail: 'Inbox cleared',
  call: 'Call finished',
  expense: 'Report filed',
  sheet: 'Spreadsheet submitted',
};

/** The grade a teacher circles in red marker. */
export function gradeMark(g: Grade) {
  return `<span class="grade-mark grade-${g}" aria-label="Grade ${g}"><b>${g}</b></span>`;
}

/** The card at the end of a round: grade, how many were right, what it paid. */
export function resultHtml(res: RoundResult, next?: { label: string; data: string; disabled?: boolean }) {
  const earned = res.pay - res.bonus;
  return `<div class="round-result grade-${res.grade}">
    ${gradeMark(res.grade)}
    <div class="rr-body">
      <h3>${DONE_TITLE[res.kind]}</h3>
      <p class="rr-note">${GRADE_NOTE[res.grade]} ${res.right} of ${res.items} right.</p>
      <dl><dt>Pay</dt><dd>${money(earned)}</dd>${res.bonus > 0 ? `<dt>Grade bonus</dt><dd>+${money(res.bonus)}</dd>` : ''}</dl>
      ${next ? `<button type="button" class="win-action strong" ${next.data}${next.disabled ? ' disabled' : ''}>${esc(next.label)}</button>` : ''}
    </div>
  </div>`;
}

/** Who's who on Messenger and in the phone directory: painted faces where we have them. */
const FACE_IDS: Record<string, string> = {
  Gary: 'gary',
  Brad: 'brad',
  Janet: 'janet',
  Ron: 'ron',
  Rick: 'rick',
  'Mr. Feeney': 'feeney',
  Kevin: 'kevin',
  Marjorie: 'marjorie',
  Steve: 'steve',
  Linda: 'linda',
  Dave: 'dave',
};

export function avatarHtml(who: string) {
  const id = who.startsWith('@') ? TEAMS.find((t) => t.id === who.slice(1))?.portrait : FACE_IDS[who];
  if (id && PORTRAITS[id]) return `<span class="avatar">${faceSvg(id, 'happy')}</span>`;
  if (who.startsWith('Dale')) return `<span class="avatar"><img src="${daleHead}" alt=""></span>`;
  const initials = who
    .replace(/\(.*\)/, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return `<span class="avatar initials" aria-hidden="true">${esc(initials)}</span>`;
}

/** Replace an element's HTML only when `key` changed (keeps focus and hover steady). */
export function keyed(el: HTMLElement, key: string, html: () => string) {
  if (el.dataset.key === key) return false;
  el.dataset.key = key;
  el.innerHTML = html();
  return true;
}
