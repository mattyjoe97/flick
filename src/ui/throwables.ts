// What the bosses throw at you, drawn in the game's style (dark-brown outline, flat fills).
import mug from '../assets/art/icon-mug.webp';
import type { Throwable } from '../sim/fightback';

const OL = 'stroke="#332A24" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"';
const svg = (body: string) => `<svg viewBox="0 0 120 120" aria-hidden="true">${body}</svg>`;

export const THROW_ART: Record<Throwable, string> = {
  ball: svg(`<circle cx="60" cy="60" r="40" fill="#e8553f" ${OL}/><path d="M34 46c14 8 38 8 52 0M30 70c18 10 42 10 60 0" fill="none" stroke="#b83a28" stroke-width="5"/><circle cx="46" cy="42" r="7" fill="#ffb3a6"/>`),
  mug: `<img src="${mug}" alt="" draggable="false">`,
  stapler: svg(`<path d="M14 82h92v14H14z" fill="#3b3f45" ${OL}/><path d="M18 80c4-22 20-34 46-34h30c8 0 12 6 12 14v20z" fill="#5b6168" ${OL}/><path d="M26 66h70" stroke="#8a929b" stroke-width="5"/>`),
  binder: svg(`<rect x="22" y="14" width="76" height="92" rx="6" fill="#3d6fb4" ${OL}/><rect x="22" y="14" width="18" height="92" fill="#2b528a" ${OL}/><rect x="52" y="40" width="34" height="22" rx="3" fill="#f3efe4" stroke="#332A24" stroke-width="5"/>`),
  package: svg(`<path d="M16 42l44-18 44 18v46l-44 18-44-18z" fill="#c9965c" ${OL}/><path d="M16 42l44 18 44-18M60 60v46" fill="none" ${OL}/><path d="M36 33l44 18v14" fill="none" stroke="#e8d3a6" stroke-width="8"/>`),
  keyboard: svg(`<rect x="8" y="38" width="104" height="46" rx="6" fill="#d9d4c7" ${OL}/>${[0, 1, 2].map((r) => Array.from({ length: 8 }, (_, c) => `<rect x="${16 + c * 11.5}" y="${45 + r * 11}" width="8" height="7" rx="1.5" fill="#f5f2ea" stroke="#8c8778" stroke-width="2"/>`).join('')).join('')}`),
  calculator: svg(`<rect x="28" y="12" width="64" height="96" rx="8" fill="#4b5058" ${OL}/><rect x="38" y="22" width="44" height="18" rx="2" fill="#b7d8b0" stroke="#332A24" stroke-width="4"/>${[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<rect x="${38 + c * 16}" y="${48 + r * 14}" width="12" height="10" rx="2" fill="${c === 2 && r === 3 ? '#f08a4b' : '#e6e2d8'}"/>`).join('')).join('')}`),
  gavel: svg(`<rect x="20" y="24" width="56" height="30" rx="8" fill="#7a4a2a" ${OL} transform="rotate(-30 48 39)"/><path d="M56 54l42 42" stroke="#332A24" stroke-width="16" stroke-linecap="round"/><path d="M56 54l42 42" stroke="#9a6438" stroke-width="8" stroke-linecap="round"/>`),
  toothbrush: svg(`<rect x="50" y="34" width="20" height="78" rx="9" fill="#f2f2f2" ${OL}/><rect x="54" y="8" width="12" height="30" rx="4" fill="#7ad3c4" ${OL}/><rect x="56" y="58" width="8" height="12" rx="3" fill="#5bc0eb"/>`),
  bottle: svg(`<path d="M50 10h20v18c10 6 16 14 16 26v52H34V54c0-12 6-20 16-26z" fill="#d48a2e" ${OL}/><rect x="48" y="6" width="24" height="10" rx="2" fill="#3b3f45" ${OL}/><rect x="40" y="60" width="40" height="26" fill="#f3e6c8" stroke="#332A24" stroke-width="4"/>`),
  plane: svg(`<path d="M8 62l104-40-36 76-18-24z" fill="#fbfaf5" ${OL}/><path d="M58 74l54-52M58 74l-4 26 14-14" fill="#e6e2d6" ${OL}/>`),
};
