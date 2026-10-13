// What you shoot with, drawn in "aim space": the back of the launcher is at
// (0, 0) and it points along +x, with "up" being -y. The launcher rotates
// this to aim at the target.
//
// The hand is ONE continuous outline (so the fingers are always attached),
// with creases, nails and shading drawn on top. Later weapons are the actual
// DIY items, drawn big, first-person style.

import type { WeaponId } from '../sim/content';

const LINE = '#7d4f33';
const CREASE = '#b0724f';

export const HAND_DEFS = `
  <linearGradient id="skin-g" gradientUnits="userSpaceOnUse" x1="0" y1="-150" x2="0" y2="95">
    <stop offset="0" stop-color="#f8d9be"/>
    <stop offset="0.45" stop-color="#f0c3a0"/>
    <stop offset="1" stop-color="#d4996f"/>
  </linearGradient>
  <radialGradient id="skin-hi" cx="0.42" cy="0.32" r="0.55">
    <stop offset="0" stop-color="#fff1e4" stop-opacity="0.75"/>
    <stop offset="1" stop-color="#fff1e4" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sleeve-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4f73a0"/>
    <stop offset="1" stop-color="#2c4566"/>
  </linearGradient>
  <linearGradient id="wood-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f1cf8c"/>
    <stop offset="0.5" stop-color="#e2b46a"/>
    <stop offset="1" stop-color="#b98a45"/>
  </linearGradient>
  <linearGradient id="pin-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f3e2bd"/>
    <stop offset="1" stop-color="#cfae74"/>
  </linearGradient>
  <linearGradient id="steel-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e9edf1"/>
    <stop offset="1" stop-color="#9aa5b0"/>
  </linearGradient>
  <linearGradient id="tape-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#d7dbe0"/>
    <stop offset="1" stop-color="#9aa1a9"/>
  </linearGradient>
  <linearGradient id="stain-g" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#a8703a"/>
    <stop offset="0.5" stop-color="#c48a4c"/>
    <stop offset="1" stop-color="#94602f"/>
  </linearGradient>
  <linearGradient id="clip-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3a3f45"/>
    <stop offset="1" stop-color="#141618"/>
  </linearGradient>`;

/** The whole hand silhouette as one closed path: wrist, thumb, index finger, then three curled fingers and the heel. */
const HAND_OUTLINE = `
  M 0 -34
  C 18 -40 34 -44 44 -50
  C 64 -54 90 -56 110 -56
  C 140 -58 200 -57 262 -52
  C 278 -51 292 -48 298 -39
  C 303 -31 300 -22 290 -20
  C 250 -19 196 -20 158 -18
  C 176 -18 196 -14 206 -4
  C 214 6 210 18 196 22
  C 186 25 174 25 166 24
  C 180 28 192 34 194 44
  C 196 54 188 60 176 61
  C 170 62 164 62 160 61
  C 170 66 176 72 174 80
  C 171 88 162 92 150 92
  C 120 92 86 88 60 80
  C 36 74 16 68 0 64
  Z`;

