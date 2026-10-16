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
import type { UpgradeId, WeaponId } from '../sim/content';

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
