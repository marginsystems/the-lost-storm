export interface FlashState {
  waited: number;
  elapsed: number;
  seamLeft: number | null;
}

export function calmFlash(): FlashState {
  return { waited: 0, elapsed: 0, seamLeft: null };
}
