import { isFields } from '../sim/content/read.ts';

export interface FakeAnswer {
  readonly status: number;
  readonly body: unknown;
}

export interface StoredFeedback {
  readonly token: string | null;
  readonly body: unknown;
}

const EVENTS: ReadonlySet<string> = new Set<string>(['opened_game', 'pressed_enter', 'picked_journal', 'reached_shallows', 'reached_waystation', 'sent_feedback', 'died']);
const BODY_KEYS: readonly string[] = ['rating', 'text', 'context'];
const CONTEXT_KEYS: readonly string[] = ['zone', 'level', 'minutes', 'device', 'build'];
const ZONE_ID: RegExp = /^[A-Za-z0-9_-]{1,64}$/;
const BUILD_ID: RegExp = /^[A-Za-z0-9._-]{1,40}$/;
const CONTROL: RegExp = /[\p{Cc}\p{Cs}]/u;
const ANY_POINT: RegExp = /./gsu;
const TEXT_CHARS: number = 600;

const BAD: FakeAnswer = { status: 400, body: { error: { code: 'bad_request', message: 'bad_request' } } };

function whole(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function onlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key: string): boolean => keys.includes(key));
}

function goodText(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  const flat: string = value.replace(/\s+/g, ' ').trim();
  return !CONTROL.test(flat) && (flat.match(ANY_POINT)?.length ?? 0) <= TEXT_CHARS;
}

export function answerFeedback(body: unknown): FakeAnswer {
  if (!isFields(body) || !onlyKeys(body, BODY_KEYS)) return BAD;
  if (body['rating'] !== 'up' && body['rating'] !== 'down') return BAD;
  if (!goodText(body['text'])) return BAD;
  const context: unknown = body['context'];
  if (!isFields(context) || !onlyKeys(context, CONTEXT_KEYS)) return BAD;
  const { zone, level, minutes, device, build } = context;
  if (typeof zone !== 'string' || !ZONE_ID.test(zone) || typeof build !== 'string' || !BUILD_ID.test(build)) return BAD;
  if (device !== 'desktop' && device !== 'phone') return BAD;
  if (!whole(level, 1, 999) || !whole(minutes, 0, 1_000_000)) return BAD;
  return { status: 201, body: { status: 'received' } };
}

export function answerCount(body: unknown): FakeAnswer {
  if (!isFields(body) || !onlyKeys(body, ['event', 'device'])) return BAD;
  if (typeof body['event'] !== 'string' || !EVENTS.has(body['event'])) return BAD;
  if (body['device'] !== 'desktop' && body['device'] !== 'phone') return BAD;
  return { status: 200, body: { status: 'counted' } };
}
