import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import { exchange, headers, succeeded } from './api.ts';
import type { Answer, FetchFn } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export type EchoPoint = readonly [number, number, number];
export type RunStep = readonly [string, number, number];

export interface Echo {
  readonly name: string | null;
  readonly points: readonly EchoPoint[];
}

export interface Mark {
  readonly x: number;
  readonly z: number;
  readonly words: readonly string[];
}

export interface Marks {
  readonly marks: readonly Mark[];
  readonly yours: Mark | null;
}

export interface Tally {
  readonly count: number;
  readonly others: number;
}

export interface Timeline {
  readonly name: string;
  readonly level: number;
  readonly furthest: string;
  readonly furthestZone: string;
  readonly playedMinutes: number;
  readonly choices: Readonly<Record<string, string>>;
  readonly path: readonly RunStep[];
}

export interface TracesClient {
  echoes(zone: string): Promise<readonly Echo[] | null>;
  leaveEcho(zone: string, points: readonly EchoPoint[]): Promise<boolean>;
  marks(zone: string): Promise<Marks | null>;
  leaveMark(zone: string, x: number, z: number, words: readonly string[]): Promise<Mark | null>;
  countJournal(): Promise<Tally | null>;
  timelines(): Promise<readonly Timeline[] | null>;
  signedIn(): boolean;
}

export interface TracesOptions {
  readonly serverUrl: string;
  readonly store: KeyValueStore;
  readonly fetch: FetchFn;
}

export const TRACES = {
  requestMs: 6000,
  echoes: 8,
  echoPoints: 40,
  minEchoPoints: 4,
  marks: 8,
  markWords: 3,
  runs: 8,
  runPath: 64,
  choices: 32,
  nameChars: 32,
  zoneChars: 40,
  wordChars: 32,
  maxCoordinate: 100_000,
  maxFacing: Math.PI + 0.01,
} as const;

const ZONE: RegExp = /^[a-z0-9_]{1,40}$/;
const WORD: RegExp = /^[a-z][a-z_]{0,31}$/;
const CHOICE: RegExp = /^[a-z0-9_]{1,32}$/;

function coordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= TRACES.maxCoordinate;
}

function wholeNumber(source: Fields, key: string, min: number): number | null {
  const value: unknown = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null;
}

function shortName(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= TRACES.nameChars ? value : null;
}

function capped<T>(value: unknown, limit: number, read: (entry: unknown) => T | null): readonly T[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  const entries: (T | null)[] = list.slice(0, limit).map(read);
  return entries.every((entry: T | null): boolean => entry !== null) ? entries.filter((entry: T | null): entry is T => entry !== null) : null;
}

export function readEchoPoint(value: unknown): EchoPoint | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parts: readonly unknown[] = value;
  const [x, z, facing] = parts;
  if (!coordinate(x) || !coordinate(z) || typeof facing !== 'number' || !Number.isFinite(facing) || Math.abs(facing) > TRACES.maxFacing) return null;
  return [x, z, facing];
}

function readEcho(value: unknown): Echo | null {
  if (!isFields(value)) return null;
  const rawName: unknown = value['name'];
  const name: string | null = rawName === null ? null : shortName(rawName);
  const points: readonly EchoPoint[] | null = capped(value['points'], TRACES.echoPoints, readEchoPoint);
  if ((rawName !== null && name === null) || points === null || points.length < TRACES.minEchoPoints) return null;
  return { name, points };
}

export function readEchoes(value: unknown): readonly Echo[] | null {
  return isFields(value) ? capped(value['echoes'], TRACES.echoes, readEcho) : null;
}

function readWords(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > TRACES.markWords) return null;
  const list: readonly unknown[] = value;
  return list.every((word: unknown): boolean => typeof word === 'string' && WORD.test(word)) ? list.filter((word: unknown): word is string => typeof word === 'string') : null;
}

export function readMark(value: unknown): Mark | null {
  if (!isFields(value)) return null;
  const { x, z } = value;
  const words: readonly string[] | null = readWords(value['words']);
  return coordinate(x) && coordinate(z) && words !== null ? { x, z, words } : null;
}

export function readMarks(value: unknown): Marks | null {
  if (!isFields(value)) return null;
  const marks: readonly Mark[] | null = capped(value['marks'], TRACES.marks, readMark);
  const rawYours: unknown = value['yours'];
  const yours: Mark | null = rawYours === null ? null : readMark(rawYours);
  if (marks === null || (rawYours !== null && yours === null)) return null;
  return { marks, yours };
}

export function readTally(value: unknown): Tally | null {
  if (!isFields(value)) return null;
  const count: number | null = wholeNumber(value, 'count', 0);
  const others: number | null = wholeNumber(value, 'others', 0);
  return count === null || others === null || others > count ? null : { count, others };
}

