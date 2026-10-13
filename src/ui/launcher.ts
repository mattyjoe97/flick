// Your hand at the bottom of the screen, holding whatever you're flicking
// with. Hold to stretch the band (it thins and the hand pulls back), let go to
// fire. Hold too long and it starts to shake, then snaps.

import { CHARGE, type WeaponId } from '../sim/content';

const INK = '#2b2522';
const SKIN = '#f2c9a5';
const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;

interface Rig {
  pose: 'point' | 'grip';
  /** Where each band is hooked at the front, and where it's held at the back. */
  bands: { hookL: [number, number]; hookR: [number, number]; anchor: [number, number] }[];
  /** How far the back anchor travels at full stretch. */
  pull: [number, number];
  /** Drawn behind the hand. */
  behind: string;
  /** Drawn in front of the hand. */
  front: string;
}

/** A finger-gun hand for the plain flick: index finger up, band hooked over the fingertip. */
function pointHand(): string {
  return `
    <path fill="#eef1f4" ${o} d="M90 170 L174 170 L178 206 L86 206 Z"/>
    <circle cx="152" cy="188" r="3" fill="#b9c0c8"/>
    <g transform="rotate(-18 88 140)"><rect x="74" y="84" width="27" height="62" rx="13" fill="${SKIN}" ${o}/><path fill="none" stroke="${INK}" stroke-width="2" d="M80 100 Q87 96 94 100"/></g>
    <rect x="94" y="98" width="78" height="78" rx="24" fill="${SKIN}" ${o}/>
    <rect x="150" y="102" width="40" height="24" rx="12" fill="${SKIN}" ${o}/>
    <rect x="150" y="124" width="38" height="24" rx="12" fill="${SKIN}" ${o}/>
    <rect x="150" y="146" width="34" height="22" rx="11" fill="${SKIN}" ${o}/>
    <rect x="113" y="14" width="30" height="98" rx="15" fill="${SKIN}" ${o}/>
    <rect x="119" y="19" width="18" height="16" rx="7" fill="#f8ddc6" stroke="${INK}" stroke-width="2"/>
    <path fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" d="M120 62 Q128 58 136 62 M120 86 Q128 82 136 86 M110 124 Q120 118 128 124"/>`;
}

/** A fist gripping a stick or ruler: fingers wrapped around the front, thumb over the top. */
function gripHand(): string {
  return `
    <path fill="#eef1f4" ${o} d="M92 176 L172 176 L176 210 L88 210 Z"/>
    <circle cx="150" cy="194" r="3" fill="#b9c0c8"/>
    <rect x="98" y="104" width="70" height="78" rx="22" fill="${SKIN}" ${o}/>
    <rect x="104" y="106" width="70" height="20" rx="10" fill="${SKIN}" ${o}/>
    <rect x="104" y="124" width="68" height="20" rx="10" fill="${SKIN}" ${o}/>
    <rect x="104" y="142" width="64" height="19" rx="9.5" fill="${SKIN}" ${o}/>
    <rect x="104" y="159" width="58" height="18" rx="9" fill="${SKIN}" ${o}/>
    <g transform="rotate(-8 100 100)"><rect x="84" y="88" width="62" height="24" rx="12" fill="${SKIN}" ${o}/><rect x="128" y="92" width="14" height="14" rx="5" fill="#f8ddc6" stroke="${INK}" stroke-width="2"/></g>`;
}

function rig(w: WeaponId): Rig {
  switch (w) {
    case 'ruler':
      return {
        pose: 'grip',
        bands: [{ hookL: [119, -14], hookR: [139, -14], anchor: [92, 96] }],
        pull: [-8, 24],
        behind: `<rect x="117" y="-20" width="24" height="170" rx="2" fill="#e2b86b" ${o}/>${Array.from(
          { length: 14 },
          (_, i) => `<line x1="117" x2="${i % 4 === 0 ? 129 : 124}" y1="${-10 + i * 11}" y2="${-10 + i * 11}" stroke="${INK}" stroke-width="1.5"/>`,
        ).join('')}<path d="M124 -20 L129 -12 L134 -20" fill="#f2c9a5" stroke="${INK}" stroke-width="2"/>`,
        front: '',
      };
    case 'clothespin':
      return {
        pose: 'grip',
        bands: [{ hookL: [119, -14], hookR: [139, -14], anchor: [129, 44] }],
        pull: [0, 10],
        behind: `<rect x="119" y="-20" width="20" height="150" rx="3" fill="#d9b27c" ${o}/><g><rect x="111" y="40" width="17" height="56" rx="4" fill="#e9cf9f" ${o}/><rect x="130" y="40" width="17" height="56" rx="4" fill="#e9cf9f" ${o}/><path d="M113 70 Q129 58 145 70" fill="none" stroke="#9aa3ab" stroke-width="4"/><circle cx="129" cy="66" r="4" fill="#9aa3ab" stroke="${INK}" stroke-width="2"/></g>`,
        front: '',
      };
    case 'repeater':
      return {
        pose: 'grip',
        bands: [
          { hookL: [117, -14], hookR: [141, -14], anchor: [129, 26] },
          { hookL: [115, -10], hookR: [143, -10], anchor: [129, 50] },
          { hookL: [113, -6], hookR: [145, -6], anchor: [129, 74] },
        ],
        pull: [0, 8],
        behind: `<rect x="119" y="-20" width="20" height="150" rx="3" fill="#d9b27c" ${o}/>`,
        front: [20, 44, 68]
          .map(
            (y) =>
              `<g><path d="M113 ${y} L145 ${y} L141 ${y + 14} L117 ${y + 14} Z" fill="#26292d" ${o}/><path d="M117 ${y} Q110 ${y - 14} 121 ${y - 18} M141 ${y} Q148 ${y - 14} 137 ${y - 18}" fill="none" stroke="#b9c0c8" stroke-width="3"/></g>`,
          )
          .join(''),
      };
    default:
      return {
        pose: 'point',
        bands: [{ hookL: [116, 24], hookR: [140, 24], anchor: [186, 158] }],
        pull: [14, 30],
        behind: '',
        front: '',
      };
  }
}

