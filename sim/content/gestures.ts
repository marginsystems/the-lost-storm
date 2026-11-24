import raw from '../../data/gestures.json' with { type: 'json' };
import type { Fields } from './read.ts';
import { byId, choice, ContentError, each, fields, text } from './read.ts';

export const GESTURE_PLAYS = ['once', 'hold', 'posture'] as const;
export type GesturePlays = (typeof GESTURE_PLAYS)[number];

export const GESTURE_LIMITS = { idChars: 32 } as const;

const GESTURE_ID: RegExp = /^[a-z][a-z_]*$/;

export interface PostureDef {
  readonly id: string;
  readonly enter: string;
  readonly exit: string;
}

export type GestureDef =
  | { readonly id: string; readonly plays: 'once'; readonly clip: string }
  | { readonly id: string; readonly plays: 'hold'; readonly clip: string }
  | { readonly id: string; readonly plays: 'posture'; readonly clip: string; readonly posture: PostureDef };

export interface Gestures {
  readonly gestures: ReadonlyMap<string, GestureDef>;
  readonly postures: ReadonlyMap<string, PostureDef>;
}

function gestureId(source: Fields, where: string): string {
  const id: string = text(source, 'id', where);
  if (id.length > GESTURE_LIMITS.idChars || !GESTURE_ID.test(id)) throw new ContentError(`${where}.id`, `expected lowercase letters and underscores, at most ${GESTURE_LIMITS.idChars}`);
  return id;
}

function readPosture(value: unknown, where: string): PostureDef {
  const source: Fields = fields(value, where);
  return { id: gestureId(source, where), enter: text(source, 'enter', where), exit: text(source, 'exit', where) };
}

function readGesture(value: unknown, where: string, postures: ReadonlyMap<string, PostureDef>): GestureDef {
  const source: Fields = fields(value, where);
  const id: string = gestureId(source, where);
  const clip: string = text(source, 'clip', where);
  const plays: GesturePlays = choice(source, 'plays', GESTURE_PLAYS, where);
  if (plays !== 'posture') return { id, plays, clip };
  const named: string = text(source, 'posture', where);
  const posture: PostureDef | undefined = postures.get(named);
  if (posture === undefined) throw new ContentError(`${where}.posture`, `unknown posture ${named}`);
  return { id, plays, clip, posture };
}

export function readGestures(value: unknown, where: string): Gestures {
  const source: Fields = fields(value, where);
  const postures: ReadonlyMap<string, PostureDef> = byId(each(source['postures'], `${where}.postures`, readPosture), `${where}.postures`);
  const gestures: ReadonlyMap<string, GestureDef> = byId(
    each(source['gestures'], `${where}.gestures`, (entry: unknown, entryWhere: string): GestureDef => readGesture(entry, entryWhere, postures)),
    `${where}.gestures`,
  );
  return { gestures, postures };
}

export const GESTURES: Gestures = readGestures(raw, 'gestures');

export function gestureOf(id: unknown, gestures: Gestures = GESTURES): GestureDef | null {
  return typeof id === 'string' ? (gestures.gestures.get(id) ?? null) : null;
}

export function gestureClips(gestures: Gestures = GESTURES): string[] {
  const named: string[] = [...gestures.gestures.values()].map((gesture: GestureDef): string => gesture.clip);
  for (const posture of gestures.postures.values()) named.push(posture.enter, posture.exit);
  return [...new Set<string>(named)];
}
