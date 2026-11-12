import type { Fields } from '../../sim/content/read.ts';

export const LEGACY_EPOCH: number = 1;
export const SAVE_EPOCH: number = 2;

export interface Epochs {
  current(): number;
  raise(epoch: number): boolean;
}

export function isEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= LEGACY_EPOCH;
}

export function epochOf(source: Fields, key: string): number | null {
  const value: unknown = source[key] ?? LEGACY_EPOCH;
  return isEpoch(value) ? value : null;
}

export function createEpochs(minimum: number): Epochs {
  let current: number = minimum;
  return {
    current: (): number => current,
    raise(epoch: number): boolean {
      if (epoch <= current) return false;
      current = epoch;
      return true;
    },
  };
}
