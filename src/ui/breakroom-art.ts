// Where things are in the break room picture, as fractions of it ([left, top, right, bottom]).
// `room` is the painted room once it arrives (null: the drawn stand-in).
export const BREAK_ART = {
  w: 2048,
  h: 1152,
  room: null as string | null,
  /** Gail: [left, height] (she stands on the bottom edge). */
  gail: [0.03, 0.66] as [number, number],
  coffee: [0.32, 0.27, 0.43, 0.535] as [number, number, number, number],
  board: [0.47, 0.1, 0.68, 0.43] as [number, number, number, number],
  vending: [0.74, 0.1, 0.93, 0.93] as [number, number, number, number],
};
