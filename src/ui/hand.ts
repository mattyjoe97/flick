// Your hand, drawn in "aim space": the wrist is at (0, 0), the index finger
// points along +x and the thumb points up (-y). The launcher rotates this to
// aim at the target. Soft outlines and shading keep it a little more
// lifelike than the cartoon coworkers.

import type { WeaponId } from '../sim/content';

const LINE = '#8b5a3c';
const CREASE = '#b77c5a';
const sk = `fill="url(#skin-g)" stroke="${LINE}" stroke-width="2.4" stroke-linejoin="round"`;

export const HAND_DEFS = `
  <linearGradient id="skin-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f7d5b9"/>
    <stop offset="0.55" stop-color="#efc29f"/>
    <stop offset="1" stop-color="#d89f7a"/>
  </linearGradient>
  <linearGradient id="skin-thumb" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#e2ab86"/>
    <stop offset="0.6" stop-color="#f3cdaf"/>
    <stop offset="1" stop-color="#eebf9c"/>
  </linearGradient>
  <linearGradient id="sleeve-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a6b94"/>
    <stop offset="1" stop-color="#2f4a6b"/>
  </linearGradient>
  <linearGradient id="wood-g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ecc47a"/>
    <stop offset="1" stop-color="#c99a4f"/>
  </linearGradient>`;

/** Everything except the thumb (which moves) and the bands (which stretch). */
export function handBody(): string {
  return `
    <path fill="url(#sleeve-g)" stroke="#22364f" stroke-width="2.4" d="M-160 -64 L6 -48 L10 70 L-160 92 Z"/>
    <path fill="none" stroke="#22364f" stroke-width="2" opacity="0.6" d="M-60 -50 C-50 -10 -54 30 -66 74 M-110 -56 C-98 -14 -102 34 -116 82"/>
    <path fill="#f4f6f8" stroke="#9aa5b1" stroke-width="2.4" d="M2 -48 L30 -48 C32 -10 33 30 32 68 L4 70 Z"/>
    <circle cx="18" cy="34" r="3.2" fill="#c3ccd5" stroke="#9aa5b1" stroke-width="1.2"/>

    <path ${sk} d="M116 40 C146 40 172 44 182 52 C190 60 186 72 172 74 C150 76 132 74 112 70 Z"/>
    <path ${sk} d="M122 14 C158 12 192 16 204 27 C212 37 208 50 194 52 C168 56 144 54 120 50 Z"/>
    <path ${sk} d="M126 -12 C164 -16 200 -14 214 -1 C224 9 222 24 208 28 C182 34 152 32 126 28 Z"/>

    <path ${sk} d="M10 -40 C40 -48 70 -52 98 -48 C122 -46 142 -48 158 -46 L160 -10 C152 22 140 52 118 66 C88 76 50 72 22 64 C10 60 6 42 6 10 C6 -14 6 -30 10 -40 Z"/>

    <path ${sk} d="M140 -48 C182 -52 242 -48 290 -44 C302 -43 308 -33 306 -25 C304 -16 296 -12 288 -13 C242 -14 192 -12 150 -8 C141 -20 138 -36 140 -48 Z"/>
    <path fill="#f9dccb" stroke="${LINE}" stroke-width="1.6" d="M272 -45 C285 -46 298 -43 302 -36 C297 -32 285 -32 274 -34 Z"/>

    <g fill="none" stroke="${CREASE}" stroke-width="2" stroke-linecap="round">
      <path d="M229 -46 C231 -41 231 -37 229 -34"/>
      <path d="M235 -46 C237 -42 237 -39 235 -36"/>
      <path d="M184 -49 C187 -44 187 -40 185 -36"/>
      <path d="M232 -14 C234 -18 237 -20 240 -18"/>
      <path d="M176 -12 C178 -2 179 8 176 18"/>
      <path d="M164 15 C166 24 166 32 163 40"/>
      <path d="M150 42 C152 50 152 56 150 62"/>
      <path d="M60 -20 C80 -24 100 -22 118 -16" opacity="0.55"/>
      <path d="M50 4 C76 0 104 4 124 12" opacity="0.4"/>
    </g>
    <ellipse cx="152" cy="-40" rx="11" ry="4.5" fill="#fde6d4" opacity="0.75"/>
    <ellipse cx="208" cy="4" rx="6" ry="4" fill="#fde6d4" opacity="0.6"/>
    <ellipse cx="198" cy="32" rx="5" ry="3.5" fill="#fde6d4" opacity="0.55"/>`;
}

