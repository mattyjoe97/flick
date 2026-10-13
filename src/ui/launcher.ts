// What you shoot with, first-person style: your hand (or the DIY gun in it)
// reaches into the office from the bottom-right corner and turns at the wrist
// to aim at whoever you're flicking. Hold to stretch (the hand pulls back),
// let go to fire (the band leaves and a fresh one is loaded). Hold too long and
// it shakes, then the band snaps and drops.
//
// The art is hand-painted sprites (see art/source and tools/prepare-art.py),
// each in a loaded and an empty version.

import { CHARGE, type WeaponId } from '../sim/content';
import { SPRITES, BAND_SNAPPED, type LauncherSprite } from './art';
import flickLoaded from '../assets/art/flick-loaded.webp';
import flickEmpty from '../assets/art/flick-empty.webp';
import rulerLoaded from '../assets/art/ruler-loaded.webp';
import rulerEmpty from '../assets/art/ruler-empty.webp';
import clothespinLoaded from '../assets/art/clothespin-loaded.webp';
import clothespinEmpty from '../assets/art/clothespin-empty.webp';
import repeaterLoaded from '../assets/art/repeater-loaded.webp';
import repeaterEmpty from '../assets/art/repeater-empty.webp';
import bandSnapped from '../assets/art/band-snapped.webp';

const ART: Record<WeaponId, { sprite: LauncherSprite; loaded: string; empty: string }> = {
  flick: { sprite: SPRITES.flick, loaded: flickLoaded, empty: flickEmpty },
  ruler: { sprite: SPRITES.ruler, loaded: rulerLoaded, empty: rulerEmpty },
  clothespin: { sprite: SPRITES.clothespin, loaded: clothespinLoaded, empty: clothespinEmpty },
  repeater: { sprite: SPRITES.repeater, loaded: repeaterLoaded, empty: repeaterEmpty },
};

/** Where your wrist is in the scene (800 x 420). Everything turns around this point to aim. */
const PIVOTS: Record<WeaponId, { x: number; y: number }> = {
  flick: { x: 750, y: 396 },
  ruler: { x: 764, y: 396 },
  clothespin: { x: 764, y: 394 },
  repeater: { x: 762, y: 390 },
};

/** How long the launcher shows empty after a shot before the next band is on. */
const RELOAD_MS = 260;

export interface LauncherHooks {
  /** Can we start stretching? Shows a message and returns false if not. */
  canStart(): boolean;
  fire(charge: number, perfect: boolean): void;
  snap(): void;
  stretchSound(charge: number | null): void;
}

interface Dropped {
  el: SVGImageElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  t0: number;
}

