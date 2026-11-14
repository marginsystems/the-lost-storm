import type { FriendResult, NameResult, ReportResult } from '../backend/api.ts';
import { NAME_MESSAGES } from '../lobby/lobby-model.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine, ChatRefusal, WhisperDirection, WhisperRefusal } from '../backend/live-protocol.ts';
import type { ChatCommand } from './chat-command.ts';
import { nameKey } from './chat-command.ts';

export const CHAT = { keep: 60, names: 200 } as const;

export const CHAT_WORDS = {
  general: 'General',
  hint: 'Whisper with /dm name, reply with /r, back to General with /g.',
  help: '/dm name message whispers to one player. /r message answers the last whisper. /g goes back to General. Put a name with spaces in quotes.',
  noWhispers: 'Whispers are not available yet.',
  noReply: 'No one has whispered to you yet.',
} as const;

export type NoteKind = 'plain' | 'name' | 'hint';

export type ChatScope = 'everyone' | 'hideout';

export type ChatTarget = { readonly kind: 'general' } | { readonly kind: 'whisper'; readonly name: string };

export const GENERAL: ChatTarget = { kind: 'general' };

export type ChatEntry =
  | { readonly kind: 'line'; readonly key: string; readonly line: ChatLine; readonly own: boolean }
  | { readonly kind: 'whisper'; readonly key: string; readonly line: ChatLine; readonly dir: WhisperDirection; readonly with: string }
  | { readonly kind: 'note'; readonly key: string; readonly text: string; readonly note: NoteKind };

export interface ChatState {
  readonly entries: readonly ChatEntry[];
  readonly you: string | null;
  readonly me: string | null;
  readonly notes: number;
  readonly scope: ChatScope | null;
  readonly target: ChatTarget;
  readonly replyTo: string | null;
  readonly names: readonly string[];
}

export const EMPTY_CHAT: ChatState = { entries: [], you: null, me: null, notes: 0, scope: null, target: GENERAL, replyTo: null, names: [] };

export type ChatAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'say'; readonly text: string }
  | { readonly kind: 'whisper'; readonly to: string; readonly text: string };

export interface ChatStep {
  readonly state: ChatState;
  readonly action: ChatAction;
  readonly keepOpen: boolean;
}

const REFUSAL_TEXT: Readonly<Record<ChatRefusal, string>> = {
  slow_down: 'Too fast. Wait a moment.',
  blocked: 'That line was not sent.',
  name_needed: 'Choose a name to speak.',
  bad_text: 'That line cannot be sent.',
};

const REPORT_TEXT: Readonly<Record<ReportResult, string>> = {
  reported: 'Reported. Thank you.',
  gone: 'That line is gone.',
  own: 'That is your own line.',
  slow: 'Too many reports. Try again later.',
  unsupported: 'Reports are not available here.',
  failed: 'The report could not be sent.',
};

export function refusalText(reason: ChatRefusal): string {
  return REFUSAL_TEXT[reason];
}

export function unsentText(reason: WhisperRefusal, to: string): string {
  switch (reason) {
    case 'no_such_player':
      return `No one is called ${to}. Put a name with spaces in quotes: /dm "Ash Walker" hello`;
    case 'offline':
      return `${to} is not online.`;
    case 'ignored':
      return `${to} is not taking your whispers.`;
    case 'self':
      return 'That is you.';
    case 'slow_down':
      return 'Too fast. Wait a moment.';
    case 'blocked':
      return 'That whisper was not sent.';
    case 'bad_text':
      return 'That whisper cannot be sent.';
    case 'name_needed':
      return 'Choose a name to whisper.';
  }
  return 'That whisper was not sent.';
}

export function reportText(result: ReportResult): string {
  return REPORT_TEXT[result];
}

export function friendText(result: FriendResult, name: string): string {
  switch (result.kind) {
    case 'ok':
      return result.state === 'friends' ? `You and ${name} are friends.` : `Friend request sent to ${name}.`;
    case 'unsupported':
      return 'Friends are not available here.';
    case 'failed':
      return 'The request could not be sent.';
    case 'refused':
      switch (result.reason) {
        case 'name_needed':
          return 'Choose a name first.';
        case 'own_name':
          return 'That is you.';
        case 'no_such_character':
          return `No one is called ${name}.`;
        case 'friend_limit':
          return 'Your friends list is full.';
        case 'no_such_request':
          return `${name} has no request waiting.`;
      }
  }
  return 'The request could not be sent.';
}

export function renameText(result: NameResult): string {
  switch (result.kind) {
    case 'ok':
      return `You are ${result.name} now. Say it again.`;
    case 'invalid':
      return NAME_MESSAGES[result.reason];
    case 'limited':
      return NAME_MESSAGES.limited;
    case 'unauthorized':
    case 'refused':
    case 'retry':
      return NAME_MESSAGES.unavailable;
  }
  return NAME_MESSAGES.unavailable;
}

export function readers(state: ChatState): string {
  if (state.target.kind === 'whisper') return `Only you and ${state.target.name} read this.`;
  return state.scope === 'hideout' ? 'Everyone in the Hideout reads this.' : 'Everyone online reads this.';
}

export function destination(aim: ChatTarget): string {
  return aim.kind === 'whisper' ? `To ${aim.name}` : `To ${CHAT_WORDS.general}`;
}

