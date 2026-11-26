import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import { gestureOf } from '../../sim/content/gestures.ts';
import type { PartyFrame } from '../party/party-protocol.ts';
import { PARTY_VERSION, readPartyFrame } from '../party/party-protocol.ts';
import type { TradeFrame } from '../player-trade/trade-protocol.ts';
import { LIVE_TRADE_VERSION, readTradeFrame } from '../player-trade/trade-protocol.ts';
import type { PlayStamp } from './play.ts';

export const LIVE_LIMITS: {
  readonly idChars: number;
  readonly nameChars: number;
  readonly baseChars: number;
  readonly wornSlots: number;
  readonly players: number;
  readonly frameChars: number;
  readonly centimetres: number;
  readonly sayChars: number;
  readonly lineChars: number;
  readonly history: number;
  readonly muteFrameChars: number;
} = {
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
  muteFrameChars: 3800,
};

export const LIVE_CHAT_VERSION: number = 1;

export const LIVE_ZONE: string = 'hideout';

export type Worn = Readonly<Record<string, string>>;

export interface LiveAct {
  readonly id: string;
  readonly at: number;
}

export interface LivePlayer {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly hero: string | null;
  readonly worn: Worn;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
  readonly resident?: true;
  readonly act?: LiveAct;
}

export interface LiveMove {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
  readonly act?: LiveAct;
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
  readonly from: string | null;
  readonly name: string;
  readonly text: string;
  readonly at: string | null;
  readonly own: boolean | null;
  readonly resident?: true;
  readonly voice?: string;
}

export type WhisperDirection = 'from' | 'to';

export type WhisperRefusal = 'slow_down' | 'bad_text' | 'name_needed' | 'blocked' | 'no_such_player' | 'offline' | 'ignored' | 'self';

const WHISPER_REFUSALS: readonly WhisperRefusal[] = ['slow_down', 'bad_text', 'name_needed', 'blocked', 'no_such_player', 'offline', 'ignored', 'self'];

export interface Welcome {
  readonly you: string;
  readonly chat: readonly ChatLine[];
}

export type ServerFrame =
  | { readonly type: 'welcome'; readonly roaming: Welcome | null; readonly trade: boolean; readonly party: boolean; readonly claimed: boolean }
  | { readonly type: 'present'; readonly zone: string; readonly you: string; readonly players: readonly LivePlayer[]; readonly chat: readonly ChatLine[] | null }
  | { readonly type: 'said'; readonly line: ChatLine }
  | { readonly type: 'whisper'; readonly dir: WhisperDirection; readonly with: string; readonly line: ChatLine }
  | { readonly type: 'unsent'; readonly reason: WhisperRefusal; readonly to: string }
  | { readonly type: 'joined'; readonly player: LivePlayer }
  | { readonly type: 'left'; readonly id: string }
  | { readonly type: 'look'; readonly id: string; readonly name: string | null; readonly hero: string | null; readonly worn: Worn }
  | { readonly type: 'moves'; readonly moves: readonly LiveMove[] }
  | { readonly type: 'full' }
  | { readonly type: 'replaced' }
  | { readonly type: 'elsewhere' }
  | { readonly type: 'friends' }
  | { readonly type: 'refused'; readonly reason: Refusal }
  | { readonly type: 'trade'; readonly frame: TradeFrame }
  | { readonly type: 'party'; readonly frame: PartyFrame };

export interface Place {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
  readonly act?: LiveAct;
}

function shortText(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value !== '' && value.length <= limit ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readAct(id: unknown, at: unknown): LiveAct | null {
  const gesture: string | undefined = gestureOf(id)?.id;
  if (gesture === undefined) return null;
  return { id: gesture, at: typeof at === 'number' && Number.isSafeInteger(at) && at >= 0 ? at : 0 };
}

function withAct<T extends object>(value: T, act: LiveAct | null): T & { readonly act?: LiveAct } {
  return act === null ? value : { ...value, act };
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
  const username: string | null = shortText(value['username'], LIVE_LIMITS.nameChars);
  if (id === null || name === null || hero === undefined || worn === null || x === null || z === null || facing === null) return null;
  const player: LivePlayer = withAct({ id, name, username, hero, worn, x, z, facing }, readAct(value['act'], value['actAt']));
  return value['resident'] === true ? { ...player, resident: true } : player;
}

const VOICE_KEY: RegExp = /^[0-9a-f]{64}$/;

export function readLine(value: unknown): ChatLine | null {
  if (!isFields(value)) return null;
  const id: unknown = value['id'];
  const rawFrom: unknown = value['from'];
  const from: string | null = shortText(rawFrom, LIVE_LIMITS.idChars);
  const name: string | null = shortText(value['name'], LIVE_LIMITS.nameChars);
  const text: string | null = shortText(value['text'], LIVE_LIMITS.lineChars);
  const stamp: string | null = shortText(value['at'], LIVE_LIMITS.idChars);
  const at: string | null = stamp !== null && Number.isFinite(Date.parse(stamp)) ? stamp : null;
  const own: unknown = value['own'];
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || (from === null && rawFrom !== null) || name === null || text === null) return null;
  const line: ChatLine = { id, from, name, text, at, own: typeof own === 'boolean' ? own : null };
  if (value['resident'] !== true) return line;
  const voice: unknown = value['voice'];
  return typeof voice === 'string' && VOICE_KEY.test(voice) ? { ...line, resident: true, voice } : { ...line, resident: true };
}

