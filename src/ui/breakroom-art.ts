// The break room's painted art, and where things go in the room picture, as fractions of it
// ([left, top, right, bottom]), from batch 15's registration numbers (2048 x 1152 room).
import room from '../assets/art/breakroom.webp';
import coffee from '../assets/art/break-coffee.webp';
import coffeeBrewing from '../assets/art/break-coffee-brewing.webp';
import vending from '../assets/art/break-vending.webp';
import board from '../assets/art/break-board.webp';
import pretzels from '../assets/art/snack-pretzels.webp';
import gummies from '../assets/art/snack-gummies.webp';
import energy from '../assets/art/snack-energy.webp';
import mints from '../assets/art/snack-mints.webp';
import mug from '../assets/art/icon-mug.webp';

const W = 2048;
const H = 1152;
const box = (x: number, y: number, w: number, h: number) => [x / W, y / H, (x + w) / W, (y + h) / H] as [number, number, number, number];

export const BREAK_ART = {
  w: W,
  h: H,
  room: room as string | null,
  /** Gail: [left, height] (she stands on the bottom edge, in front of the window). */
  gail: [0.03, 0.66] as [number, number],
  // The coffee maker stands on the countertop (its top edge at y=600).
  coffee: box(684, 312, 230, 288),
  board: box(940, 112, 470, 336),
  // The vending machine stands on the floor line (y=860).
  vending: box(1522, 60, 375, 800),
  img: { coffee, coffeeBrewing, vending, board },
  snacks: { pretzels, gummies, energy, mints } as Record<string, string>,
  mug,
};
