// Your hand, first-person style: it reaches into the office view from the
// bottom-right corner and turns to aim at whoever you're flicking. Hold to
// stretch the band (the thumb pulls back, the band thins), let go to fire.
// Hold too long and it shakes, then snaps.

import { CHARGE, type WeaponId } from '../sim/content';
import { handBody, handThumb, heldObject, THUMB_BASE, THUMB_TIP_HOOK, type HeldObject } from './hand';

/** Where the wrist sits (just off the bottom-right of the scene) and how big the hand is. */
const PIVOT = { x: 722, y: 482 };
const SCALE = 0.86;

export interface LauncherHooks {
  /** Can we start stretching? Shows a message and returns false if not. */
  canStart(): boolean;
  fire(charge: number, perfect: boolean): void;
  snap(): void;
  stretchSound(charge: number | null): void;
}

type Pt = [number, number];

function rot(p: Pt, c: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}

export class Launcher {
  private holding = false;
  private holdStart = 0;
  private firedAt = -1e9;
  private snappedAt = -1e9;
  private weaponId: WeaponId | null = null;
  private obj: HeldObject = heldObject('flick');
  private aimG!: SVGGElement;
  private pullG!: SVGGElement;
  private thumbG!: SVGGElement;
  private bandEls: SVGPathElement[] = [];
  private angle = -135;
  private lastFrame = performance.now();
  private meter: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;

  constructor(
    private hooks: LauncherHooks,
    private layer: SVGGElement,
  ) {
    this.meter = document.getElementById('tension')!;
    this.fill = document.getElementById('tension-fill')!;
    this.label = document.getElementById('tension-label')!;
  }

  get isHolding() {
    return this.holding;
  }

  start() {
    if (this.holding) return;
    if (!this.hooks.canStart()) return;
    this.holding = true;
    this.holdStart = performance.now();
  }

  /** Let go: fires with however much stretch you built up. */
  release() {
    if (!this.holding) return;
    this.holding = false;
    this.hooks.stretchSound(null);
    const { charge, perfect } = this.read(performance.now());
    this.hooks.fire(charge, perfect);
    this.firedAt = performance.now();
  }

  cancel() {
    this.holding = false;
    this.hooks.stretchSound(null);
  }

  /** A quick flick with no stretch (keyboard activation of the button). */
  tap() {
    if (this.holding) return;
    this.hooks.fire(0, false);
    this.firedAt = performance.now();
  }

  private read(now: number) {
    const held = (now - this.holdStart) / 1000;
    const charge = Math.min(1, Math.max(0, (held - CHARGE.deadZone) / CHARGE.fullAfter));
    const fullAt = CHARGE.deadZone + CHARGE.fullAfter;
    const perfect = held >= fullAt && held <= fullAt + CHARGE.perfectWindow;
    const overheld = held > fullAt + CHARGE.perfectWindow;
    return { held, charge, perfect, overheld };
  }

  private build(w: WeaponId) {
    this.weaponId = w;
    this.obj = heldObject(w);
    const bands = this.obj.bands.map(() => `<path class="lb"/><path class="lb"/>`).join('');
    this.layer.innerHTML = `<g class="hand-aim"><g class="hand-pull">${this.obj.behind}${handBody()}<g class="hand-thumb">${handThumb()}</g>${this.obj.front}<g class="hand-bands">${bands}</g></g></g>`;
    this.aimG = this.layer.querySelector('.hand-aim')!;
    this.pullG = this.layer.querySelector('.hand-pull')!;
    this.thumbG = this.layer.querySelector('.hand-thumb')!;
    this.bandEls = Array.from(this.layer.querySelectorAll<SVGPathElement>('.lb'));
  }

