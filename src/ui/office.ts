// The office around you, on screen: Bailey in her bed on the floor by your desk (beside the Flick key),
// the office moment card (pizza, a stray rubber band ball, Muffins, Joey...) that you
// grab with a tap, and Mr. Feeney's sticky note of today's goals on your desktop.

import ball1 from '../assets/art/ball-1.webp';
import baileyFetch from '../assets/art/pet-bailey-fetch.webp';
import baileyHappy from '../assets/art/pet-bailey-happy.webp';
import baileyHowl from '../assets/art/pet-bailey-howl.webp';
import baileySit from '../assets/art/pet-bailey-sit.webp';
import baileySleep from '../assets/art/pet-bailey-sleep.webp';
import dogBed from '../assets/art/pet-dog-bed.webp';
import joeyBall from '../assets/art/pet-joey-ball.webp';
import muffinsSwat from '../assets/art/pet-muffins-swat.webp';
import { MOMENTS, type MomentKind } from '../sim/content';
import { walkbyCountdown } from '../sim/engine';
import { goalProgress, goalReward } from '../sim/goals';
import { claimMoment, MOMENT_TEXT, petBailey } from '../sim/office';
import type { GameEvent, GameState } from '../sim/state';
import { WORK } from '../sim/work';
import { esc, money } from './apps/common';

type Pose = 'sleep' | 'sit' | 'howl' | 'happy' | 'fetch';
const POSES: Record<Pose, string> = { sleep: baileySleep, sit: baileySit, howl: baileyHowl, happy: baileyHappy, fetch: baileyFetch };