export interface LauncherHooks {
  /** Can we start stretching? Shows a message and returns false if not. */
  canStart(): boolean;
  fire(charge: number, perfect: boolean): void;
  snap(): void;
  stretchSound(charge: number | null): void;
}

export class Launcher {
  private holding = false;
  private holdStart = 0;
  private firedAt = -1e9;
  private snappedAt = -1e9;
  private weaponId: WeaponId | null = null;
  private bandEls: SVGPathElement[] = [];
  private body!: SVGGElement;
  private svg: SVGSVGElement;
  private meter: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;
  private rigNow: Rig = rig('flick');

  constructor(private hooks: LauncherHooks) {
    this.svg = document.getElementById('hand') as unknown as SVGSVGElement;
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

  /** Where the band leaves from, in page coordinates (so shots start at your fingertip). */
  tipClientPoint(): { x: number; y: number } | null {
    const ctm = this.body?.getScreenCTM();
    if (!ctm) return null;
    const b = this.rigNow.bands[0];
    const x = (b.hookL[0] + b.hookR[0]) / 2;
    const y = b.hookL[1];
    return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f };
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
    this.rigNow = rig(w);
    const bands = this.rigNow.bands
      .map(() => `<path class="lb lb-l" d=""/><path class="lb lb-r" d=""/>`)
      .join('');
    const handArt = this.rigNow.pose === 'grip' ? gripHand() : pointHand();
    this.svg.innerHTML = `<g id="launch-body">${this.rigNow.behind}${handArt}${this.rigNow.front}<g class="launch-bands">${bands}</g></g>`;
    this.body = this.svg.querySelector('#launch-body')!;
    this.bandEls = Array.from(this.svg.querySelectorAll<SVGPathElement>('.lb'));
  }

  update(w: WeaponId, reduced: boolean) {
    if (w !== this.weaponId) this.build(w);
    const now = performance.now();
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

    // Body pulls back as you stretch; it shakes once you're past full stretch.
    const shake = state === 'over' && !reduced ? (Math.random() - 0.5) * 4 : state === 'perfect' && !reduced ? (Math.random() - 0.5) * 1.2 : 0;
    const tilt = -5 * charge;
    const dy = 10 * charge;
    this.body.setAttribute('transform', `translate(${shake.toFixed(2)} ${(dy + shake).toFixed(2)}) rotate(${tilt.toFixed(2)} 130 200)`);

    // The band: thinner and lighter the more it's stretched. Gone for a moment after firing or snapping.
    const sinceFire = now - this.firedAt;
    const sinceSnap = now - this.snappedAt;
    const hidden = sinceFire < 140 || sinceSnap < 450;
    const width = 5.5 - 2.8 * charge;
    const color = state === 'over' ? '#d0584a' : mixHex('#b67b42', '#e2bd8a', charge);
    const [px, py] = this.rigNow.pull;
    this.rigNow.bands.forEach((b, i) => {
      const ax = b.anchor[0] + px * charge;
      const ay = b.anchor[1] + py * charge;
      const sag = 6 * (1 - charge); // a relaxed band droops a little
      const l = this.bandEls[i * 2];
      const r = this.bandEls[i * 2 + 1];
      const d = (h: [number, number]) => `M${h[0]} ${h[1]} Q${(h[0] + ax) / 2 + sag} ${(h[1] + ay) / 2 + sag} ${ax} ${ay}`;
      l.setAttribute('d', d(b.hookL));
      r.setAttribute('d', d(b.hookR));
      for (const el of [l, r]) {
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', width.toFixed(2));
        el.style.opacity = hidden ? '0' : '1';
      }
    });

    // Tension meter under the hand
    this.fill.style.width = `${(charge * 100).toFixed(1)}%`;
    this.meter.dataset.state = state;
    const mult = state === 'perfect' ? `Perfect! ×${CHARGE.perfectMult}` : state === 'over' ? 'Let go!' : charge > 0 ? `×${(1 + (CHARGE.maxMult - 1) * charge).toFixed(1)}` : sinceSnap < 900 ? 'Snap! Too long.' : 'Hold to stretch';
    if (this.label.textContent !== mult) this.label.textContent = mult;
  }
}

function mixHex(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