/** Finger-gun hand: index finger out, thumb cocked up, the band hooked over the fingertip. */
export function handBody(): string {
  return `
    <path fill="url(#sleeve-g)" stroke="#1f3350" stroke-width="2.5" d="M-190 -70 L8 -46 L8 76 L-190 104 Z"/>
    <path fill="none" stroke="#1f3350" stroke-width="2" opacity="0.55" d="M-70 -56 C-60 -10 -62 36 -76 84 M-130 -62 C-118 -12 -122 40 -138 92"/>
    <path fill="#f6f8fa" stroke="#9aa5b1" stroke-width="2.5" d="M-2 -44 L26 -44 C30 -8 30 34 26 72 L-2 76 Z"/>
    <circle cx="12" cy="40" r="3.4" fill="#c9d1d9" stroke="#8f9aa6" stroke-width="1.2"/>

    <path d="${HAND_OUTLINE}" fill="url(#skin-g)" stroke="${LINE}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="${HAND_OUTLINE}" fill="url(#skin-hi)"/>

    <g fill="none" stroke="${CREASE}" stroke-linecap="round">
      <path stroke-width="2.2" d="M158 -18 C150 -22 132 -24 112 -26"/>
      <path stroke-width="2" d="M166 24 C152 22 138 24 124 30"/>
      <path stroke-width="2" d="M160 61 C148 58 134 60 122 64"/>
      <path stroke-width="1.8" d="M206 -4 C200 2 196 10 190 14" opacity="0.7"/>
      <path stroke-width="1.8" d="M192 40 C186 44 182 48 176 50" opacity="0.7"/>
      <path stroke-width="1.6" d="M226 -52 C228 -46 228 -42 226 -38 M232 -52 C234 -47 234 -43 232 -39"/>
      <path stroke-width="1.6" d="M180 -55 C182 -50 182 -46 180 -42"/>
      <path stroke-width="1.6" d="M236 -20 C238 -24 241 -25 244 -23"/>
      <path stroke-width="2" d="M48 -48 C62 -38 80 -36 100 -44" opacity="0.6"/>
      <path stroke-width="1.6" d="M40 10 C70 4 100 6 130 14" opacity="0.35"/>
    </g>

    <path fill="#fbe2d2" stroke="${LINE}" stroke-width="1.6" d="M268 -51 C281 -51 293 -48 297 -40 C291 -36 279 -36 270 -38 C268 -42 267 -47 268 -51 Z"/>
    <path fill="none" stroke="#fff6ef" stroke-width="1.6" stroke-linecap="round" d="M273 -47 C280 -47 287 -46 291 -43"/>
    <ellipse cx="154" cy="-46" rx="12" ry="4.5" fill="#fff0e4" opacity="0.7"/>
    <ellipse cx="200" cy="2" rx="6" ry="5" fill="#fff0e4" opacity="0.55"/>
    <ellipse cx="186" cy="40" rx="5" ry="4.5" fill="#fff0e4" opacity="0.5"/>`;
}

/** Points the launcher needs, in aim space. */
export const THUMB_BASE: [number, number] = [76, -52];
export const THUMB_TIP_HOOK: [[number, number], [number, number]] = [
  [92, -146],
  [72, -132],
];

export interface Launcher {
  /** Drawn first. */
  back: string;
  /** The part that moves when you stretch (thumb, trigger clip); drawn around `pivot`. */
  moving: string;
  /** Drawn on top of the moving part. */
  front: string;
  pivot: [number, number];
  /** How far the moving part rotates back at full stretch. */
  cockDeg: number;
  /** Band front hooks [top, bottom] and back anchors [top, bottom] (back anchors move with the moving part when `movesWith` is set). */
  bands: { front: [[number, number], [number, number]]; back: [[number, number], [number, number]]; movesWith: boolean }[];
  scale: number;
}

const ink = 'stroke="#3d2a17" stroke-width="2.4" stroke-linejoin="round"';

/** The thumb, drawn over the hand outline so it can rotate back as you stretch. */
function thumbOverlay(): string {
  // Fill with no stroke along the base (it blends into the hand), then outline only the outer edges.
  // The fill stays inside the hand outline even when the thumb is cocked back, so no unoutlined edge shows.
  return `<path fill="#f3caa9" d="M40 -40 C46 -62 52 -98 68 -130 C76 -147 93 -152 102 -140 C110 -128 109 -104 107 -86 C106 -74 106 -64 110 -55 C96 -44 62 -38 40 -40 Z"/>
    <path fill="none" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M44 -50 C50 -80 58 -112 70 -134 C76 -146 92 -150 100 -140 C108 -128 108 -104 106 -86 C105 -72 105 -62 111 -54"/>
    <path fill="none" stroke="${CREASE}" stroke-width="1.8" stroke-linecap="round" opacity="0.8" d="M60 -48 C74 -50 92 -52 106 -56"/>
    <path fill="#fbe2d2" stroke="${LINE}" stroke-width="1.6" d="M76 -137 C82 -146 94 -148 99 -141 C96 -134 86 -131 76 -137 Z"/>
    <path fill="none" stroke="${CREASE}" stroke-width="1.8" stroke-linecap="round" d="M64 -100 C74 -103 86 -103 98 -99 M66 -94 C76 -96 86 -96 96 -93"/>`;
}

