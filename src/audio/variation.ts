export const VARIATION = {
  pitchCents: 70,
  volumeSpread: 0.12,
  centsPerOctave: 1200,
} as const;

export function pickVariant(count: number, previous: number, random: () => number): number {
  if (count <= 1) return 0;
  if (previous < 0 || previous >= count) return Math.min(count - 1, Math.floor(random() * count));
  const next: number = Math.floor(random() * (count - 1));
  return next >= previous ? next + 1 : next;
}

export function pitchRate(random: () => number): number {
  const cents: number = (random() * 2 - 1) * VARIATION.pitchCents;
  return 2 ** (cents / VARIATION.centsPerOctave);
}

export function volumeScale(random: () => number): number {
  return 1 + (random() * 2 - 1) * VARIATION.volumeSpread;
}

export function delayBetween(minimum: number, maximum: number, random: () => number): number {
  return minimum + random() * (maximum - minimum);
}