  /** Where the band leaves from, in page coordinates (so shots start at the front of the band). */
  tipClientPoint(): { x: number; y: number } | null {
    const ctm = this.pullG?.getScreenCTM();
    if (!ctm) return null;
    const [a, b] = this.obj.bands[0].front;
    const x = (a[0] + b[0]) / 2;
    const y = (a[1] + b[1]) / 2;
    return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f };
  }

  /** Call every frame with the weapon and the point (in scene units) to aim at. */
  update(w: WeaponId, aim: { x: number; y: number }, reduced: boolean) {
    if (w !== this.weaponId) this.build(w);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    let charge = 0;
    let state: 'idle' | 'stretch' | 'perfect' | 'over' = 'idle';
    if (this.holding) {
      const r = this.read(now);
      charge = r.charge;
      state = r.perfect ? 'perfect' : r.overheld ? 'over' : 'stretch';
      if (r.held >= CHARGE.snapAfter) {
        this.holding = false;
        this.snappedAt = now;
        this.hooks.stretchSound(null);
        this.hooks.snap();
      } else this.hooks.stretchSound(charge);
    }

    // Turn smoothly toward the target. Flip the hand when aiming left so it stays upright.
    const want = (Math.atan2(aim.y - PIVOT.y, aim.x - PIVOT.x) * 180) / Math.PI;
    this.angle += (want - this.angle) * (reduced ? 1 : Math.min(1, dt * 7));
    const flip = Math.cos((this.angle * Math.PI) / 180) < 0 ? -1 : 1;
    this.aimG.setAttribute('transform', `translate(${PIVOT.x} ${PIVOT.y}) rotate(${this.angle.toFixed(2)}) scale(${SCALE} ${SCALE * flip})`);

    // Pull back while stretching, kick forward right after firing, shake when over-held.
    const sinceFire = now - this.firedAt;
    const kick = sinceFire < 140 ? 10 * (1 - sinceFire / 140) : 0;
    const shake = reduced ? 0 : state === 'over' ? (Math.random() - 0.5) * 6 : state === 'perfect' ? (Math.random() - 0.5) * 1.5 : 0;
    this.pullG.setAttribute('transform', `translate(${(-22 * charge + kick + shake).toFixed(2)} ${(shake * 0.6).toFixed(2)})`);

    // The thumb cocks back as you stretch and snaps forward when you let go.
    const thumbDeg = -26 * charge + (sinceFire < 160 ? 8 * (1 - sinceFire / 160) : 0);
    this.thumbG.setAttribute('transform', `rotate(${thumbDeg.toFixed(2)} ${THUMB_BASE[0]} ${THUMB_BASE[1]})`);
    const thumbHooks = THUMB_TIP_HOOK.map((p) => rot(p, THUMB_BASE, thumbDeg)) as [Pt, Pt];

    // Bands: thinner and lighter the more they stretch; gone for a moment after a shot or a snap.
    const sinceSnap = now - this.snappedAt;
    const hidden = sinceFire < 150 || sinceSnap < 450;
    const width = 5 - 2.4 * charge;
    const color = state === 'over' ? '#d0584a' : mix('#a86c36', '#e2bd8a', charge);
    this.obj.bands.forEach((b, i) => {
      const back: [Pt, Pt] = b.back ? [[b.back[0] - 22 * charge, b.back[1]], [b.back[0] - 22 * charge, b.back[1] + 6]] : thumbHooks;
      const els = [this.bandEls[i * 2], this.bandEls[i * 2 + 1]];
      els.forEach((el, k) => {
        const f = b.front[k];
        const bk = back[k];
        const sag = 5 * (1 - charge);
        el.setAttribute('d', `M${f[0]} ${f[1]} Q${((f[0] + bk[0]) / 2).toFixed(1)} ${((f[1] + bk[1]) / 2 + sag).toFixed(1)} ${bk[0].toFixed(1)} ${bk[1].toFixed(1)}`);
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', width.toFixed(2));
        el.style.opacity = hidden ? '0' : '1';
      });
    });

    // Tension meter next to the Flick key
    this.fill.style.width = `${(charge * 100).toFixed(1)}%`;
    this.meter.dataset.state = state;
    const text =
      state === 'perfect'
        ? `Perfect! ×${CHARGE.perfectMult}`
        : state === 'over'
          ? 'Let go!'
          : charge > 0
            ? `×${(1 + (CHARGE.maxMult - 1) * charge).toFixed(1)}`
            : sinceSnap < 900
              ? 'Snap! Too long.'
              : 'Hold to stretch';
    if (this.label.textContent !== text) this.label.textContent = text;
  }
}

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
