import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';

export const LIVE_LIMITS: { readonly idChars: number; readonly nameChars: number; readonly baseChars: number; readonly wornSlots: number; readonly players: number; readonly frameChars: number; readonly centimetres: number; readonly sayChars: number; readonly lineChars: number; readonly history: number } = {
  idChars: 64,
  nameChars: 32,
  baseChars: 64,
  wornSlots: 16,
  players: 400,
  frameChars: 262144,
  centimetres: 100,
  sayChars: 200,
  lineChars: 800,
  history: 200,
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

export type ChatRefusal = 'slow_down' | 'blocked' | 'name_needed' | 'bad_text';

export type Refusal = EnterRefusal | ChatRefusal;

const REFUSALS: readonly Refusal[] = ['no_such_zone', 'no_character', 'off_floor', 'slow_down', 'blocked', 'name_needed', 'bad_text'];

const CHAT_REFUSALS: readonly ChatRefusal[] = ['slow_down', 'blocked', 'name_needed', 'bad_text'];

export function chatRefusal(reason: Refusal): ChatRefusal | null {
  return CHAT_REFUSALS.find((known: ChatRefusal): boolean => known === reason) ?? null;
}

export interface ChatLine {
  readonly id: number;
  readonly from: string;
  readonly name: string;
  readonly text: string;
  readonly at: string;
}

export type ServerFrame =
  | { readonly type: 'welcome' }
  | { readonly type: 'present'; readonly zone: string; readonly you: string; readonly players: readonly LivePlayer[]; readonly chat: readonly ChatLine[] | null }
  | { readonly type: 'said'; readonly line: ChatLine }
  | { readonly type: 'joined'; readonly player: LivePlayer }
  | { readonly type: 'left'; readonly id: string }
  | { readonly type: 'look'; readonly id: string; readonly name: string | null; readonly hero: string | null; readonly worn: Worn }
  | { readonly type: 'moves'; readonly moves: readonly LiveMove[] }
  | { readonly type: 'full' }
  | { readonly type: 'replaced' }
  | { readonly type: 'friends' }
  | { readonly type: 'refused'; readonly reason: Refusal };

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

export function readLine(value: unknown): ChatLine | null {
  if (!isFields(value)) return null;
  const id: unknown = value['id'];
  const from: string | null = shortText(value['from'], LIVE_LIMITS.idChars);
  const name: string | null = shortText(value['name'], LIVE_LIMITS.nameChars);
  const text: string | null = shortText(value['text'], LIVE_LIMITS.lineChars);
  const at: string | null = shortText(value['at'], LIVE_LIMITS.idChars);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || from === null || name === null || text === null || at === null) return null;
  return { id, from, name, text, at };
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

function readEach<T>(value: unknown, read: (entry: unknown) => T | null, limit: number = LIVE_LIMITS.players): readonly T[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  return list.slice(-limit).flatMap((entry: unknown): T[] => {
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
    case 'friends':
      return { type: 'friends' };
    case 'present': {
      const zone: string | null = shortText(source['zone'], LIVE_LIMITS.idChars);
      const you: string | null = shortText(source['you'], LIVE_LIMITS.idChars);
      const players: readonly LivePlayer[] | null = readEach(source['players'], readPlayer);
      const chat: readonly ChatLine[] | null = readEach(source['chat'], readLine, LIVE_LIMITS.history);
      return zone === null || you === null || players === null ? null : { type: 'present', zone, you, players, chat };
    }
    case 'said': {
      const line: ChatLine | null = readLine(source['line']);
      return line === null ? null : { type: 'said', line };
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
      const named: boolean = source['name'] !== undefined;
      const name: string | null = named ? shortText(source['name'], LIVE_LIMITS.nameChars) : null;
      return id === null || hero === undefined || worn === null || (named && name === null) ? null : { type: 'look', id, name, hero, worn };
    }
    case 'moves': {
      const moves: readonly LiveMove[] | null = readEach(source['players'], readMove);
      return moves === null ? null : { type: 'moves', moves };
    }
    case 'refused': {
      const reason: Refusal | undefined = REFUSALS.find((known: Refusal): boolean => known === source['reason']);
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

export function sayable(text: string): string | null {
  const trimmed: string = text.trim();
  return trimmed === '' || trimmed.replaceAll(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '_').length > LIVE_LIMITS.sayChars ? null : trimmed;
}

export function sayFrame(text: string): string {
  return JSON.stringify({ type: 'say', text });
}

export function leaveFrame(): string {
  return JSON.stringify({ type: 'leave' });
}

export function liveUrl(serverUrl: string): string {
  return `${serverUrl.replace(/^http/, 'ws')}/v1/live`;
}
