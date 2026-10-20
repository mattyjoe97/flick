// What you shoot with, first-person style: your hand (or the DIY gun in it)
// reaches into the office from the bottom-right corner and turns at the wrist
// to aim at whoever you're flicking. Hold to stretch (the hand pulls back),
// let go to fire (the band leaves and a fresh one is loaded). Hold too long and
// it shakes, then the band snaps and drops.
//
// The art is hand-painted sprites (see art/source and tools/prepare-art.py),
// each in a loaded and an empty version.

import { attr, setFill } from './fill';
import { CHARGE, type WeaponId } from '../sim/content';
import { SPRITES, BAND_SNAPPED, type LauncherSprite, type BandRig } from './art';
import flickEmpty from '../assets/art/flick-empty.webp';
import rulerEmpty from '../assets/art/ruler-empty.webp';
import clothespinEmpty from '../assets/art/clothespin-empty.webp';
import repeaterEmpty from '../assets/art/repeater-empty.webp';
// The Gatling's spool is painted loaded (it has no bands for the game to draw).
import gatlingLoaded from '../assets/art/gatling-loaded.webp';
import bandSnapped from '../assets/art/band-snapped.webp';

const ART: Record<WeaponId, { sprite: LauncherSprite; art: string }> = {
  flick: { sprite: SPRITES.flick, art: flickEmpty },
  ruler: { sprite: SPRITES.ruler, art: rulerEmpty },
  clothespin: { sprite: SPRITES.clothespin, art: clothespinEmpty },
  repeater: { sprite: SPRITES.repeater, art: repeaterEmpty },
  // The Gatling is drawn a little smaller than true scale so its barrel stops short of whoever you're aiming at.
  gatling: { sprite: { ...SPRITES.gatling, unit: SPRITES.gatling.unit * 0.8 }, art: gatlingLoaded },
};

/** Where your wrist is in the scene (800 x 420). Everything turns around this point to aim. */
const PIVOTS: Record<WeaponId, { x: number; y: number }> = {
  flick: { x: 750, y: 396 },
  ruler: { x: 764, y: 396 },
  clothespin: { x: 764, y: 394 },
  repeater: { x: 762, y: 390 },
  gatling: { x: 780, y: 410 },
};

/** The Gatling's long barrel would cover whoever you're aiming at: it points at their chest instead (the bands still fly at their head). */
const AIM_LOW: Partial<Record<WeaponId, number>> = { gatling: 75 };

// Band animation timing (ms). After a shot the band springs off the front, then a fresh
// one is hooked on and pulled back into place. With several bands, each goes in turn.
const RELEASE_MS = 80;
const LOAD_DELAY = 110;
const LOAD_MS = 300;
const STAGGER = 70;
const SNAP_RELOAD = 650;

/** The band in the Perfect window: gold. */
const BAND_GOLD = '#ffd23f';

const BAND_INK = '#2b2018';
const BAND_TAN = '#d9b783';
const BAND_TAUT = '#f1dcb0';
const OUTLINE_W = 7.5;
const INNER_W = 4;

type P = [number, number];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const easeIn = (t: number) => t * t;
const easeOutBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

interface BandEls {
  rig: BandRig;
  loopOut: SVGEllipseElement;
  loopIn: SVGEllipseElement;
  out: [SVGPathElement, SVGPathElement];
  inner: [SVGPathElement, SVGPathElement];
}