function isOwn(line: ChatLine, state: ChatState): boolean {
  if (line.own !== null) return line.own;
  return line.from !== null && (line.from === state.you || line.from === state.me);
}

function kept(entries: readonly ChatEntry[]): readonly ChatEntry[] {
  return entries.slice(-CHAT.keep);
}

export function withName(state: ChatState, name: string): ChatState {
  const key: string = nameKey(name);
  if (key === '') return state;
  const others: readonly string[] = state.names.filter((known: string): boolean => nameKey(known) !== key);
  return { ...state, names: [...others, name].slice(-CHAT.names) };
}

function withEntries(state: ChatState, fresh: readonly ChatEntry[]): ChatState {
  const known: ReadonlySet<string> = new Set<string>(state.entries.map((entry: ChatEntry): string => entry.key));
  const added: readonly ChatEntry[] = fresh.filter((entry: ChatEntry): boolean => !known.has(entry.key));
  if (added.length === 0) return state;
  let next: ChatState = { ...state, entries: kept([...state.entries, ...added]) };
  for (const entry of added) if (entry.kind !== 'note') next = withName(next, entry.kind === 'whisper' ? entry.with : entry.line.name);
  return next;
}

function withLines(state: ChatState, lines: readonly ChatLine[]): ChatState {
  return withEntries(
    state,
    lines.map((line: ChatLine): ChatEntry => ({ kind: 'line', key: `line-${String(line.id)}`, line, own: isOwn(line, state) })),
  );
}

export function addNote(state: ChatState, text: string, note: NoteKind = 'plain'): ChatState {
  const notes: number = state.notes + 1;
  return { ...state, notes, entries: kept([...state.entries, { kind: 'note', key: `note-${String(notes)}`, text, note }]) };
}

export function receive(state: ChatState, event: LiveEvent): ChatState {
  switch (event.type) {
    case 'welcome':
      return withLines({ ...state, me: event.you, scope: 'everyone' }, event.chat);
    case 'present':
      return event.chat === null ? state : withLines({ ...state, you: event.you, scope: state.scope ?? 'hideout' }, event.chat);
    case 'said':
      return withLines(state, [event.line]);
    case 'whisper': {
      const entry: ChatEntry = { kind: 'whisper', key: `whisper-${String(event.line.id)}`, line: event.line, dir: event.dir, with: event.with };
      const next: ChatState = withEntries(state, [entry]);
      return event.dir === 'from' && next !== state ? { ...next, replyTo: event.with } : next;
    }
    case 'unsent':
      return addNote(state, unsentText(event.reason, event.to), event.reason === 'name_needed' ? 'name' : 'plain');
    case 'refused':
      return addNote(state, refusalText(event.reason), event.reason === 'name_needed' ? 'name' : 'plain');
    case 'joined':
      return withName(state, event.player.name);
    case 'look':
      return event.name === null ? state : withName(state, event.name);
    case 'left':
    case 'moves':
    case 'friends':
    case 'away':
    case 'gone':
      return state;
  }
  return state;
}

export function target(state: ChatState, next: ChatTarget): ChatState {
  if (next.kind === 'general') return state.target.kind === 'general' ? state : { ...state, target: GENERAL };
  return withName({ ...state, target: next }, next.name);
}

function whisperTo(state: ChatState, name: string, text: string | null): ChatStep {
  if (state.scope !== 'everyone') return { state: addNote(state, CHAT_WORDS.noWhispers), action: { kind: 'none' }, keepOpen: false };
  const aimed: ChatState = target(state, { kind: 'whisper', name });
  return text === null ? { state: aimed, action: { kind: 'none' }, keepOpen: true } : { state: aimed, action: { kind: 'whisper', to: name, text }, keepOpen: false };
}

export function command(state: ChatState, parsed: ChatCommand): ChatStep {
  switch (parsed.kind) {
    case 'empty':
      return { state, action: { kind: 'none' }, keepOpen: false };
    case 'say':
      return state.target.kind === 'whisper' ? whisperTo(state, state.target.name, parsed.text) : { state, action: { kind: 'say', text: parsed.text }, keepOpen: false };
    case 'general': {
      const back: ChatState = target(state, GENERAL);
      return parsed.text === null ? { state: back, action: { kind: 'none' }, keepOpen: true } : { state: back, action: { kind: 'say', text: parsed.text }, keepOpen: false };
    }
    case 'whisper':
      return whisperTo(state, parsed.name, parsed.text);
    case 'reply':
      return state.replyTo === null ? { state: addNote(state, CHAT_WORDS.noReply), action: { kind: 'none' }, keepOpen: false } : whisperTo(state, state.replyTo, parsed.text);
    case 'help':
      return { state: addNote(state, CHAT_WORDS.help, 'hint'), action: { kind: 'none' }, keepOpen: false };
    case 'no_name':
      return { state: addNote(state, `Name a player: ${parsed.command} name message`), action: { kind: 'none' }, keepOpen: false };
    case 'unknown':
      return { state: addNote(state, `${parsed.command} is not a command. Try /dm name, /r or /g.`), action: { kind: 'none' }, keepOpen: false };
  }
  return { state, action: { kind: 'none' }, keepOpen: false };
}

export function speaker(entry: ChatEntry): string | null {
  switch (entry.kind) {
    case 'line':
      return entry.own ? null : entry.line.name;
    case 'whisper':
      return entry.with;
    case 'note':
      return null;
  }
  return null;
}