type P = [number, number];
const f1 = (n: number) => n.toFixed(1);
const skin = `fill="url(#skin-g)" stroke="${LINE}" stroke-width="2.4" stroke-linejoin="round"`;

/** Shirt sleeve and cuff, starting at a wrist line (a = one side, b = the other) and running off along `dir`. */
function sleeve(a: P, b: P, dir: P): string {
  const at = (p: P, k: number): P => [p[0] + dir[0] * k, p[1] + dir[1] * k];
  const pts = (q: P[]) => q.map((p) => `${f1(p[0])} ${f1(p[1])}`).join(' L');
  const n: P = [b[0] - a[0], b[1] - a[1]];
  const along = (k: number, t: number): P => at([a[0] + n[0] * t, a[1] + n[1] * t], k);
  const e1 = at([a[0] - n[0] * 0.15, a[1] - n[1] * 0.15], 340);
  const e2 = at([b[0] + n[0] * 0.15, b[1] + n[1] * 0.15], 340);
  return `<path fill="url(#sleeve-g)" stroke="#1f3350" stroke-width="2.5" stroke-linejoin="round" d="M${pts([at(a, 14), at(b, 14), e2, e1])} Z"/>
    <path fill="none" stroke="#1f3350" stroke-width="2" opacity="0.45" d="M${pts([along(70, 0.28), along(170, 0.22)])} M${pts([along(100, 0.74), along(230, 0.82)])}"/>
    <path fill="#f6f8fa" stroke="#9aa5b1" stroke-width="2.5" stroke-linejoin="round" d="M${pts([at(a, -3), at(b, -3), at(b, 17), at(a, 17)])} Z"/>
    <circle cx="${f1(along(7, 0.7)[0])}" cy="${f1(along(7, 0.7)[1])}" r="3" fill="#c9d1d9" stroke="#8f9aa6" stroke-width="1.2"/>`;
}

/**
 * One finger seen wrapped around something: a capsule from `tip` to `knuckle`,
 * with a nail at the tip end and two knuckle creases.
 */
function finger(tip: P, knuckle: P, w: number, nail = true): string {
  const dx = knuckle[0] - tip[0];
  const dy = knuckle[1] - tip[1];
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const r = w / 2;
  const body = `M${r} ${-r} L${f1(len - r)} ${-r} A${r} ${r} 0 0 1 ${f1(len - r)} ${r} L${r} ${r} A${r} ${r} 0 0 1 ${r} ${-r} Z`;
  const c = len * 0.55;
  return `<g transform="translate(${f1(tip[0])} ${f1(tip[1])}) rotate(${f1(ang)})">
      <path d="${body}" ${skin}/>
      <path fill="none" stroke="${CREASE}" stroke-width="1.6" stroke-linecap="round" d="M${f1(c)} ${f1(-r + 4)} C${f1(c + 3)} -2 ${f1(c + 3)} 2 ${f1(c)} ${f1(r - 4)} M${f1(c + 5)} ${f1(-r + 5)} C${f1(c + 7)} -1 ${f1(c + 7)} 1 ${f1(c + 5)} ${f1(r - 5)}"/>
      ${nail ? `<path fill="#fbe2d2" stroke="${LINE}" stroke-width="1.3" d="M3 ${f1(-r * 0.6)} C10 ${f1(-r * 0.68)} 14 ${f1(-r * 0.42)} 14 0 C14 ${f1(r * 0.42)} 10 ${f1(r * 0.68)} 3 ${f1(r * 0.6)} Z"/>` : ''}
      <ellipse cx="${f1(len - r - 1)}" cy="${f1(-r * 0.4)}" rx="5" ry="2.6" fill="#fff0e4" opacity="0.6"/>
    </g>`;
}