/** The thumb, drawn around its base at (84, -44) so it can rotate back as you stretch. */
export function handThumb(): string {
  return `
    <path fill="url(#skin-thumb)" stroke="${LINE}" stroke-width="2.4" stroke-linejoin="round" d="M52 -40 C48 -72 56 -112 72 -138 C82 -152 104 -156 113 -141 C119 -128 117 -110 113 -96 C109 -76 113 -58 118 -46 Z"/>
    <path fill="#f9dccb" stroke="${LINE}" stroke-width="1.6" d="M75 -137 C80 -148 92 -153 99 -147 C93 -140 84 -136 75 -137 Z"/>
    <path fill="none" stroke="${CREASE}" stroke-width="2" stroke-linecap="round" d="M70 -94 C80 -98 92 -98 104 -94 M72 -88 C82 -91 92 -91 101 -88"/>`;
}

/** Points in aim space the launcher needs. */
export const THUMB_BASE: [number, number] = [84, -44];
export const THUMB_TIP_HOOK: [[number, number], [number, number]] = [
  [92, -152],
  [76, -138],
];

export interface HeldObject {
  /** Drawn behind the hand (wood, sticks). */
  behind: string;
  /** Drawn in front of the index finger (clips, clothespins). */
  front: string;
  /** Band front hooks [top, bottom] and the back anchor (null = the thumb tip). */
  bands: { front: [[number, number], [number, number]]; back: [number, number] | null }[];
}

export function heldObject(w: WeaponId): HeldObject {
  const stick = `<rect x="108" y="-68" width="276" height="18" rx="3" fill="url(#wood-g)" stroke="#7a5428" stroke-width="2.2"/><path d="M130 -60 H370" stroke="#b9873e" stroke-width="1.2" opacity="0.6"/>`;
  switch (w) {
    case 'ruler': {
      const ticks = Array.from({ length: 24 }, (_, i) => {
        const x = 132 + i * 10;
        return `<line x1="${x}" x2="${x}" y1="-64" y2="${i % 4 === 0 ? -54 : -58}" stroke="#5a3b18" stroke-width="1.3"/>`;
      }).join('');
      return {
        behind: `<rect x="112" y="-66" width="272" height="22" rx="2" fill="url(#wood-g)" stroke="#7a5428" stroke-width="2.2"/>${ticks}<path d="M380 -66 L374 -55 L380 -44" fill="#e2b06a" stroke="#7a5428" stroke-width="1.8"/>`,
        front: '',
        bands: [{ front: [[382, -64], [382, -46]], back: null }],
      };
    }
    case 'clothespin':
      return {
        behind: stick,
        front: `<g><path d="M138 -70 L214 -92 L218 -84 L144 -66 Z" fill="#ead2a3" stroke="#7a5428" stroke-width="2"/><path d="M138 -68 L214 -72 L214 -64 L140 -62 Z" fill="#e0c18c" stroke="#7a5428" stroke-width="2"/><circle cx="168" cy="-72" r="5" fill="#a9b2bb" stroke="#4f5860" stroke-width="1.6"/><path d="M160 -72 C164 -82 174 -82 176 -72" fill="none" stroke="#a9b2bb" stroke-width="3"/></g>`,
        bands: [{ front: [[382, -68], [382, -52]], back: [214, -80] }],
      };
    case 'repeater':
      return {
        behind: stick,
        front: [160, 206, 252]
          .map(
            (x) =>
              `<g><path d="M${x - 16} -66 L${x + 16} -66 L${x + 12} -90 L${x - 12} -90 Z" fill="#26292d" stroke="#0f1113" stroke-width="2"/><path d="M${x - 10} -90 C${x - 18} -104 ${x - 6} -112 ${x - 2} -100 M${x + 10} -90 C${x + 18} -104 ${x + 6} -112 ${x + 2} -100" fill="none" stroke="#c3ccd5" stroke-width="2.6"/></g>`,
          )
          .join(''),
        bands: [
          { front: [[382, -70], [382, -54]], back: [160, -86] },
          { front: [[380, -72], [380, -52]], back: [206, -86] },
          { front: [[378, -74], [378, -50]], back: [252, -86] },
        ],
      };
    default:
      return { behind: '', front: '', bands: [{ front: [[300, -44], [300, -14]], back: null }] };
  }
}