/** Little flat pictures for the moments that don't star a pet. */
const ICONS: Partial<Record<MomentKind, string>> = {
  pizza: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 14 Q32 2 56 14 L33 60 Z" fill="#f2c45a" stroke="#332a24" stroke-width="3" stroke-linejoin="round"/><path d="M8 14 Q32 2 56 14 L53 20 Q32 9 11 20 Z" fill="#c98a3e" stroke="#332a24" stroke-width="3" stroke-linejoin="round"/><circle cx="26" cy="26" r="5" fill="#c0392b" stroke="#332a24" stroke-width="2"/><circle cx="39" cy="31" r="4.5" fill="#c0392b" stroke="#332a24" stroke-width="2"/><circle cx="32" cy="44" r="4" fill="#c0392b" stroke="#332a24" stroke-width="2"/></svg>`,
  coffee: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 24 H46 V48 Q46 58 36 58 H22 Q12 58 12 48 Z" fill="#f4f1ea" stroke="#332a24" stroke-width="3" stroke-linejoin="round"/><path d="M46 30 Q58 30 56 40 Q54 48 46 47" fill="none" stroke="#332a24" stroke-width="3"/><path d="M15 27 H43 V33 H15 Z" fill="#6b3f22"/><path d="M22 6 q-4 5 0 9 q4 4 0 9 M32 4 q-4 5 0 9 q4 4 0 9" fill="none" stroke="#8a8f96" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  vending: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="4" width="40" height="56" rx="3" fill="#2f6e9e" stroke="#332a24" stroke-width="3"/><rect x="17" y="9" width="22" height="34" fill="#dfe8ee" stroke="#332a24" stroke-width="2"/><path d="M17 20 H39 M17 31 H39" stroke="#332a24" stroke-width="2"/><rect x="20" y="12" width="6" height="6" fill="#e05a3a"/><rect x="29" y="12" width="6" height="6" fill="#f2c45a"/><rect x="20" y="23" width="6" height="6" fill="#5aa06a"/><rect x="29" y="34" width="6" height="6" fill="#e05a3a" transform="rotate(-20 32 37)"/><rect x="42" y="12" width="6" height="14" fill="#f4f1ea" stroke="#332a24" stroke-width="1.5"/><rect x="17" y="48" width="30" height="7" fill="#1b2a38"/></svg>`,
  bonus: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="16" width="52" height="34" rx="3" fill="#f4f1ea" stroke="#332a24" stroke-width="3"/><path d="M6 18 L32 36 L58 18" fill="none" stroke="#332a24" stroke-width="3" stroke-linejoin="round"/><rect x="18" y="6" width="28" height="18" rx="2" fill="#7fbf6f" stroke="#332a24" stroke-width="2.5"/><circle cx="32" cy="15" r="4" fill="none" stroke="#2f5d27" stroke-width="2"/></svg>`,
};
const PICS: Partial<Record<MomentKind, string>> = { ball: ball1, bailey: baileyFetch, muffins: muffinsSwat, joey: joeyBall };

export interface OfficeHooks {
  say(text: string): void;
  claimed(kind: MomentKind, from: HTMLElement): void;
  sound: { howl(): void; yip(): void; notify(): void };
}

export class OfficeView {
  private bailey: HTMLButtonElement;
  private pose: Pose | '' = '';
  private happyUntil = 0;
  private howled = false;
  private card: HTMLElement;
  private cardKind: MomentKind | null = null;
  private notesKey = '';

  constructor(
    private get: () => GameState,
    private hooks: OfficeHooks,
  ) {
    // Bailey and her bed, on the floor by your desk, beside the Flick key.
    const wrap = document.getElementById('arena')!;
    this.bailey = document.createElement('button');
    this.bailey.type = 'button';
    this.bailey.className = 'bailey';
    this.bailey.setAttribute('aria-label', 'Bailey, your beagle. Scratch her ears.');
    this.bailey.title = 'Bailey (tap to scratch her ears)';
    this.bailey.innerHTML = `<img class="bailey-bed" src="${dogBed}" alt=""><img class="bailey-dog" alt=""><span class="bailey-say" aria-hidden="true"></span>`;
    wrap.append(this.bailey);
    this.bailey.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.bailey.addEventListener('click', () => this.pet());

    // The moment card, over whichever screen you're on.
    this.card = document.createElement('div');
    this.card.className = 'moment';
    this.card.id = 'moment';
    this.card.hidden = true;
    this.card.setAttribute('role', 'status');
    document.body.append(this.card);
    this.card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-grab]')) this.grab();
    });
  }

  private get s() {
    return this.get();
  }

  private pet() {
    const s = this.s;
    // If Bailey is out fetching a moment, the tap grabs it.
    if (s.office.moment?.kind === 'bailey') return this.grab();
    const calmed = petBailey(s);
    this.happyUntil = performance.now() + 1800;
    this.hooks.sound.yip();
    if (calmed) this.hooks.say('You scratch Bailey behind the ears. Everyone calms down a little.');
    this.heart();
  }

  private heart() {
    const h = document.createElement('span');
    h.className = 'bailey-heart';
    h.textContent = '♥';
    this.bailey.append(h);
    setTimeout(() => h.remove(), 1000);
  }

  private grab() {
    const kind = this.s.office.moment?.kind;
    const text = claimMoment(this.s);
    if (!text || !kind) return;
    this.hooks.claimed(kind, this.cardKind ? this.card : this.bailey);
    this.hooks.say(text);
    if (kind === 'bailey') {
      this.happyUntil = performance.now() + 1800;
      this.heart();
    }
    this.hideCard();
  }

  handle(e: GameEvent) {
    if (e.type === 'moment') this.hooks.sound.notify();
    else if (e.type === 'goalDone') this.hooks.say(e.text);
  }

  // ---------------------------------------------------------------- every frame

  render() {
    const s = this.s;
    const now = performance.now();

    // Bailey: asleep, unless something's going on.
    const countdown = walkbyCountdown(s);
    let pose: Pose = 'sleep';
    if (now < this.happyUntil) pose = 'happy';
    else if (s.office.moment?.kind === 'bailey') pose = 'fetch';
    else if (countdown !== null) pose = 'howl';
    else if (s.time - s.lastShotAt < 8 || s.time < s.office.pizzaUntil) pose = 'sit';
    if (pose !== this.pose) {
      this.pose = pose;
      (this.bailey.querySelector('.bailey-dog') as HTMLImageElement).src = POSES[pose];
      this.bailey.dataset.pose = pose;
      this.bailey.querySelector('.bailey-say')!.textContent = pose === 'howl' ? 'Aroooo!' : '';
    }
    if (countdown !== null && !this.howled) {
      this.howled = true;
      this.hooks.sound.howl();
    } else if (countdown === null) this.howled = false;

    // The moment card.
    const m = s.office.moment;
    if (m && m.kind !== this.cardKind) this.showCard(m.kind);
    else if (!m && this.cardKind) this.hideCard();
    if (m && this.cardKind) {
      const left = Math.max(0, m.until - s.time) / MOMENTS.seconds;
      (this.card.querySelector('.moment-time i') as HTMLElement).style.width = `${(left * 100).toFixed(1)}%`;
    }

    // Today's goals, on the sticky note on your desktop.
    this.renderNotes(s);
  }

  private showCard(kind: MomentKind) {
    this.cardKind = kind;
    const t = MOMENT_TEXT[kind];
    const pic = PICS[kind] ? `<img src="${PICS[kind]}" alt="">` : (ICONS[kind] ?? '');
    this.card.dataset.kind = kind;
    this.card.innerHTML = `<span class="moment-pic">${pic}</span>
      <span class="moment-body"><b>${esc(t.title)}</b><span>${esc(t.text)}</span></span>
      <button type="button" class="moment-grab" data-grab>${esc(t.grab)}</button>
      <span class="moment-time"><i></i></span>`;
    this.card.hidden = false;
    this.card.classList.remove('out');
  }

  private hideCard() {
    this.cardKind = null;
    this.card.classList.add('out');
    setTimeout(() => {
      if (!this.cardKind) this.card.hidden = true;
    }, 250);
  }

  private renderNotes(s: GameState) {
    const el = document.getElementById('goals-note');
    if (!el) return;
    const rows = s.goals.list.map((_, i) => goalProgress(s, i));
    const day = Math.floor(s.time / WORK.dayLength);
    const key = `${day}|${rows.map((r) => `${r.done}/${r.target}${r.finished ? '!' : ''}`).join(',')}`;
    if (key === this.notesKey) return;
    this.notesKey = key;
    const r = goalReward(s);
    const dayName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][day % 5];
    el.innerHTML = `<b class="gn-head">${dayName}’s goals <small>(Mr. F.)</small></b>
      <ul>${rows
        .map(
          (g) =>
            `<li class="${g.finished ? 'done' : ''}"><i aria-hidden="true">${g.finished ? '✓' : ''}</i><span>${esc(g.text)}</span>${g.target > 1 && !g.finished ? `<em>${g.done}/${g.target}</em>` : ''}</li>`,
        )
        .join('')}</ul>
      <small class="gn-pay">Each: Performance + ${money(r.cash)}</small>`;
  }
}