interface Grip {
  /** Sleeve, drawn before the weapon. */
  under: string;
  /** Palm and fingers, drawn over the handle. */
  over: string;
  /** The thumb, drawn over everything. */
  thumb: string;
}

const ARM: P = [-0.77, 0.64];
const ARM_N: P = [0.64, 0.77];

/**
 * A right hand on a pistol grip. The grip's top-back corner is at (0, 0), its
 * front edge runs from (46, 0) to (31, 104), its back edge from (0, 0) to (-19, 104).
 * Three fingers wrap the grip, the index finger reaches forward onto the trigger
 * at x = 78, and the thumb lies along the side of the barrel.
 */
function pistolHand(): Grip {
  const back = (y: number) => -0.19 * y;
  const front = (y: number) => 46 - 0.15 * y;
  const wc: P = [-22, 116];
  const a: P = [wc[0] - ARM_N[0] * 30, wc[1] - ARM_N[1] * 30];
  const b: P = [wc[0] + ARM_N[0] * 30, wc[1] + ARM_N[1] * 30];
  const rows = [
    { y: 34, w: 25 },
    { y: 58, w: 24 },
    { y: 81, w: 21 },
  ];
  const fingers = rows
    .slice()
    .reverse()
    .map((r) => finger([back(r.y) + 2, r.y + 3], [front(r.y) + 8, r.y - 2], r.w))
    .join('');
  // Palm: the heel wraps the back of the grip; the top edge tucks under the barrel.
  const palm = `M-8 -4 C-26 -2 -34 22 -36 46 C-38 70 ${f1(a[0])} ${f1(a[1] - 18)} ${f1(a[0] + 1)} ${f1(a[1] + 1)}
    L${f1(b[0] - 1)} ${f1(b[1] - 1)} C${f1(b[0] + 6)} ${f1(b[1] - 14)} 4 104 14 96 L56 18 C52 8 46 2 38 0 Z`;
  // Index finger: forward along the underside of the barrel, then curled down onto the trigger.
  const index = `M30 2 C44 0 60 1 74 4 C84 6 88 14 86 22 C84 30 76 32 72 26 C70 22 70 18 66 18 C54 20 42 22 30 22 Z`;
  const thumb = `<path ${skin} d="M-30 22 C-30 4 -18 -10 4 -13 C20 -15 40 -15 52 -14 C64 -13 66 1 54 3 C38 5 18 5 6 12 C-4 18 -14 26 -24 32 Z"/>
    <path fill="#fbe2d2" stroke="${LINE}" stroke-width="1.3" d="M46 -14 C54 -15 61 -12 62 -7 C57 -4 50 -5 46 -7 Z"/>
    <path fill="none" stroke="${CREASE}" stroke-width="1.6" stroke-linecap="round" d="M24 -13 C21 -8 21 -2 24 4"/>
    <ellipse cx="0" cy="-4" rx="12" ry="4" fill="#fff0e4" opacity="0.55"/>`;
  return {
    under: sleeve(a, b, ARM),
    over: `<path d="${palm}" ${skin}/>${fingers}
      <path d="${index}" ${skin}/>
      <path fill="none" stroke="${CREASE}" stroke-width="1.6" stroke-linecap="round" d="M56 3 C59 8 59 14 56 19 M70 6 C66 10 66 15 68 19"/>
      <path fill="#fbe2d2" stroke="${LINE}" stroke-width="1.2" d="M76 26 C80 30 85 28 86 22 C83 20 79 21 76 26 Z"/>`,
    thumb,
  };
}

/** The trigger and a bent-paperclip trigger guard, for a barrel whose underside is at y = 0. Draw `back` before the hand and `guard` after. */
function trigger(): { back: string; guard: string } {
  return {
    back: `<path fill="url(#stain-g)" ${ink} d="M72 0 L84 0 C85 12 88 24 96 32 C88 36 80 32 77 24 C74 16 72 8 72 0 Z"/>`,
    guard: `<path fill="none" stroke="#7d8790" stroke-width="5" stroke-linecap="round" d="M50 0 C50 30 60 44 84 44 C104 44 112 30 114 0"/>
      <path fill="none" stroke="#e7ebef" stroke-width="2" stroke-linecap="round" d="M52 4 C53 30 62 41 84 41 C102 41 109 30 111 4"/>`,
  };
}

