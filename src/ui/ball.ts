// Your rubber band ball, on the desk on the other side of the Flick key from Bailey, and
// the Barrage key under it. Tap the ball to wind spare bands on: it grows (four sizes,
// each a permanent perk). The Barrage key throws a pocketful for you and every Shooter.

import { setFill } from './fill';
import ball1 from '../assets/art/ball-1.webp';
import ball2 from '../assets/art/ball-2.webp';
import ball3 from '../assets/art/ball-3.webp';
import ball4 from '../assets/art/ball-4.webp';
import { ballProgress, ballSize, ballUnlocked, nextBallSize, wind } from '../sim/ball';
import { BALL, BARRAGE } from '../sim/content';
import { barrage, barrageCooldown, barrageSize, barrageUnlocked, canBarrage, type ActionResult } from '../sim/engine';
import type { GameEvent, GameState } from '../sim/state';

/** The picture for each size (a knot of bands uses the smallest), and how big it's drawn. */
const ART = [ball1, ball1, ball2, ball3, ball4];
const SCALE = [0.46, 0.6, 0.74, 0.88, 1];

const n = (x: number) => Math.floor(x).toLocaleString('en-US');
/** Short numbers for the little label under the ball (25k, 150k). */
const short = (x: number) => (x >= 10000 ? `${Math.floor(x / 1000)}k` : n(x));

export interface BallHooks {
  say(text: string): void;
  act(fn: (s: GameState) => ActionResult): boolean;
  sound: { wind(grew: boolean): void };
}

export class BallView {
  private wrap: HTMLElement;
  private btn: HTMLButtonElement;
  private img: HTMLImageElement;
  private bar: HTMLElement;
  private label: HTMLElement;
  private key: HTMLButtonElement;
  private keySub: HTMLElement;
  private keyFill: HTMLElement;
  private key$ = '';
  private size = -1;