export class Launcher {
  private holding = false;
  private holdStart = 0;
  private firedAt = -1e9;
  private snappedAt = -1e9;
  private weaponId: WeaponId | null = null;
  private aimG!: SVGGElement;
  private pullG!: SVGGElement;
  private spriteG!: SVGGElement;
  private loadedImg!: SVGImageElement;
  private emptyImg!: SVGImageElement;
  private fxG!: SVGGElement;
  private dropped: Dropped[] = [];
  private angle = -150;
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
    const { sprite: sp, loaded, empty } = ART[w];
    const img = (href: string, cls: string) =>
      `<image class="${cls}" href="${href}" x="${-sp.wrist[0]}" y="${-sp.wrist[1]}" width="${sp.w}" height="${sp.h}" preserveAspectRatio="none"/>`;
    this.layer.innerHTML = `<g class="launch-aim"><g class="launch-pull"><g class="launch-sprite">${img(loaded, 'ls-loaded')}${img(empty, 'ls-empty')}</g></g></g><g class="launch-fx"></g>`;
    this.aimG = this.layer.querySelector('.launch-aim')!;
    this.pullG = this.layer.querySelector('.launch-pull')!;
    this.spriteG = this.layer.querySelector('.launch-sprite')!;
    this.loadedImg = this.layer.querySelector('.ls-loaded')!;
    this.emptyImg = this.layer.querySelector('.ls-empty')!;
    this.fxG = this.layer.querySelector('.launch-fx')!;
    this.dropped = [];
  }

  private get sprite() {
    return ART[this.weaponId ?? 'flick'].sprite;
  }

  /** A point on the sprite (sprite pixels) in page coordinates. */
  private spriteToClient(p: [number, number]) {
    const ctm = this.spriteG?.getScreenCTM();
    if (!ctm) return null;
    const x = p[0] - this.sprite.wrist[0];
    const y = p[1] - this.sprite.wrist[1];
    return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f };
  }

  /** Where the band leaves from, in page coordinates (so shots start at the muzzle or fingertip). */
  tipClientPoint(): { x: number; y: number } | null {
    return this.spriteToClient(this.sprite.tip);
  }

  /** The snapped band falls off the launcher and drops out of view. */
  private dropBand() {
    const ctm = this.spriteG?.getCTM();
    if (!ctm || !this.fxG) return;
    const sp = this.sprite;
    const x = sp.band[0] - sp.wrist[0];
    const y = sp.band[1] - sp.wrist[1];
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    const w = 46;
    const h = (w * BAND_SNAPPED.h) / BAND_SNAPPED.w;
    el.setAttribute('href', bandSnapped);
    el.setAttribute('x', String(-w / 2));
    el.setAttribute('y', String(-h / 2));
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
    this.fxG.appendChild(el);
    this.dropped.push({
      el,
      x: ctm.a * x + ctm.c * y + ctm.e,
      y: ctm.b * x + ctm.d * y + ctm.f,
      vx: 40 + Math.random() * 40,
      vy: -120,
      rot: 0,
      spin: 260 + Math.random() * 200,
      t0: performance.now(),
    });
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
        if (!reduced) this.dropBand();
      } else this.hooks.stretchSound(charge);
    }

    // Turn smoothly toward the target at the wrist. The art points left; mirror it if we ever aim right.
    const pivot = PIVOTS[w];
    const sp = this.sprite;
    const toTarget = Math.atan2(aim.y - pivot.y, aim.x - pivot.x);
    // The barrel (or fingertip) sits above the wrist, so turn a little further so that line, not the wrist's, meets the target.
    const above = (sp.wrist[1] - sp.tip[1]) * sp.unit;
    const dist = Math.max(1, Math.hypot(aim.x - pivot.x, aim.y - pivot.y));
    const correction = Math.asin(Math.max(-0.9, Math.min(0.9, above / dist)));
    const want = ((toTarget + (Math.cos(toTarget) < 0 ? -correction : correction)) * 180) / Math.PI;
    let diff = want - this.angle;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    this.angle += diff * (reduced ? 1 : Math.min(1, dt * 7));
    const left = Math.cos((this.angle * Math.PI) / 180) < 0;
    // Tip up a little as the band stretches, like bracing for the shot.
    const lift = left ? 4 * charge : -4 * charge;
    const rot = (left ? this.angle - 180 : this.angle) + lift;
    this.aimG.setAttribute('transform', `translate(${pivot.x} ${pivot.y}) rotate(${rot.toFixed(2)})`);
    const unit = sp.unit;
    this.spriteG.setAttribute('transform', `scale(${left ? unit : -unit} ${unit})`);

    // Pull back while stretching, kick forward right after firing, shake when over-held.
    const sinceFire = now - this.firedAt;
    const kick = sinceFire < 140 ? 12 * (1 - sinceFire / 140) : 0;
    const shake = reduced ? 0 : state === 'over' ? (Math.random() - 0.5) * 6 : state === 'perfect' ? (Math.random() - 0.5) * 1.5 : 0;
    const forward = left ? -1 : 1;
    const along = forward * (-22 * charge + kick + shake);
    this.pullG.setAttribute('transform', `translate(${along.toFixed(2)} ${(shake * 0.6).toFixed(2)})`);

    // Loaded or empty: the band is gone for a moment after a shot (or a snap), then a fresh one is on.
    const sinceSnap = now - this.snappedAt;
    const empty = sinceFire < RELOAD_MS || sinceSnap < 600;
    this.loadedImg.style.visibility = empty ? 'hidden' : 'visible';
    this.emptyImg.style.visibility = empty ? 'visible' : 'hidden';

    // Snapped bands tumble down and fade.
    this.dropped = this.dropped.filter((d) => {
      const t = (now - d.t0) / 1000;
      if (t > 0.9) {
        d.el.remove();
        return false;
      }
      d.vy += 900 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      d.el.setAttribute('transform', `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) rotate(${d.rot.toFixed(1)})`);
      d.el.style.opacity = String(Math.min(1, (0.9 - t) / 0.3));
      return true;
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
