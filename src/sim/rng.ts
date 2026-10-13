// Small seeded random number generator (mulberry32). The state is a single
// number stored in the save, so a replayed action sequence gives the same game.

export function nextRandom(seed: number): [value: number, nextSeed: number] {
  let t = (seed + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

export interface HasRng {
  rng: number;
}

/** Returns a float in [0, 1) and advances the state's generator. */
export function rand(s: HasRng): number {
  const [v, next] = nextRandom(s.rng);
  s.rng = next;
  return v;
}

export function randRange(s: HasRng, min: number, max: number): number {
  return min + rand(s) * (max - min);
}