function readWelcome(source: Fields): Welcome | null {
  const you: string | null = shortText(source['you'], LIVE_LIMITS.idChars);
  const chat: readonly ChatLine[] | null = readEach(source['chat'], readLine, LIVE_LIMITS.history);
  return you === null || chat === null ? null : { you, chat };
}

function readMove(value: unknown): LiveMove | null {
  if (!Array.isArray(value)) return null;
  const entry: readonly unknown[] = value;
  const id: string | null = shortText(entry[0], LIVE_LIMITS.idChars);
  const x: number | null = finite(entry[1]);
  const z: number | null = finite(entry[2]);
  const facing: number | null = finite(entry[3]);
  return id === null || x === null || z === null || facing === null ? null : withAct({ id, x, z, facing }, readAct(entry[4], entry[5]));
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
      return { type: 'welcome', roaming: readWelcome(source), trade: source['trade'] === LIVE_TRADE_VERSION, party: source['party'] === PARTY_VERSION, claimed: source['claimed'] === true };
    case 'full':
      return { type: 'full' };
    case 'replaced':
      return { type: 'replaced' };
    case 'elsewhere':
      return { type: 'elsewhere' };
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
    case 'whisper': {
      const dir: unknown = source['dir'];
      const other: string | null = shortText(source['with'], LIVE_LIMITS.nameChars);
      const line: ChatLine | null = readLine(source['line']);
      return (dir !== 'from' && dir !== 'to') || other === null || line === null ? null : { type: 'whisper', dir, with: other, line };
    }
    case 'unsent': {
      const reason: WhisperRefusal | undefined = WHISPER_REFUSALS.find((known: WhisperRefusal): boolean => known === source['reason']);
      const to: string | null = shortText(source['to'], LIVE_LIMITS.nameChars);
      return reason === undefined || to === null ? null : { type: 'unsent', reason, to };
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
    default: {
      const party: PartyFrame | null = readPartyFrame(source, readLine);
      if (party !== null) return { type: 'party', frame: party };
      const frame: TradeFrame | null = readTradeFrame(source);
      return frame === null ? null : { type: 'trade', frame };
    }
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

export function helloFrame(token: string, play: PlayStamp | null = null): string {
  if (play === null) return JSON.stringify({ type: 'hello', token, chat: LIVE_CHAT_VERSION, trade: LIVE_TRADE_VERSION, party: PARTY_VERSION });
  if (play.claim) return JSON.stringify({ type: 'hello', token, chat: LIVE_CHAT_VERSION, trade: LIVE_TRADE_VERSION, party: PARTY_VERSION, play: play.id, claim: true });
  return JSON.stringify({ type: 'hello', token, chat: LIVE_CHAT_VERSION, trade: LIVE_TRADE_VERSION, party: PARTY_VERSION, play: play.id });
}

function rounded(value: number): number {
  return Math.round(value * LIVE_LIMITS.centimetres) / LIVE_LIMITS.centimetres;
}

function actFields(act: LiveAct | undefined): { readonly act?: string; readonly actAt?: number } {
  return act === undefined ? {} : { act: act.id, actAt: act.at };
}

export function enterFrame(place: Place): string {
  return JSON.stringify({ type: 'enter', zone: LIVE_ZONE, x: rounded(place.x), z: rounded(place.z), facing: rounded(place.facing), ...actFields(place.act) });
}

export function moveFrame(place: Place): string {
  return JSON.stringify({ type: 'move', x: rounded(place.x), z: rounded(place.z), facing: rounded(place.facing), ...actFields(place.act) });
}

export function nextAct(previous: LiveAct | undefined, id: string | null | undefined, at: number | undefined, now: number): LiveAct | undefined {
  const gesture: string | undefined = gestureOf(id)?.id;
  if (gesture === undefined) return undefined;
  if (at !== undefined && Number.isFinite(at) && at >= 0) return { id: gesture, at: Math.min(Number.MAX_SAFE_INTEGER, Math.round(at)) };
  return previous?.id === gesture ? previous : { id: gesture, at: Math.max(0, Math.round(now)) };
}

export function sameAct(one: LiveAct | undefined, other: LiveAct | undefined): boolean {
  return one?.id === other?.id && one?.at === other?.at;
}

export function sayable(text: string): string | null {
  const trimmed: string = text.trim();
  return trimmed === '' || trimmed.replaceAll(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '_').length > LIVE_LIMITS.sayChars ? null : trimmed;
}

export function sayFrame(text: string): string {
  return JSON.stringify({ type: 'say', text });
}

export function whisperFrame(to: string, text: string): string {
  return JSON.stringify({ type: 'whisper', to, text });
}

export function mutesFrame(names: readonly string[]): string {
  const kept: string[] = [];
  for (const name of names.toReversed()) {
    if (name === '' || name.length > LIVE_LIMITS.nameChars) continue;
    if (JSON.stringify({ type: 'mutes', names: [name, ...kept] }).length > LIVE_LIMITS.muteFrameChars) break;
    kept.unshift(name);
  }
  return JSON.stringify({ type: 'mutes', names: kept });
}

export function leaveFrame(): string {
  return JSON.stringify({ type: 'leave' });
}

export function liveUrl(serverUrl: string): string {
  return `${serverUrl.replace(/^http/, 'ws')}/v1/live`;
}
