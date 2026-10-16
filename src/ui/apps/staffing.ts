// Staffing: your career and your team. The top card is your employee badge: title, what
// work pays, and the Performance bar toward your next promotion. When the bar is full,
// Mr. Feeney wants to see you: the review is one silly question, then the promotion.
//
// Below it, the teams you can hire: each starts with a named lead and grows a seat at a
// time (your headcount budget goes up with every promotion), and training makes the
// whole team more productive. They earn while you play, and while you're away.

import idBadge from '../../assets/art/id-badge.webp';
import joeySit from '../../assets/art/pet-joey-sit.webp';
import muffinsLoaf from '../../assets/art/pet-muffins-loaf.webp';
import { PAY_GRADES, STAFF, TEAMS, type Team, type TeamId } from '../../sim/content';
import { promote, reviewNeed, reviewQuestion, reviewReady, TOP_RANK } from '../../sim/career';
import { hire, leadMult, leadName, pizzaMult, rename, seatCap, seatCost, seats, staffPayPerMin, teamPayPerMin, teamPerMin, trainCost, trainLevel, train } from '../../sim/staff';
import type { GameState } from '../../sim/state';
import { portraitSvg } from '../portraits';
import { esc, keyed, money, type AppCtx, type AppView } from './common';

const PET_ART = { muffins: muffinsLoaf, joey: joeySit };
const PET_NAME = { muffins: 'Muffins', joey: 'Joey' };

/** Your portrait: the outfit changes as you climb (t-shirt, button-down, tie, suit). */
export function youPortrait(rank: number) {
  return `you${rank < 3 ? 1 : rank < 6 ? 2 : rank < 8 ? 3 : 4}`;
}

/** Your name for the ID badge (you can change it in Staffing). */
export function yourName(s: GameState) {
  return s.names?.you?.trim() || 'Matt Callahan';
}

const mult = (n: number) => `×${String(n)}`;
const a = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const num = (n: number) => Math.round(n).toLocaleString('en-US');

type Mode = { kind: 'list' } | { kind: 'review'; answer: number | null; from: number };

