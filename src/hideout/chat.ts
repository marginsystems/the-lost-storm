import type { FriendResult, NameResult, ReportResult } from '../backend/api.ts';
import { NAME_MESSAGES } from '../lobby/lobby-model.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine, ChatRefusal } from '../backend/live-protocol.ts';

export const CHAT = { keep: 60 } as const;

export type NoteKind = 'plain' | 'name';

export type ChatEntry =
  | { readonly kind: 'line'; readonly key: string; readonly line: ChatLine; readonly own: boolean }
  | { readonly kind: 'note'; readonly key: string; readonly text: string; readonly note: NoteKind };

export interface ChatState {
  readonly entries: readonly ChatEntry[];
  readonly you: string | null;
  readonly notes: number;
}

export const EMPTY_CHAT: ChatState = { entries: [], you: null, notes: 0 };

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

function lineEntry(line: ChatLine, you: string | null): ChatEntry {
  return { kind: 'line', key: `line-${line.id}`, line, own: line.from === you };
}

function kept(entries: readonly ChatEntry[]): readonly ChatEntry[] {
  return entries.slice(-CHAT.keep);
}

function withLines(state: ChatState, lines: readonly ChatLine[]): ChatState {
  const known: ReadonlySet<string> = new Set<string>(state.entries.map((entry: ChatEntry): string => entry.key));
  const fresh: ChatEntry[] = lines.map((line: ChatLine): ChatEntry => lineEntry(line, state.you)).filter((entry: ChatEntry): boolean => !known.has(entry.key));
  return fresh.length === 0 ? state : { ...state, entries: kept([...state.entries, ...fresh]) };
}

export function addNote(state: ChatState, text: string, note: NoteKind = 'plain'): ChatState {
  const notes: number = state.notes + 1;
  return { ...state, notes, entries: kept([...state.entries, { kind: 'note', key: `note-${notes}`, text, note }]) };
}

export function receive(state: ChatState, event: LiveEvent): ChatState {
  switch (event.type) {
    case 'present':
      return event.chat === null ? state : withLines({ ...state, you: event.you }, event.chat);
    case 'said':
      return withLines(state, [event.line]);
    case 'refused':
      return addNote(state, refusalText(event.reason), event.reason === 'name_needed' ? 'name' : 'plain');
    case 'joined':
    case 'left':
    case 'look':
    case 'moves':
    case 'gone':
      return state;
  }
  return state;
}

export function speaker(entry: ChatEntry): string | null {
  return entry.kind === 'line' && !entry.own ? entry.line.name : null;
}