function readRunStep(value: unknown): RunStep | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parts: readonly unknown[] = value;
  const [zone, x, z] = parts;
  return typeof zone === 'string' && ZONE.test(zone) && coordinate(x) && coordinate(z) ? [zone, x, z] : null;
}

function readChoices(value: unknown): Readonly<Record<string, string>> | null {
  if (!isFields(value)) return null;
  const entries: [string, unknown][] = Object.entries(value);
  if (entries.length > TRACES.choices) return null;
  const choices: Record<string, string> = {};
  for (const [key, entry] of entries) {
    if (!CHOICE.test(key) || typeof entry !== 'string' || !CHOICE.test(entry)) return null;
    choices[key] = entry;
  }
  return choices;
}

function readTimeline(value: unknown): Timeline | null {
  if (!isFields(value)) return null;
  const name: string | null = shortName(value['name']);
  const furthest: string | null = shortName(value['furthest']);
  const furthestZone: unknown = value['furthestZone'];
  const level: number | null = wholeNumber(value, 'level', 1);
  const playedMinutes: number | null = wholeNumber(value, 'playedMinutes', 0);
  const choices: Readonly<Record<string, string>> | null = readChoices(value['choices']);
  const path: readonly RunStep[] | null = capped(value['path'], TRACES.runPath, readRunStep);
  if (name === null || furthest === null || typeof furthestZone !== 'string' || !ZONE.test(furthestZone) || level === null || playedMinutes === null || choices === null || path === null) return null;
  return { name, level, furthest, furthestZone, playedMinutes, choices, path };
}

export function readTimelines(value: unknown): readonly Timeline[] | null {
  return isFields(value) ? capped(value['runs'], TRACES.runs, readTimeline) : null;
}

function zonePath(zone: string): string | null {
  return ZONE.test(zone) ? encodeURIComponent(zone) : null;
}

export function createTracesClient(options: TracesOptions): TracesClient {
  const token = (): string | null => parseSyncRecord(options.store.read(SYNC_KEY), options.serverUrl)?.token ?? null;

  const viewerHeaders = (): Record<string, string> => {
    const held: string | null = token();
    return held === null ? {} : { Authorization: `Bearer ${held}` };
  };

  const read = async <T>(path: string, reader: (body: unknown) => T | null): Promise<T | null> => {
    const answer: Answer | null = await exchange(options.fetch, `${options.serverUrl}${path}`, { method: 'GET', headers: viewerHeaders(), signal: AbortSignal.timeout(TRACES.requestMs) });
    return succeeded(answer) ? reader(answer.body) : null;
  };

  const send = async <T>(method: 'POST' | 'PUT', path: string, body: unknown, reader: (body: unknown) => T | null): Promise<T | null> => {
    const record: SyncRecord | null = parseSyncRecord(options.store.read(SYNC_KEY), options.serverUrl);
    if (record === null) return null;
    const init: RequestInit = body === null ? { method, headers: headers(record.token), signal: AbortSignal.timeout(TRACES.requestMs) } : { method, headers: headers(record.token), body: JSON.stringify(body), signal: AbortSignal.timeout(TRACES.requestMs) };
    const answer: Answer | null = await exchange(options.fetch, `${options.serverUrl}${path}`, init);
    return succeeded(answer) ? reader(answer.body) : null;
  };

  return {
    signedIn: (): boolean => token() !== null,
    echoes: async (zone: string): Promise<readonly Echo[] | null> => {
      const path: string | null = zonePath(zone);
      return path === null ? null : read(`/v1/echoes/${path}`, readEchoes);
    },
    leaveEcho: async (zone: string, points: readonly EchoPoint[]): Promise<boolean> => {
      if (zonePath(zone) === null || points.length < TRACES.minEchoPoints || points.length > TRACES.echoPoints) return false;
      const kept: true | null = await send('POST', '/v1/echoes', { zone, points }, (): true => true);
      return kept === true;
    },
    marks: async (zone: string): Promise<Marks | null> => {
      const path: string | null = zonePath(zone);
      return path === null ? null : read(`/v1/marks/${path}`, readMarks);
    },
    leaveMark: async (zone: string, x: number, z: number, words: readonly string[]): Promise<Mark | null> => {
      if (zonePath(zone) === null || readWords(words) === null) return null;
      return send('PUT', '/v1/mark', { zone, x, z, words }, (body: unknown): Mark | null => (isFields(body) ? readMark(body['mark']) : null));
    },
    countJournal: (): Promise<Tally | null> => send('POST', '/v1/tallies/journal', null, readTally),
    timelines: (): Promise<readonly Timeline[] | null> => read('/v1/timelines', readTimelines),
  };
}