export class StaffingApp implements AppView {
  private mode: Mode = { kind: 'list' };
  private outcome: { text: string; ok: boolean } | null = null;
  private editing: TeamId | 'you' | null = null; // the name being changed

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
    private hooks: { promoted(rank: number): void },
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      const d = b.dataset;
      const s = this.s;
      if (d.rename) {
        this.editing = d.rename as TeamId | 'you';
        this.el.dataset.key = '';
        this.render(s);
        const input = this.el.querySelector<HTMLInputElement>('input.rename');
        input?.focus();
        input?.select();
        return;
      }
      if (d.review !== undefined) this.mode = { kind: 'review', answer: null, from: s.career.rank };
      else if (d.answer !== undefined) this.answer(Number(d.answer));
      else if (d.back !== undefined) this.mode = { kind: 'list' };
      else if (d.hire) {
        const res = hire(s, d.hire as Team['id']);
        this.outcome = res.ok ? { text: '', ok: true } : { text: res.why, ok: false };
        if (res.ok) this.ctx.sound.stamp();
        else this.ctx.sound.miss();
      } else if (d.train) {
        const res = train(s, d.train as Team['id']);
        this.outcome = res.ok ? { text: '', ok: true } : { text: res.why, ok: false };
        if (res.ok) this.ctx.sound.stamp();
        else this.ctx.sound.miss();
      }
      this.el.dataset.key = '';
    });
    // Renaming: Enter or leaving the box saves; Escape cancels.
    const save = (input: HTMLInputElement) => {
      if (!this.editing) return;
      rename(this.s, this.editing, input.value);
      this.editing = null;
      this.el.dataset.key = '';
    };
    el.addEventListener('keydown', (e) => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('input.rename');
      if (!input) return;
      if (e.key === 'Enter') save(input);
      else if (e.key === 'Escape') {
        this.editing = null;
        this.el.dataset.key = '';
      }
      e.stopPropagation();
    });
    el.addEventListener('focusout', (e) => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('input.rename');
      if (input) save(input);
    });
  }

  /** A name, with a pencil to change it (or the box to type in, while you are). */
  private nameHtml(_s: GameState, who: TeamId | 'you', name: string) {
    if (this.editing === who)
      return `<input class="rename" type="text" maxlength="20" value="${esc(name)}" aria-label="New name" autocomplete="off" spellcheck="false">`;
    return `${esc(name)}<button type="button" class="pencil" data-rename="${who}" aria-label="Change ${esc(name)}’s name" title="Change name">✎</button>`;
  }

  private get s() {
    return this.ctx.get();
  }

  /** Straight to the review (from a notification or Mr. Feeney's email). */
  showReview() {
    if (reviewReady(this.s)) this.mode = { kind: 'review', answer: null, from: this.s.career.rank };
    this.el.dataset.key = '';
  }

  opened() {
    if (this.mode.kind === 'review' && this.mode.answer !== null) this.mode = { kind: 'list' };
    this.outcome = null;
    this.el.dataset.key = '';
  }

  private answer(i: number) {
    const m = this.mode;
    if (m.kind !== 'review' || m.answer !== null) return;
    if (!promote(this.s)) {
      this.mode = { kind: 'list' };
      return;
    }
    this.mode = { ...m, answer: i };
    this.hooks.promoted(this.s.career.rank);
  }

  key(e: KeyboardEvent): boolean {
    const m = this.mode;
    if (m.kind === 'review' && m.answer === null) {
      const n = Number(e.key);
      if (n >= 1 && n <= 3) {
        this.answer(n - 1);
        this.el.dataset.key = '';
        return true;
      }
    } else if (m.kind === 'review' && (e.key === 'Enter' || e.key === ' ')) {
      this.mode = { kind: 'list' };
      this.el.dataset.key = '';
      return true;
    }
    return false;
  }

  render(s: GameState) {
    if (this.editing && this.el.querySelector('input.rename')) return; // don't redraw under your typing
    const team = TEAMS.map((t) => `${seats(s, t.id)}.${trainLevel(s, t.id)}`).join(',');
    // Buttons enable as money comes in; numbers tick in whole dollars.
    const afford = TEAMS.map((t) => `${s.salary >= seatCost(s, t.id) ? 1 : 0}${s.salary >= (trainCost(s, t.id) ?? Infinity) ? 1 : 0}`).join('');
    const key = [JSON.stringify(this.mode), s.career.rank, Math.floor(s.career.review), reviewReady(s), team, afford, Math.round(staffPayPerMin(s)), this.outcome?.text ?? '', JSON.stringify(s.names), this.editing ?? ''].join('|');
    keyed(this.el, key, () => (this.mode.kind === 'review' ? this.reviewHtml(s) : this.listHtml(s)));
  }

  // ---------------------------------------------------------------- the review

  private reviewHtml(s: GameState) {
    const m = this.mode as Extract<Mode, { kind: 'review' }>;
    const q = reviewQuestionFor(m.from);
    if (m.answer === null) {
      return `<div class="perf-review">
        <div class="rv-face">${portraitSvg('feeney', 'happy')}</div>
        <div class="rv-body">
          <p class="rv-kicker">Performance review · Mr. Feeney’s office</p>
          <p class="rv-say">“Come in, sit down. This’ll be quick. ${esc(q.q)}”</p>
          <div class="rv-answers">${q.a.map((a, i) => `<button type="button" class="option" data-answer="${i}"><kbd>${i + 1}</kbd>${esc(a)}</button>`).join('')}</div>
        </div>
      </div>`;
    }
    const before = PAY_GRADES[m.from];
    const now = PAY_GRADES[s.career.rank];
    const unlocked = TEAMS.find((t) => t.unlockRank === s.career.rank);
    const perks = [
      `Work pays <b>${mult(now.mult)}</b> (was ${mult(before.mult)})`,
      unlocked ? `New: hire <b>${esc(leadName(s, unlocked))}</b>, ${esc(a(unlocked.title.toLowerCase()))}${unlocked.pet ? ` (and ${PET_NAME[unlocked.pet]})` : ''}` : '',
      youPortrait(s.career.rank) !== youPortrait(m.from) ? 'A new look for your ID badge' : '',
      TEAMS.some((t) => t.unlockRank < s.career.rank && seats(s, t.id) > 0) ? 'Headcount budget: +1 seat on every team' : '',
      s.career.rank === TOP_RANK ? 'You run the company now. Nobody can promote you.' : '',
    ].filter(Boolean);
    return `<div class="perf-review done">
      <div class="rv-face you">${portraitSvg(youPortrait(s.career.rank), 'happy')}</div>
      <div class="rv-body">
        <p class="rv-kicker">Performance review · Mr. Feeney’s office</p>
        <p class="rv-you">“${esc(q.a[m.answer])}.”</p>
        <p class="rv-say">“${esc(q.then[m.answer])} Congratulations. You’re our new…”</p>
        <div class="rv-promo">
          <span class="rv-stamp">Promoted</span>
          <h3>${esc(now.title)}</h3>
          <ul>${perks.map((p) => `<li>${p}</li>`).join('')}</ul>
          <button type="button" class="win-action strong" data-back>Back to work <kbd>Enter</kbd></button>
        </div>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- the list

  private careerHtml(s: GameState) {
    const c = s.career;
    const g = PAY_GRADES[c.rank];
    const next = PAY_GRADES[c.rank + 1];
    const need = reviewNeed(c.rank);
    const ready = reviewReady(s);
    const share = next ? Math.min(1, c.review / need) : 1;
    const bar = next
      ? `<div class="perf${ready ? ' full' : ''}" role="meter" aria-label="Performance" aria-valuemin="0" aria-valuemax="${need}" aria-valuenow="${Math.floor(c.review)}">
          <span class="perf-fill" style="width:${(share * 100).toFixed(1)}%"></span>
          <b>Performance ${num(Math.min(c.review, need))} / ${num(need)}</b>
        </div>`
      : '';
    const action = ready
      ? `<button type="button" class="win-action strong review-btn" data-review>Go to your performance review</button>`
      : next
        ? `<p class="hint">Next: <b>${esc(next.title)}</b>, work ${mult(next.mult)}. Do work right to fill the bar (clean, quick rounds count extra, and the more senior you are the more your work counts). Your team adds a little.</p>`
        : `<p class="hint">You’re the CEO. There is nowhere left to go but the golf course.</p>`;
    return `<section class="career">
      <div class="id-card">
        <img class="id-art" src="${idBadge}" alt="">
        <span class="id-photo">${portraitSvg(youPortrait(c.rank), 'idle')}</span>
        <span class="id-name">${esc(yourName(s))}</span>
        <span class="id-title">${esc(g.title)}</span>
      </div>
      <div class="career-info">
        <p class="career-kicker">${this.nameHtml(s, 'you', yourName(s))} · rank ${c.rank + 1} of ${PAY_GRADES.length}</p>
        <h3>${esc(g.title)} <small>work ${mult(g.mult)}</small></h3>
        ${bar}
        ${action}
      </div>
    </section>`;
  }

  private teamHtml(s: GameState, t: Team) {
    const n = seats(s, t.id);
    if (s.career.rank < t.unlockRank) {
      return `<li class="team locked">
        <div class="tm-face">${portraitSvg(t.portrait, 'idle')}</div>
        <div class="tm-body">
          <h4>${esc(cap1(a(t.title.toLowerCase())))}</h4>
          <p class="tm-does">${t.job ? `Does your ${esc(t.does)} for you.` : 'Makes every other team faster.'}</p>
          <p class="tm-lock">Hire one once you’re ${esc(PAY_GRADES[t.unlockRank].title)}.</p>
        </div>
      </li>`;
    }
    const cap = seatCap(s, t.id);
    const cost = seatCost(s, t.id);
    const tc = trainCost(s, t.id);
    const level = trainLevel(s, t.id);
    const full = n >= cap;
    const name = leadName(s, t);
    const hireLabel = n === 0 ? `Hire ${esc(name)}` : `Add ${esc(a(t.title.toLowerCase()))}`;
    const hireBtn = `<button type="button" class="win-action${n === 0 ? ' strong' : ''}" data-hire="${t.id}"${full || s.salary < cost ? ' disabled' : ''}>${hireLabel} · ${money(cost)}</button>`;
    const trainBtn =
      tc !== null
        ? `<button type="button" class="win-action" data-train="${t.id}"${s.salary < tc ? ' disabled' : ''}>${esc(STAFF.training[level])} · ${money(tc)} <small>(+${Math.round((STAFF.trainBoost - 1) * 100)}%)</small></button>`
        : '';
    const output = t.job
      ? n > 0
        ? `<b>${num(teamPerMin(s, t.id))} ${esc(t.does)}/min</b> · <b class="tm-pay">${money(teamPayPerMin(s, t.id))}/min</b>`
        : `Does your ${esc(t.does)} for you, about ${t.perMin} a minute per seat.`
      : n > 0
        ? `Every other team works <b>${Math.round(STAFF.managerBoost * n * 100)}% faster</b>.`
        : `Makes every other team ${Math.round(STAFF.managerBoost * 100)}% faster per seat.`;
    const trained = level > 0 ? ` · trained: ${esc(STAFF.training[level - 1])}` : '';
    const pet = t.pet && n > 0 ? `<img class="tm-pet ${t.pet}" src="${PET_ART[t.pet]}" alt="${PET_NAME[t.pet]}" title="${PET_NAME[t.pet]}">` : '';
    return `<li class="team">
      <div class="tm-face">${portraitSvg(t.portrait, n > 0 ? 'happy' : 'idle')}${pet}</div>
      <div class="tm-body">
        <h4>${this.nameHtml(s, t.id, name)} <small>${esc(t.title)}${n > 1 ? ` + ${n - 1} more` : ''}${t.pet && n > 0 ? ` · ${PET_NAME[t.pet]} comes too` : ''}</small></h4>
        <p class="tm-does">${output}</p>
        <p class="tm-quote">“${esc(t.pitch)}”</p>
        <div class="tm-actions">${hireBtn}${trainBtn}</div>
        <p class="tm-cap">Headcount ${n} of ${cap}${full && s.career.rank < TOP_RANK ? ' · a promotion adds a seat' : ''}${trained}</p>
      </div>
    </li>`;
  }

  private listHtml(s: GameState) {
    const steady = staffPayPerMin(s, true);
    const lead = leadMult(s);
    const pizza = pizzaMult(s);
    const boosts = [lead > 1 ? `following your lead ×${lead.toFixed(1).replace(/\.0$/, '')}` : '', pizza > 1 ? `pizza ×${pizza}` : ''].filter(Boolean).join(' · ');
    const outcome = this.outcome && !this.outcome.ok ? `<p class="outcome bad">${esc(this.outcome.text)}</p>` : '';
    return `<div class="staffing">
      ${this.careerHtml(s)}
      <section class="teams">
        <h3>Your team ${steady > 0 ? `<small>${money(steady)}/min, even while you’re away</small>` : ''}${steady > 0 && boosts ? ` <em class="tm-boost">${esc(boosts)}</em>` : ''}</h3>
        ${steady > 0 ? '<p class="hint team-tip">Keep a work combo going and your team speeds up with you, up to twice as fast.</p>' : ''}
        ${outcome}
        <ul>${TEAMS.map((t) => this.teamHtml(s, t)).join('')}</ul>
      </section>
    </div>`;
  }
}

const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The question for the review that takes you from `rank`. */
function reviewQuestionFor(rank: number) {
  return reviewQuestion({ career: { rank } } as GameState);
}
