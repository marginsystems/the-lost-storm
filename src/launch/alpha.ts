import { isFields } from '../../sim/content/read.ts';
import type { Fields } from '../../sim/content/read.ts';

export type Device = 'desktop' | 'phone';
export type Rating = 'up' | 'down';
export type CountedEvent = 'opened_game' | 'pressed_enter' | 'picked_journal' | 'reached_shallows' | 'reached_waystation' | 'sent_feedback' | 'died';
export type Outcome = 'sent' | 'rejected' | 'retry';

export const COUNTED_EVENTS: readonly CountedEvent[] = ['opened_game', 'pressed_enter', 'picked_journal', 'reached_shallows', 'reached_waystation', 'sent_feedback', 'died'];

export type Milestone =
  | { readonly kind: 'flag'; readonly event: CountedEvent; readonly flag: string; readonly is: string | null }
  | { readonly kind: 'zone'; readonly event: CountedEvent; readonly zone: string };

export type Completion = { readonly kind: 'flag'; readonly flag: string } | { readonly kind: 'act'; readonly act: string };

export interface Progress {
  readonly flags: Readonly<Record<string, string>>;
  readonly ended: ReadonlySet<string>;
}

export interface AlphaRules {
  readonly complete: Completion;
  readonly milestones: readonly Milestone[];
}

export interface FeedbackContext {
  readonly zone: string;
  readonly level: number;
  readonly minutes: number;
  readonly device: Device;
  readonly build: string;
}

export interface FeedbackBody {
  readonly rating: Rating;
  readonly text: string;
  readonly context: FeedbackContext;
}

export interface LaunchState {
  readonly endShown: boolean;
  readonly counted: readonly CountedEvent[];
  readonly pending: readonly CountedEvent[];
  readonly outbox: readonly FeedbackBody[];
}

export interface Snapshot {
  readonly zone: string;
  readonly flags: Readonly<Record<string, string>>;
  readonly alive: boolean;
}

export const ALPHA: { readonly textChars: number; readonly outboxSize: number; readonly firstRetryMs: number; readonly maxRetryMs: number; readonly maxLevel: number; readonly maxMinutes: number } = {
  textChars: 600,
  outboxSize: 5,
  firstRetryMs: 5_000,
  maxRetryMs: 300_000,
  maxLevel: 999,
  maxMinutes: 1_000_000,
};

export const LAUNCH_KEY: string = 'the-lost-storm.alpha.v1';

const BUILD_ID: RegExp = /^[A-Za-z0-9._-]{1,40}$/;
const ZONE_ID: RegExp = /^[A-Za-z0-9_-]{1,64}$/;
const ANY_POINT: RegExp = /./gsu;
const WHITESPACE: RegExp = /\s+/g;
const CONTROL: RegExp = /[\p{Cc}\p{Cs}]/gu;
const FALLBACK_BUILD: string = 'dev';

export const EMPTY_STATE: LaunchState = { endShown: false, counted: [], pending: [], outbox: [] };

export function isCountedEvent(value: unknown): value is CountedEvent {
  return COUNTED_EVENTS.some((event: CountedEvent): boolean => event === value);
}

function textField(source: Fields, key: string, where: string): string {
  const value: unknown = source[key];
  if (typeof value !== 'string' || value === '') throw new Error(`${where}.${key} must be a non-empty string`);
  return value;
}

function readMilestone(value: unknown, index: number): Milestone {
  const where: string = `alpha.milestones[${index}]`;
  if (!isFields(value)) throw new Error(`${where} must be an object`);
  const event: unknown = value['event'];
  if (!isCountedEvent(event)) throw new Error(`${where}.event is not a counted event`);
  if (typeof value['zone'] === 'string') return { kind: 'zone', event, zone: textField(value, 'zone', where) };
  const is: unknown = value['is'];
  return { kind: 'flag', event, flag: textField(value, 'flag', where), is: typeof is === 'string' ? is : null };
}

function readCompletion(value: unknown): Completion {
  if (!isFields(value)) throw new Error('alpha.complete must be an object');
  if (typeof value['act'] === 'string') return { kind: 'act', act: textField(value, 'act', 'alpha.complete') };
  return { kind: 'flag', flag: textField(value, 'flag', 'alpha.complete') };
}

export function readAlphaRules(value: unknown): AlphaRules {
  if (!isFields(value)) throw new Error('alpha must be an object');
  const milestones: unknown = value['milestones'];
  if (!Array.isArray(milestones)) throw new Error('alpha.milestones must be an array');
  const list: readonly unknown[] = milestones;
  return { complete: readCompletion(value['complete']), milestones: list.map(readMilestone) };
}

export function codePoints(text: string): number {
  return text.match(ANY_POINT)?.length ?? 0;
}

export function cleanText(raw: string): string {
  const flat: string = raw.replace(WHITESPACE, ' ').replace(CONTROL, '').trim();
  const points: readonly string[] = flat.match(ANY_POINT) ?? [];
  return points.slice(0, ALPHA.textChars).join('').trim();
}

export function cleanBuild(raw: string | undefined): string {
  return raw !== undefined && BUILD_ID.test(raw) ? raw : FALLBACK_BUILD;
}

