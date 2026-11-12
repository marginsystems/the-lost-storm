import type { Tally } from '../backend/journal-count-api.ts';

export interface CountState {
  readonly shown: boolean;
  readonly asked: boolean;
  readonly tally: Tally | null;
}

export function shouldAsk(state: CountState, journalTaken: boolean, signedIn: boolean): boolean {
  return !state.shown && !state.asked && journalTaken && signedIn;
}

export function shouldShow(state: CountState, hidden: boolean): boolean {
  return !state.shown && state.tally !== null && !hidden;
}
