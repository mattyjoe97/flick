// Painted coworker portraits, placed where the old code-drawn busts went.
//
// Every portrait shares one registration (face centre, eye line, head size), so one
// transform puts any of them in the 120 x 150 bust box the scene uses, with the face
// centred at (60, 60). Someone without painted art falls back to the drawn bust.

import { drawPerson, PEOPLE, type Mood } from './characters';
import { PORTRAIT, PORTRAITS } from './portrait-art';

/** Bust-box units per source pixel: painted heads come out about as big as the drawn ones. */
export const PORTRAIT_UNIT = 0.19;
const U = PORTRAIT_UNIT;

const [X0, Y0, X1, Y1] = PORTRAIT.crop;
const BOX = {
  x: +(60 - (PORTRAIT.face[0] - X0) * U).toFixed(2),
  y: +(60 - (PORTRAIT.face[1] - Y0) * U).toFixed(2),
  w: +((X1 - X0) * U).toFixed(2),
  h: +((Y1 - Y0) * U).toFixed(2),
};

/** The closest expression someone has painted (Brad and Rick rest on smug, allies only have idle and happy). */
function pick(id: string, mood: Mood): string {
  const set = PORTRAITS[id];
  const rest = PEOPLE[id]?.rest;
  for (const m of [mood, rest, 'idle', 'smug']) if (m && set[m]) return m;
  return Object.keys(set)[0];
}

const image = (href: string) => `<image href="${href}" x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" preserveAspectRatio="none"/>`;

/** SVG markup for one person in the bust box. */
export function portrait(id: string, mood: Mood = PEOPLE[id]?.rest ?? 'idle'): string {
  const set = PORTRAITS[id];
  if (!set) return drawPerson(PEOPLE[id], mood);
  return image(set[pick(id, mood)]);
}

/** A viewBox that fits a painted portrait's shoulders (outside the scene: dialogs, the monitor reflection). */
export function portraitViewBox(id: string) {
  return PORTRAITS[id] ? `${BOX.x} 8 ${BOX.w} ${(BOX.w * 1.12).toFixed(1)}` : '0 0 120 150';
}

/** Just the face, for small avatars (the Org Chart). */
export function faceSvg(id: string, mood?: Mood): string {
  return `<svg viewBox="20 12 80 80" aria-hidden="true">${portrait(id, mood)}</svg>`;
}

/** A whole <svg> for one person. */
export function portraitSvg(id: string, mood?: Mood): string {
  return `<svg viewBox="${portraitViewBox(id)}" aria-hidden="true">${portrait(id, mood)}</svg>`;
}

/** Every expression stacked, one showing, so switching faces never waits on an image. */
export function portraitStack(id: string, mood: Mood): string {
  const set = PORTRAITS[id];
  if (!set) return `<g data-person="${id}">${drawPerson(PEOPLE[id], mood)}</g>`;
  const show = pick(id, mood);
  return `<g data-person="${id}">${Object.entries(set)
    .map(([m, href]) => `<g data-mood="${m}" visibility="${m === show ? 'visible' : 'hidden'}">${image(href)}</g>`)
    .join('')}</g>`;
}

export function setPortraitMood(g: Element, id: string, mood: Mood) {
  if (!PORTRAITS[id]) {
    g.innerHTML = drawPerson(PEOPLE[id], mood);
    return;
  }
  const show = pick(id, mood);
  g.querySelectorAll<SVGGElement>('[data-mood]').forEach((e) => e.setAttribute('visibility', e.dataset.mood === show ? 'visible' : 'hidden'));
}

/** Decode every portrait up front so the first hit or frown doesn't blink. */
export function warmPortraits() {
  for (const set of Object.values(PORTRAITS))
    for (const href of Object.values(set)) {
      const img = new Image();
      img.src = href;
      void img.decode?.().catch(() => undefined);
    }
}