function whole(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function feedbackBody(rating: Rating, text: string, context: FeedbackContext): FeedbackBody {
  return {
    rating,
    text: cleanText(text),
    context: {
      zone: ZONE_ID.test(context.zone) ? context.zone : 'unknown',
      level: whole(context.level, 1, ALPHA.maxLevel),
      minutes: whole(context.minutes, 0, ALPHA.maxMinutes),
      device: context.device,
      build: cleanBuild(context.build),
    },
  };
}

export function isSliceComplete(rules: AlphaRules, progress: Progress): boolean {
  const complete: Completion = rules.complete;
  if (complete.kind === 'act') return progress.ended.has(complete.act);
  const value: string | undefined = progress.flags[complete.flag];
  return value !== undefined && value !== '';
}

function holds(milestone: Milestone, snapshot: Snapshot): boolean {
  if (milestone.kind === 'zone') return snapshot.zone === milestone.zone;
  const value: string | undefined = snapshot.flags[milestone.flag];
  return value !== undefined && (milestone.is === null || value === milestone.is);
}

export function reachedEvents(rules: AlphaRules, snapshot: Snapshot): readonly CountedEvent[] {
  const reached: CountedEvent[] = rules.milestones.filter((milestone: Milestone): boolean => holds(milestone, snapshot)).map((milestone: Milestone): CountedEvent => milestone.event);
  if (!snapshot.alive) reached.push('died');
  return reached;
}

export function noteEvent(state: LaunchState, event: CountedEvent): LaunchState {
  if (state.counted.includes(event) || state.pending.includes(event)) return state;
  return { ...state, pending: [...state.pending, event] };
}

export function afterCount(state: LaunchState, event: CountedEvent, outcome: Outcome): LaunchState {
  if (outcome === 'retry') return state;
  return { ...state, pending: state.pending.filter((pending: CountedEvent): boolean => pending !== event), counted: state.counted.includes(event) ? state.counted : [...state.counted, event] };
}

export function queueFeedback(state: LaunchState, body: FeedbackBody): LaunchState {
  return { ...state, outbox: [...state.outbox, body].slice(-ALPHA.outboxSize) };
}

export function afterFeedback(state: LaunchState, body: FeedbackBody, outcome: Outcome): LaunchState {
  if (outcome === 'retry') return state;
  return { ...state, outbox: state.outbox.filter((queued: FeedbackBody): boolean => queued !== body) };
}

export function shouldShowEnd(state: LaunchState, rules: AlphaRules, progress: Progress): boolean {
  return !state.endShown && isSliceComplete(rules, progress);
}

export function takeEnd(state: LaunchState, rules: AlphaRules, progress: Progress): LaunchState | null {
  return shouldShowEnd(state, rules, progress) ? markEndShown(state) : null;
}

export function markEndShown(state: LaunchState): LaunchState {
  return state.endShown ? state : { ...state, endShown: true };
}

export function retryDelay(failures: number): number {
  return Math.min(ALPHA.maxRetryMs, ALPHA.firstRetryMs * 2 ** Math.max(0, failures - 1));
}

export function outcomeOf(status: number): Outcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 400 || status === 413 || status === 422) return 'rejected';
  return 'retry';
}

function readEvents(value: unknown): readonly CountedEvent[] {
  if (!Array.isArray(value)) return [];
  const list: readonly unknown[] = value;
  return [...new Set(list.filter(isCountedEvent))];
}

function readContext(value: unknown): FeedbackContext | null {
  if (!isFields(value)) return null;
  const { zone, level, minutes, device, build } = value;
  if (typeof zone !== 'string' || typeof level !== 'number' || typeof minutes !== 'number' || typeof build !== 'string') return null;
  if (device !== 'desktop' && device !== 'phone') return null;
  return { zone, level, minutes, device, build };
}

function readBody(value: unknown): FeedbackBody | null {
  if (!isFields(value)) return null;
  const rating: unknown = value['rating'];
  const text: unknown = value['text'];
  const context: FeedbackContext | null = readContext(value['context']);
  if ((rating !== 'up' && rating !== 'down') || typeof text !== 'string' || context === null) return null;
  return feedbackBody(rating, text, context);
}

export function readLaunchState(text: string | null): LaunchState {
  if (text === null) return EMPTY_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return EMPTY_STATE;
  }
  if (!isFields(parsed)) return EMPTY_STATE;
  const outbox: unknown = parsed['outbox'];
  const bodies: readonly FeedbackBody[] = Array.isArray(outbox) ? outbox.map((entry: unknown): FeedbackBody | null => readBody(entry)).filter((entry: FeedbackBody | null): entry is FeedbackBody => entry !== null) : [];
  const counted: readonly CountedEvent[] = readEvents(parsed['counted']);
  return {
    endShown: parsed['endShown'] === true,
    counted,
    pending: readEvents(parsed['pending']).filter((event: CountedEvent): boolean => !counted.includes(event)),
    outbox: bodies.slice(-ALPHA.outboxSize),
  };
}

export function serializeLaunchState(state: LaunchState): string {
  return JSON.stringify(state);
}
