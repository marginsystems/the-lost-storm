import { distance } from '../../sim/math.ts';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { KeyValueStore } from '../backend/backend.ts';

export const KEEP_PROMPT = {
  key: 'the-lost-storm.keep-prompt.v1',
  quietMs: 259_200_000,
  minLevel: 2,
  calmSeconds: 6,
  fightRadius: 16,
  showSeconds: 30,
  sheetLine: 'This character is kept only in this browser. Sign in and it is yours on any device.',
  cardTitle: 'Keep this character',
  cardLine: 'It lives only in this browser. Sign in and it is yours on any device.',
  signIn: 'Sign in',
  later: 'Not now',
  titleNote: 'Sign in to keep this character.',
} as const;

export interface KeepFacts {
  readonly offered: boolean;
  readonly cloud: boolean;
  readonly online: boolean;
  readonly level: number;
  readonly dismissedAt: number | null;
  readonly now: number;
}

export interface Foe {
  readonly alive: boolean;
  readonly aggro: boolean;
  readonly pos: ReadonlyVec2;
}

export interface PlayPrompt {
  readonly armed: boolean;
  readonly spent: boolean;
  readonly shownFor: number;
  readonly visible: boolean;
}

export interface PlayMoment {
  readonly worth: boolean;
  readonly onScreen: boolean;
  readonly calm: boolean;
  readonly dt: number;
}

export const IDLE_PLAY: PlayPrompt = { armed: false, spent: false, shownFor: 0, visible: false };

export function readDismissed(store: KeyValueStore): number | null {
  const raw: string | null = store.read(KEEP_PROMPT.key);
  if (raw === null || !/^\d{1,15}$/.test(raw)) return null;
  return Number(raw);
}

export function keepDismissed(store: KeyValueStore, now: number): void {
  store.write(KEEP_PROMPT.key, String(Math.max(0, Math.floor(now))));
}

export function quiet(dismissedAt: number | null, now: number): boolean {
  return dismissedAt !== null && Math.abs(now - dismissedAt) < KEEP_PROMPT.quietMs;
}

export function worthAsking(facts: KeepFacts): boolean {
  if (!facts.offered || !facts.cloud || !facts.online) return false;
  if (facts.level < KEEP_PROMPT.minLevel) return false;
  return !quiet(facts.dismissedAt, facts.now);
}

export function calm(foes: readonly Foe[], hero: ReadonlyVec2, sinceFight: number): boolean {
  if (sinceFight < KEEP_PROMPT.calmSeconds) return false;
  return !foes.some((foe: Foe): boolean => foe.alive && foe.aggro && distance(foe.pos, hero) <= KEEP_PROMPT.fightRadius);
}

export function levelGained(before: number, level: number): boolean {
  return level > before;
}

export function armPlay(state: PlayPrompt): PlayPrompt {
  return state.armed || state.spent ? state : { ...state, armed: true };
}

export function closePlay(state: PlayPrompt): PlayPrompt {
  return { ...state, spent: true, visible: false };
}

function hidden(state: PlayPrompt): PlayPrompt {
  return state.visible ? { ...state, visible: false } : state;
}

export function stepPlay(state: PlayPrompt, moment: PlayMoment): PlayPrompt {
  if (!state.armed || state.spent) return hidden(state);
  if (!moment.worth || !moment.onScreen || !moment.calm) return hidden(state);
  const shownFor: number = state.shownFor + Math.max(0, moment.dt);
  if (shownFor >= KEEP_PROMPT.showSeconds) return { ...state, spent: true, visible: false, shownFor };
  return { ...state, visible: true, shownFor };
}
