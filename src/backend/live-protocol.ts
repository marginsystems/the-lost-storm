import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';

export const LIVE_LIMITS: { readonly idChars: number; readonly nameChars: number; readonly baseChars: number; readonly wornSlots: number; readonly players: number; readonly frameChars: number; readonly centimetres: number } = {
  idChars: 64,
  nameChars: 32,
  baseChars: 64,
  wornSlots: 16,
  players: 400,
  frameChars: 262144,
  centimetres: 100,
};

export const LIVE_ZONE: string = 'hideout';

export type Worn = Readonly<Record<string, string>>;

export interface LivePlayer {
  readonly id: string;
  readonly name: string;
  readonly hero: string | null;
  readonly worn: Worn;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

export interface LiveMove {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

export type EnterRefusal = 'no_such_zone' | 'no_character' | 'off_floor';

const ENTER_REFUSALS: readonly EnterRefusal[] = ['no_such_zone', 'no_character', 'off_floor'];

export type ServerFrame =
  | { readonly type: 'welcome' }
  | { readonly type: 'present'; readonly zone: string; readonly you: string; readonly players: readonly LivePlayer[] }
  | { readonly type: 'joined'; readonly player: LivePlayer }
  | { readonly type: 'left'; readonly id: string }
  | { readonly type: 'look'; readonly id: string; readonly hero: string | null; readonly worn: Worn }
  | { readonly type: 'moves'; readonly moves: readonly LiveMove[] }
  | { readonly type: 'full' }
  | { readonly type: 'replaced' }
  | { readonly type: 'refused'; readonly reason: EnterRefusal };

export interface Place {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

function shortText(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value !== '' && value.length <= limit ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readHero(value: unknown): string | null | undefined {
  if (value === null) return null;
  return shortText(value, LIVE_LIMITS.baseChars) ?? undefined;
}

function readWorn(value: unknown): Worn | null {
  if (!isFields(value)) return null;
  const entries: [string, unknown][] = Object.entries(value);
  if (entries.length > LIVE_LIMITS.wornSlots) return null;
  const worn: Record<string, string> = {};
  for (const [slot, base] of entries) {
    const id: string | null = shortText(base, LIVE_LIMITS.baseChars);
    if (id === null || slot.length > LIVE_LIMITS.baseChars) return null;
    worn[slot] = id;
  }
  return worn;
}

export function readPlayer(value: unknown): LivePlayer | null {
  if (!isFields(value)) return null;
  const id: string | null = shortText(value['id'], LIVE_LIMITS.idChars);
  const name: string | null = shortText(value['name'], LIVE_LIMITS.nameChars);
  const hero: string | null | undefined = readHero(value['hero']);
  const worn: Worn | null = readWorn(value['worn']);
  const x: number | null = finite(value['x']);
  const z: number | null = finite(value['z']);
  const facing: number | null = finite(value['facing']);
  if (id === null || name === null || hero === undefined || worn === null || x === null || z === null || facing === null) return null;
  return { id, name, hero, worn, x, z, facing };
}

function readMove(value: unknown): LiveMove | null {
  if (!Array.isArray(value)) return null;
  const entry: readonly unknown[] = value;
  const id: string | null = shortText(entry[0], LIVE_LIMITS.idChars);
  const x: number | null = finite(entry[1]);
  const z: number | null = finite(entry[2]);
  const facing: number | null = finite(entry[3]);
  return id === null || x === null || z === null || facing === null ? null : { id, x, z, facing };
}

function readEach<T>(value: unknown, read: (entry: unknown) => T | null): readonly T[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  return list.slice(0, LIVE_LIMITS.players).flatMap((entry: unknown): T[] => {
    const found: T | null = read(entry);
    return found === null ? [] : [found];
  });
}

function readFields(source: Fields): ServerFrame | null {
  switch (source['type']) {
    case 'welcome':
      return { type: 'welcome' };
    case 'full':
      return { type: 'full' };
    case 'replaced':
      return { type: 'replaced' };
    case 'present': {
      const zone: string | null = shortText(source['zone'], LIVE_LIMITS.idChars);
      const you: string | null = shortText(source['you'], LIVE_LIMITS.idChars);
      const players: readonly LivePlayer[] | null = readEach(source['players'], readPlayer);
      return zone === null || you === null || players === null ? null : { type: 'present', zone, you, players };
    }
    case 'joined': {
      const player: LivePlayer | null = readPlayer(source['player']);
      return player === null ? null : { type: 'joined', player };
    }
    case 'left': {
      const id: string | null = shortText(source['id'], LIVE_LIMITS.idChars);
      return id === null ? null : { type: 'left', id };
    }
    case 'look': {
      const id: string | null = shortText(source['id'], LIVE_LIMITS.idChars);
      const hero: string | null | undefined = readHero(source['hero']);
      const worn: Worn | null = readWorn(source['worn']);
      return id === null || hero === undefined || worn === null ? null : { type: 'look', id, hero, worn };
    }
    case 'moves': {
      const moves: readonly LiveMove[] | null = readEach(source['players'], readMove);
      return moves === null ? null : { type: 'moves', moves };
    }
    case 'refused': {
      const reason: EnterRefusal | undefined = ENTER_REFUSALS.find((known: EnterRefusal): boolean => known === source['reason']);
      return reason === undefined ? null : { type: 'refused', reason };
    }
    default:
      return null;
  }
}

export function readServerFrame(data: unknown): ServerFrame | null {
  if (typeof data !== 'string' || data.length > LIVE_LIMITS.frameChars) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  return isFields(parsed) ? readFields(parsed) : null;
}

export function helloFrame(token: string): string {
  return JSON.stringify({ type: 'hello', token });
}

function rounded(value: number): number {
  return Math.round(value * LIVE_LIMITS.centimetres) / LIVE_LIMITS.centimetres;
}

export function enterFrame(place: Place): string {
  return JSON.stringify({ type: 'enter', zone: LIVE_ZONE, x: rounded(place.x), z: rounded(place.z), facing: rounded(place.facing) });
}

export function moveFrame(place: Place): string {
  return JSON.stringify({ type: 'move', x: rounded(place.x), z: rounded(place.z), facing: rounded(place.facing) });
}

export function leaveFrame(): string {
  return JSON.stringify({ type: 'leave' });
}

export function liveUrl(serverUrl: string): string {
  return `${serverUrl.replace(/^http/, 'ws')}/v1/live`;
}