/** A pistol grip: a block of stained wood with grain and a strip of masking tape. */
function pistolGrip(): string {
  return `<path fill="url(#stain-g)" ${ink} d="M-4 -2 L50 -2 L32 100 Q30 110 20 110 L-12 110 Q-21 110 -20 100 Z"/>
    <path fill="none" stroke="#6e4a22" stroke-width="1.4" opacity="0.6" d="M12 8 L0 96 M30 8 L18 98"/>`;
}

/** A small black binder clip, jaws at (x, y) facing forward, wire handles folded back. */
function binderClip(x: number, y: number, size = 1): string {
  const s = size;
  return `<g transform="translate(${x} ${y}) scale(${s})">
      <path fill="url(#clip-g)" ${ink} d="M-34 0 L0 0 L-4 -22 L-30 -22 Z"/>
      <path fill="none" stroke="#5a6068" stroke-width="1.2" d="M-30 -18 L-4 -18"/>
      <path fill="none" stroke="url(#steel-g)" stroke-width="3.6" stroke-linecap="round" d="M-26 -22 C-34 -34 -50 -36 -60 -30 M-8 -22 C-16 -38 -40 -42 -58 -36"/>
    </g>`;
}

/** A wooden clothespin lying along the barrel top (y = 0), jaws at the front (x = jx), lever at the back. Returns the fixed bottom prong and the moving top prong. */
function clothespin(jx: number): { bottom: string; top: string; pivot: P } {
  const bx = jx - 120;
  return {
    bottom: `<path fill="url(#pin-g)" ${ink} d="M${bx} 0 L${jx} 0 L${jx} -7 C${jx - 20} -9 ${jx - 40} -9 ${jx - 52} -10 L${bx + 10} -12 L${bx} -9 Z"/>
      <circle cx="${jx - 58}" cy="-12" r="7" fill="url(#steel-g)" stroke="#4f5860" stroke-width="2"/>
      <path fill="none" stroke="#4f5860" stroke-width="1.5" d="M${jx - 63} -12 L${jx - 53} -12 M${jx - 62} -9 L${jx - 54} -15"/>`,
    top: `<path fill="url(#pin-g)" ${ink} d="M${bx - 4} -26 L${bx + 8} -20 C${jx - 70} -16 ${jx - 40} -14 ${jx} -9 L${jx} -16 C${jx - 30} -20 ${jx - 60} -24 ${bx + 12} -32 Z"/>
      <path fill="none" stroke="#b08a4f" stroke-width="1.2" d="M${bx + 14} -27 C${jx - 70} -22 ${jx - 40} -18 ${jx - 8} -14"/>`,
    pivot: [jx - 58, -12],
  };
}

/** Text that stays readable when the launcher is mirrored (the launcher counter-flips elements with class "ft"). */
function label(x: number, y: number, size: number, body: string, extra = ''): string {
  return `<text class="ft" data-cx="${x}" x="${x}" y="${y}" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-size="${size}" ${extra}>${body}</text>`;
}

