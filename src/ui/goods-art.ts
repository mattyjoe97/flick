// Pictures of the things you can buy, shared by Dale's closet, the shopping list and the weapon rack.

import gunRuler from '../assets/art/gun-ruler.webp';
import gunClothespin from '../assets/art/gun-clothespin.webp';
import gunRepeater from '../assets/art/gun-repeater.webp';
import gunGatling from '../assets/art/gun-gatling.webp';
import fingerBand from '../assets/art/prop-band_a.webp';
import iconSilent from '../assets/art/icon-silent.webp';
import iconRummage from '../assets/art/icon-rummage.webp';
import iconTraining from '../assets/art/icon-training.webp';
import iconCalendar from '../assets/art/icon-calendar.webp';
import iconKey from '../assets/art/icon-closet.webp';
import iconThick from '../assets/art/icon-thick.webp';
import iconWaxed from '../assets/art/icon-waxed.webp';
import iconOrganizer from '../assets/art/icon-organizer.webp';
import iconAutoreply from '../assets/art/icon-autoreply.webp';
import iconChair from '../assets/art/icon-chair.webp';
import iconRiser from '../assets/art/icon-riser.webp';
import iconBulk from '../assets/art/icon-bulk.webp';
import iconCarpet from '../assets/art/icon-carpet.webp';
import iconMacros from '../assets/art/icon-macros.webp';
import iconWalls from '../assets/art/icon-walls.webp';
import type { RenovationId, UpgradeId, WeaponId } from '../sim/content';

/** Each weapon as it hangs on Dale's pegboard (the Finger Flick is just a rubber band). */
export const GUN_ART: Record<WeaponId, string> = { flick: fingerBand, ruler: gunRuler, clothespin: gunClothespin, repeater: gunRepeater, gatling: gunGatling };

export const ICON_ART: Record<UpgradeId, string> = {
  rummage: iconRummage,
  organizer: iconOrganizer,
  autoreply: iconAutoreply,
  chair: iconChair,
  waxed: iconWaxed,
  silent: iconSilent,
  riser: iconRiser,
  bulk: iconBulk,
  closet: iconKey,
  training: iconTraining,
  thick: iconThick,
  carpet: iconCarpet,
  macros: iconMacros,
  walls: iconWalls,
  calendar: iconCalendar,
};

// Renovations: simple drawn stand-ins (thick ink outlines, like the painted icons) until
// their painted art arrives.
const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#3b2f25" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`)}`;

export const RENO_ART: Record<RenovationId, string> = {
  window: svg('<rect x="10" y="8" width="44" height="40" rx="2" fill="#f3ead8"/><rect x="15" y="13" width="34" height="30" fill="#9fd0ef"/><path d="M32 13v30M15 28h34"/><path d="M19 22c3-3 7-3 9 0" stroke="#fff"/><rect x="6" y="48" width="52" height="7" rx="2" fill="#c89a62"/>'),
  espresso: svg('<rect x="14" y="8" width="34" height="14" rx="3" fill="#b8bec6"/><rect x="18" y="22" width="26" height="22" fill="#8e969f"/><path d="M27 22v7M35 22v7"/><path d="M22 41h18v6a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6z" fill="#fff"/><path d="M40 44h3a3 3 0 0 1 0 6h-3"/><path d="M28 34c0-3 3-3 3-6M34 34c0-3 3-3 3-6" stroke="#9a9a9a" stroke-width="2"/><rect x="10" y="53" width="42" height="4" rx="2" fill="#5b4a3a"/>'),
  desks: svg('<rect x="8" y="16" width="48" height="7" rx="2" fill="#c89a62"/><path d="M18 23v30M46 23v30M12 53h12M40 53h12"/><rect x="26" y="4" width="16" height="12" rx="1.5" fill="#f3ead8"/><rect x="29" y="7" width="10" height="6" fill="#9fd0ef"/><path d="M18 36h28" stroke-width="2.5"/>'),
  panels: svg('<rect x="8" y="10" width="48" height="44" rx="3" fill="#6f7f95"/><path d="M8 21h48M8 32h48M8 43h48" stroke="#4d5a6b"/><path d="M14 10l5 11 5-11 5 11 5-11 5 11 5-11 5 11" stroke="#8d9db2" stroke-width="2.5"/><path d="M14 32l5 11 5-11 5 11 5-11 5 11 5-11 5 11" stroke="#8d9db2" stroke-width="2.5"/>'),
};
