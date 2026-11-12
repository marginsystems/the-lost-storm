import type { Leaderboard } from '../backend/api.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import { asksForName, nameProblem, tidyName } from './lobby-model.ts';

export const HERO_NAME_KEY: string = 'lost-storm.hero-name';

export function readHeroName(store: KeyValueStore): string | null {
  const raw: string | null = store.read(HERO_NAME_KEY);
  if (raw === null) return null;
  const name: string = tidyName(raw);
  return nameProblem(name) === null ? name : null;
}

export function keepHeroName(store: KeyValueStore, name: string): void {
  store.write(HERO_NAME_KEY, tidyName(name));
}

export function stepWanted(fresh: boolean, board: Leaderboard | null, hasAccount: boolean): boolean {
  return fresh || (board !== null && hasAccount && asksForName(board));
}

export function pendingRename(kept: string | null, board: Leaderboard | null, hasAccount: boolean): string | null {
  if (kept === null || !hasAccount || board === null || board.you === null || board.you.chosen) return null;
  return kept;
}