export function launcherArt(w: WeaponId): Launcher {
  switch (w) {
    case 'ruler': {
      // A 12-inch ruler held like a handle. The band hooks in a notch at the far end
      // and is pinched at the back by a binder clip; squeezing the clip lets it go.
      const x0 = -60;
      const L = 360;
      const top = -22;
      const ticks = Array.from({ length: 49 }, (_, i) => {
        const x = 40 + i * 6.4;
        const h = i % 4 === 0 ? 10 : i % 2 === 0 ? 7 : 4;
        return `<line x1="${f1(x)}" x2="${f1(x)}" y1="${top + 3}" y2="${top + 3 + h}" stroke="#4a3216" stroke-width="1.2"/>`;
      }).join('');
      const nums = Array.from({ length: 12 }, (_, i) => label(40 + (i + 1) * 25.6, -4, 8, String(i + 1), 'font-weight="700" fill="#4a3216"')).join('');
      // Fist around the back end: fingers come up the near side, tips at the top edge.
      const cols = [
        { x: -50, w: 21, k: 0.86 },
        { x: -29, w: 23, k: 0.96 },
        { x: -6, w: 24, k: 1 },
        { x: 18, w: 23, k: 0.94 },
      ];
      const wc: P = [-74, 40];
      const a: P = [wc[0] - ARM_N[0] * 30, wc[1] - ARM_N[1] * 30];
      const b: P = [wc[0] + ARM_N[0] * 30, wc[1] + ARM_N[1] * 30];
      const fingers = cols.map((c) => finger([c.x + 4, top + 4 + (1 - c.k) * 24], [c.x - 4, 30], c.w)).join('');
      const palm = `M-56 ${top - 6} C-78 ${top - 2} -92 6 -92 24 C-92 34 ${f1(a[0])} ${f1(a[1] - 10)} ${f1(a[0] + 1)} ${f1(a[1] + 1)} L${f1(b[0] - 1)} ${f1(b[1] - 1)} C-30 60 10 52 30 36 L32 ${top} Z`;
      // The clip sits on a little eraser block so the band rides clear of the ruler.
      const clip = binderClip(80, top - 10, 1);
      return {
        back:
          sleeve(a, b, ARM) +
          `<path fill="url(#wood-g)" ${ink} d="M${x0} ${top} L${L - 12} ${top} L${L - 5} ${top + 9} L${L} ${top} L${L} 0 L${x0} 0 Z"/>
          <rect x="${x0}" y="${top - 2}" width="${L - 12 - x0}" height="4" fill="url(#steel-g)" stroke="#6b7680" stroke-width="1"/>
          ${ticks}${nums}
          <rect x="44" y="${top - 11}" width="40" height="12" rx="3" fill="#e98fa0" stroke="#3d2a17" stroke-width="2"/>
          <path d="M48 ${top - 7} H80" stroke="#f6c2cc" stroke-width="2" stroke-linecap="round"/>
          <path d="${palm}" ${skin}/>${fingers}`,
        moving: clip,
        front: `<path ${skin} d="M-64 ${top + 18} C-64 ${top + 2} -52 ${top - 12} -32 ${top - 18} C-18 ${top - 22} -6 ${top - 28} 4 ${top - 34} C14 ${top - 40} 24 ${top - 30} 16 ${top - 22} C6 ${top - 14} -8 ${top - 4} -24 ${top + 6} C-36 ${top + 12} -48 ${top + 22} -56 ${top + 30} Z"/>
          <path fill="#fbe2d2" stroke="${LINE}" stroke-width="1.3" d="M3 ${top - 34} C9 ${top - 39} 17 ${top - 38} 20 ${top - 32} C16 ${top - 29} 9 ${top - 30} 3 ${top - 34} Z"/>
          <path fill="none" stroke="${CREASE}" stroke-width="1.6" stroke-linecap="round" d="M-22 ${top - 14} C-24 ${top - 8} -23 ${top - 2} -20 ${top + 4}"/>`,
        pivot: [46, top - 10],
        cockDeg: -5,
        bands: [{ front: [[L - 6, top + 6], [L - 4, top + 9]], back: [[78, top - 13], [78, top - 10]], movesWith: true }],
        scale: 0.86,
      };
    }
    case 'clothespin': {
      // The classic: a paint-stirrer barrel, a grip, and a clothespin on top whose jaws
      // hold the band. A trigger under the barrel, and a paperclip guard.
      const L = 300;
      const pin = clothespin(70);
      const hand = pistolHand();
      const trig = trigger();
      return {
        back:
          hand.under +
          pistolGrip() +
          trig.back +
          `<path fill="url(#wood-g)" ${ink} d="M-46 -24 L${L - 14} -24 L${L - 7} -14 L${L} -24 L${L} 0 L-46 0 Z"/>
          <path fill="none" stroke="#b98a45" stroke-width="1.3" opacity="0.8" d="M-36 -14 H${L - 24} M-20 -6 C60 -8 140 -4 ${L - 30} -7"/>
          ${label(170, -9, 7, 'STIR WELL', 'fill="#8a6234" font-weight="700" letter-spacing="1.5"')}
          <rect x="-30" y="-3" width="40" height="10" fill="url(#tape-g)" stroke="#8b929a" stroke-width="1.2" opacity="0.9"/>` +
          `<g transform="translate(0 -24)">${pin.bottom}</g>` +
          hand.over +
          trig.guard,
        moving: `<g transform="translate(0 -24)">${pin.top}</g>`,
        front: hand.thumb,
        pivot: [pin.pivot[0], pin.pivot[1] - 24],
        cockDeg: -7,
        bands: [{ front: [[L - 7, -18], [L - 6, -15]], back: [[69, -36], [69, -33]], movesWith: true }],
        scale: 0.9,
      };
    }
    case 'repeater': {
      // Two stirrers taped into one thick barrel, a grip and trigger, and three binder
      // clips stepped along the top, each holding its own band.
      const L = 360;
      const hand = pistolHand();
      const trig = trigger();
      // A stepped block on top: the rear clip sits highest, so the three bands fan out and never tangle.
      const clips = [
        { x: 130, y: -44, s: 0.9 },
        { x: 80, y: -56, s: 0.9 },
        { x: 30, y: -68, s: 0.9 },
      ];
      const steps = `<path fill="url(#stain-g)" ${ink} d="M-30 -34 L-30 -68 L30 -68 L30 -56 L80 -56 L80 -44 L134 -44 L134 -34 Z"/>
          <path fill="none" stroke="#6e4a22" stroke-width="1.3" opacity="0.6" d="M-24 -62 H24 M36 -50 H74 M86 -39 H128"/>`;
      const notches = [0, 1, 2].map((i) => L - 8 - i * 14);
      const barrelTop = `M-46 -34 ${notches
        .slice()
        .reverse()
        .map((nx) => `L${nx - 6} -34 L${nx} -26 L${nx + 6} -34`)
        .join(' ')} L${L} -34 L${L} 0 L-46 0 Z`;
      return {
        back:
          hand.under +
          pistolGrip() +
          trig.back +
          `<path fill="url(#wood-g)" ${ink} d="${barrelTop}"/>
          <path fill="none" stroke="#9c7238" stroke-width="1.8" d="M-44 -17 H${L - 2}"/>
          ${[150, 250, 320].map((x) => `<rect x="${x}" y="-38" width="24" height="42" rx="2" fill="url(#tape-g)" stroke="#6b7680" stroke-width="1.3"/><path d="M${x + 3} -34 L${x + 21} 0" stroke="#eef1f4" stroke-width="2" opacity="0.6"/>`).join('')}
          ${label(220, -21, 7, 'NAPKIN DESIGN v3', 'fill="#7a5528" font-weight="700" letter-spacing="1"')}
          ${steps}` +
          hand.over +
          trig.guard,
        moving: clips.map((c) => binderClip(c.x, c.y, c.s)).join(''),
        front: hand.thumb,
        pivot: [80, -56],
        cockDeg: 0,
        bands: clips.map((c, i) => ({
          front: [[notches[i], -28], [notches[i] + 1, -25]] as [P, P],
          back: [[c.x - 2, c.y - 2], [c.x - 2, c.y + 1]] as [P, P],
          movesWith: false,
        })),
        scale: 0.84,
      };
    }
    default:
      return {
        back: handBody(),
        moving: thumbOverlay(),
        front: '',
        pivot: THUMB_BASE,
        cockDeg: -15,
        bands: [{ front: [[300, -48], [300, -22]], back: THUMB_TIP_HOOK, movesWith: true }],
        scale: 0.95,
      };
  }
}
