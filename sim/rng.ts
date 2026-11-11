export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  state(): number;
}

const UINT32: number = 4294967296;

export function createRng(seed: number): Rng {
  let state: number = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed: number = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32;
  };
  return {
    next,
    range: (min: number, max: number): number => min + (max - min) * next(),
    int: (min: number, max: number): number => Math.floor(min + (max - min + 1) * next()),
    chance: (probability: number): boolean => next() < probability,
    state: (): number => state,
  };
}

export interface Weighted {
  readonly weight: number;
}

export function pickWeighted<T extends Weighted>(rng: Rng, options: readonly T[]): T | null {
  const total: number = options.reduce((sum: number, option: T): number => sum + option.weight, 0);
  if (total <= 0) return null;
  let roll: number = rng.next() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option;
  }
  return options.at(-1) ?? null;
}
