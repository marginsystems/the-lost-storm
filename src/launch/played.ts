export const PLAYED_KEY: string = 'the-lost-storm.played.v1';

const MAX_SECONDS: number = 60_000_000;
const MAX_STEP_SECONDS: number = 1;

export function readPlayed(text: string | null): number {
  if (text === null || !/^\d{1,9}$/.test(text)) return 0;
  return Math.min(MAX_SECONDS, Number(text));
}

export function addPlayed(seconds: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return seconds;
  return Math.min(MAX_SECONDS, seconds + Math.min(dt, MAX_STEP_SECONDS));
}