export interface LauncherHooks {
  /** Can we start stretching? Shows a message and returns false if not. */
  canStart(): boolean;
  fire(charge: number, perfect: boolean): void;
  snap(): void;
  stretchSound(charge: number | null): void;
  /** What the next Perfect would be worth (it grows with Perfects in a row). */
  perfectMult(): number;
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
  private bands: BandEls[] = [];
  /** When the last band was fired, when the next one starts loading, and when one snapped. */
  private releaseAt = -1e9;
  private loadAt = -1e9;
  /** When the current launcher was put in your hand (it slides up into view). */
  private enterAt = -1e9;
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
    this.shot(performance.now());
  }

  private shot(now: number) {
    this.firedAt = now;
    this.releaseAt = now;
    this.loadAt = now + LOAD_DELAY;
  }

  cancel() {
    this.holding = false;
    this.hooks.stretchSound(null);
  }

  /** A quick flick with no stretch (keyboard activation of the button). */
  tap() {
    if (this.holding) return;
    this.hooks.fire(0, false);
    this.shot(performance.now());
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
    const { sprite: sp, art } = ART[w];
    const ellipse = (stroke: string, width: number) => `<ellipse fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
    const path = (stroke: string, width: number) => `<path fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
    // Outlines for every band first, then the tan on top, so overlapping strands merge cleanly.
    const outlines = sp.bands.map(() => `<g class="b-out">${ellipse(BAND_INK, OUTLINE_W)}${path(BAND_INK, OUTLINE_W)}${path(BAND_INK, OUTLINE_W)}</g>`).join('');
    const inners = sp.bands.map(() => `<g class="b-in">${ellipse(BAND_TAN, INNER_W)}${path(BAND_TAN, INNER_W)}${path(BAND_TAN, INNER_W)}</g>`).join('');
    this.layer.innerHTML = `<g class="launch-aim"><g class="launch-pull"><g class="launch-sprite"><image href="${art}" x="${-sp.wrist[0]}" y="${-sp.wrist[1]}" width="${sp.w}" height="${sp.h}" preserveAspectRatio="none"/><g transform="translate(${-sp.wrist[0]} ${-sp.wrist[1]})">${outlines}${inners}</g></g></g></g><g class="launch-fx"></g>`;
    this.aimG = this.layer.querySelector('.launch-aim')!;
    this.pullG = this.layer.querySelector('.launch-pull')!;
    this.spriteG = this.layer.querySelector('.launch-sprite')!;
    this.fxG = this.layer.querySelector('.launch-fx')!;
    this.layer.dataset.state = 'idle';
    const outs = Array.from(this.layer.querySelectorAll<SVGGElement>('.b-out'));
    const ins = Array.from(this.layer.querySelectorAll<SVGGElement>('.b-in'));
    this.bands = sp.bands.map((rig, i) => {
      const o = outs[i].children;
      const n = ins[i].children;
      return {
        rig,
        loopOut: o[0] as SVGEllipseElement,
        loopIn: n[0] as SVGEllipseElement,
        out: [o[1] as SVGPathElement, o[2] as SVGPathElement],
        inner: [n[1] as SVGPathElement, n[2] as SVGPathElement],
      };
    });
    this.dropped = [];
    // A new weapon slides into your hand from below, then its bands are pulled into place.
    this.enterAt = performance.now();
    this.releaseAt = -1e9;
    this.loadAt = this.enterAt + 260;
  }

  /**
   * Draw one band. `reach` is how far its back end has been pulled toward its anchor
   * (0 = bunched at the front hook, 1 = in place), `loop` the size of the front loop.
   */
  private drawBand(b: BandEls, reach: number, loop: number, sag: number, width: number, color: string) {
    const { rig } = b;
    const visible = loop > 0.01;
    for (const el of [b.loopOut, b.loopIn, ...b.out, ...b.inner]) el.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) return;
    const [cx, cy, rx, ry] = rig.loop;
    for (const el of [b.loopOut, b.loopIn]) {
      el.setAttribute('cx', String(cx));
      el.setAttribute('cy', String(cy));
      el.setAttribute('rx', (rx * loop).toFixed(2));
      el.setAttribute('ry', (ry * loop).toFixed(2));
    }
    const strands = reach > 0.02;
    for (let k = 0; k < 2; k++) {
      const f = rig.front[k];
      const r = lerp(f, rig.rear[k], reach);
      const dx = r[0] - f[0];
      const dy = r[1] - f[1];
      const len = Math.hypot(dx, dy) || 1;
      // Slack bows the strand downward (perpendicular to it).
      const mx = (f[0] + r[0]) / 2 + (-dy / len) * sag * (k === 0 ? 1 : 1.3);
      const my = (f[1] + r[1]) / 2 + (dx / len) * sag * (k === 0 ? 1 : 1.3);
      const d = `M${f[0].toFixed(1)} ${f[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${r[0].toFixed(1)} ${r[1].toFixed(1)}`;
      for (const el of [b.out[k], b.inner[k]]) {
        el.setAttribute('d', d);
        el.style.visibility = strands ? 'visible' : 'hidden';
      }
      b.out[k].setAttribute('stroke-width', (OUTLINE_W * width).toFixed(2));
      b.inner[k].setAttribute('stroke-width', (INNER_W * width).toFixed(2));
      b.inner[k].setAttribute('stroke', color);
    }
    b.loopOut.setAttribute('stroke-width', (OUTLINE_W * width).toFixed(2));
    b.loopIn.setAttribute('stroke-width', (INNER_W * width).toFixed(2));
    b.loopIn.setAttribute('stroke', color);
  }

  /** Work out where each band is in its fire / reload cycle and draw it. */
  private animateBands(now: number, charge: number, state: 'idle' | 'stretch' | 'perfect' | 'over', reduced: boolean) {
    const color = state === 'over' ? '#e8a07a' : state === 'perfect' ? BAND_GOLD : mix(BAND_TAN, BAND_TAUT, charge);
    const width = 1 - 0.38 * charge;
    const quiver = reduced ? 0 : state === 'over' ? (Math.random() - 0.5) * 5 : state === 'perfect' ? (Math.random() - 0.5) * 1.6 : 0;
    this.bands.forEach((b, i) => {
      const st = i * STAGGER;
      const tLoad = now - (this.loadAt + st);
      const tRel = now - (this.releaseAt + st);
      if (reduced) {
        // No motion: the band is simply on, or gone for a moment after a shot.
        const on = tLoad >= 0 || tRel < 0;
        this.drawBand(b, 1, on ? 1 : 0, 0, 1, BAND_TAN);
        return;
      }
      if (tLoad < 0) {
        if (this.releaseAt > this.loadAt - LOAD_DELAY - 1 && tRel >= 0 && tRel < RELEASE_MS) {
          // Fired: the back end lets go and whips forward to the front hook.
          this.drawBand(b, 1 - easeIn(tRel / RELEASE_MS), 1, 0, 1, BAND_TAN);
        } else if (tRel < 0 && this.releaseAt > this.loadAt - LOAD_DELAY - 1) {
          // Still waiting its turn in a burst.
          this.drawBand(b, 1, 1, 0, width, color);
        } else this.drawBand(b, 0, 0, 0, 1, BAND_TAN);
        return;
      }
      if (tLoad < LOAD_MS) {
        // Loading: hook a fresh band on the front, then pull its back end into place.
        const k = tLoad / LOAD_MS;
        const loop = Math.min(1, easeOutBack(Math.min(1, k / 0.3)));
        const q = Math.max(0, (k - 0.3) / 0.7);
        const reach = q > 0 ? easeOutBack(q) : 0;
        this.drawBand(b, reach, loop, 7 * (1 - q), 1.12 - 0.12 * q, BAND_TAN);
        return;
      }
      this.drawBand(b, 1, 1, quiver, width, color);
    });
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
  /** `shift`: how far left of the corner your wrist sits (a narrow view crops the right side). */
  update(w: WeaponId, aim: { x: number; y: number }, reduced: boolean, shift = 0) {
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
      // Held too long: the band shakes for a moment, then snaps and drops. Let go and press again.
      if (r.held >= CHARGE.snapAfter) {
        this.holding = false;
        this.snappedAt = now;
        this.hooks.stretchSound(null);
        this.hooks.snap();
        if (!reduced) this.dropBand();
        this.releaseAt = -1e9;
        this.loadAt = now + SNAP_RELOAD;
        charge = 0;
        state = 'idle';
      } else this.hooks.stretchSound(charge);
    }

    // Turn smoothly toward the target at the wrist. The art points left; mirror it if we ever aim right.
    const pivot = { x: PIVOTS[w].x - shift, y: PIVOTS[w].y };
    aim = { x: aim.x, y: aim.y + (AIM_LOW[w] ?? 0) };
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
    const entering = Math.min(1, (now - this.enterAt) / 420);
    const drop = reduced ? 0 : Math.pow(1 - entering, 3) * 170;
    attr(this.aimG, 'transform', `translate(${(pivot.x + drop * 0.3).toFixed(1)} ${(pivot.y + drop).toFixed(1)}) rotate(${rot.toFixed(1)})`);
    const unit = sp.unit;
    attr(this.spriteG, 'transform', `scale(${left ? unit : -unit} ${unit})`);

    // Pull back while stretching, kick forward right after firing, shake when over-held.
    const sinceFire = now - this.firedAt;
    const kick = sinceFire < 140 ? 12 * (1 - sinceFire / 140) : 0;
    const shake = reduced ? 0 : state === 'over' ? (Math.random() - 0.5) * 6 : state === 'perfect' ? (Math.random() - 0.5) * 1.5 : 0;
    const forward = left ? -1 : 1;
    const along = forward * (-22 * charge + kick + shake);
    attr(this.pullG, 'transform', `translate(${along.toFixed(1)} ${(shake * 0.6).toFixed(1)})`);

    // The band glows gold in the Perfect window (CSS keys off this).
    if (this.layer.dataset.state !== state) this.layer.dataset.state = state;

    // The band(s): fired, reloaded, stretched.
    const sinceSnap = now - this.snappedAt;
    this.animateBands(now, charge, state, reduced);

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
    setFill(this.fill, charge);
    attr(this.meter, 'data-state', state);
    const text =
      state === 'perfect'
        ? `Let go! Perfect ×${this.hooks.perfectMult()}`
        : state === 'over'
          ? 'Let go! It’s going to snap'
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