  constructor(
    private get: () => GameState,
    private hooks: BallHooks,
  ) {
    // The ball sits on your desk, in the foreground of the view across the aisle.
    this.wrap = document.createElement('div');
    this.wrap.className = 'desk-ball';
    this.wrap.hidden = true;
    this.wrap.innerHTML = `
      <button type="button" class="ball-btn" aria-label="Your rubber band ball. Tap to wind spare bands on.">
        <img class="ball-img" alt="">
      </button>
      <div class="ball-meter" aria-hidden="true"><b class="ball-name"></b><span class="ball-bar"><i></i></span></div>`;
    document.getElementById('desk-front')!.append(this.wrap);
    // The Barrage key sits beside the Flick key.
    const keyBox = document.createElement('div');
    keyBox.innerHTML = `
      <button type="button" class="keycap barrage-key" aria-keyshortcuts="V" hidden>
        <span class="key-letter" aria-hidden="true">V</span>
        <span class="key-word">Barrage</span>
        <span class="key-hint barrage-sub"></span>
        <span class="barrage-fill" aria-hidden="true"><i></i></span>
      </button>`;
    const key = keyBox.firstElementChild as HTMLButtonElement;
    document.getElementById('key-row')!.append(key);
    this.btn = this.wrap.querySelector('.ball-btn')!;
    this.img = this.wrap.querySelector('.ball-img')!;
    this.bar = this.wrap.querySelector('.ball-bar i')!;
    this.label = this.wrap.querySelector('.ball-name')!;
    this.key = key;
    this.keySub = key.querySelector('.barrage-sub')!;
    this.keyFill = key.querySelector('.barrage-fill i')!;
    for (const el of [this.btn, this.key]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // A tap shouldn't leave a focus ring behind (keyboard focus still gets one).
    this.btn.addEventListener('click', (e) => {
      this.wind();
      if (e.detail > 0) this.btn.blur();
    });
    this.key.addEventListener('click', (e) => {
      this.barrage();
      if (e.detail > 0) this.key.blur();
    });
  }

  private get s() {
    return this.get();
  }

  /** Tap the ball: wind a quarter of your loose bands on. */
  wind() {
    const s = this.s;
    const r = wind(s);
    if (!r.ok) return this.hooks.say(r.reason);
    this.hooks.sound.wind(r.grew);
    this.plus(`+${n(r.amount)}`);
    this.btn.classList.remove('wound', 'grew');
    void this.btn.offsetWidth;
    this.btn.classList.add(r.grew ? 'grew' : 'wound');
    if (r.grew) {
      const z = BALL.sizes[r.size - 1];
      this.hooks.say(`Your ball is a ${z.name.replace('The ', '')} now! ${z.perk}, for good.`);
    } else {
      const next = nextBallSize(s);
      this.hooks.say(
        next
          ? `${n(r.amount)} bands wound on. ${n(s.ball.wound)} / ${n(next.at)} to a ${next.name.replace('The ', '')}: ${next.perk.charAt(0).toLowerCase()}${next.perk.slice(1)}.`
          : `${n(r.amount)} bands wound on. ${n(s.ball.wound)} in all. It’s getting a little scary.`,
      );
    }
  }

  /** The Barrage key (or V). */
  barrage() {
    const key = this.key;
    if (this.hooks.act(barrage)) {
      key.classList.add('pressed');
      setTimeout(() => key.classList.remove('pressed'), 120);
    }
  }

  private plus(text: string) {
    const p = document.createElement('span');
    p.className = 'ball-plus';
    p.textContent = text;
    this.wrap.append(p);
    setTimeout(() => p.remove(), 900);
  }

  handle(e: GameEvent) {
    if (e.type === 'ballReady') {
      this.wrap.classList.add('new');
      setTimeout(() => this.wrap.classList.remove('new'), 6000);
      this.hooks.say('That’s your rubber band ball, on your desk. Tap it to wind spare bands on: it grows, and every size is a perk for good.');
    }
  }

  render() {
    const s = this.s;
    this.renderKey(s);
    const on = ballUnlocked(s);
    this.wrap.hidden = !on;
    if (!on) return;

    const size = ballSize(s);
    const p = ballProgress(s);
    if (size !== this.size) {
      this.size = size;
      this.img.src = ART[size];
      this.wrap.dataset.size = String(size);
      this.btn.title = this.tip(s);
    }
    const scale = SCALE[size] + (SCALE[Math.min(4, size + 1)] - SCALE[size]) * p * 0.8;
    this.btn.style.setProperty('--ball-scale', scale.toFixed(3));
    const next = nextBallSize(s);
    this.label.textContent = next ? `${short(s.ball.wound)} / ${short(next.at)}` : `${BALL.sizes[size - 1].name}`;
    setFill(this.bar, p);
  }

  /** The Barrage key: only in the war, once you have a team. */
  private renderKey(s: GameState) {
    const show = barrageUnlocked(s) && !s.lookBusy;
    this.key.hidden = !show;
    if (!show) return;
    const cd = barrageCooldown(s);
    const ready = canBarrage(s).ok;
    const sub = cd > 0 ? `reloading ${Math.ceil(cd)} s` : s.bands < BARRAGE.min ? `needs ${BARRAGE.min} bands` : `${short(barrageSize(s))} bands`;
    const key = `${ready}|${sub}`;
    if (key !== this.key$) {
      this.key$ = key;
      this.keySub.innerHTML = sub.replace(/^(reloading|needs) /, '<span class="long">$1 </span>');
      this.key.dataset.ready = String(ready);
      this.key.setAttribute('aria-label', `Barrage: ${cd > 0 || s.bands < BARRAGE.min ? sub : `throw ${sub} at once`}`);
    }
    setFill(this.keyFill, cd > 0 ? 1 - cd / BARRAGE.cooldown : 1);
  }

  /** The tooltip: every size, its perk, and which ones you have. */
  private tip(s: GameState) {
    const size = ballSize(s);
    return [
      'Your rubber band ball. Tap to wind on a quarter of your loose bands.',
      ...BALL.sizes.map((z, i) => `${i < size ? '✓' : '·'} ${z.name} (${n(z.at)}): ${z.perk}`),
    ].join('\n');
  }
}
