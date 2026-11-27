import type { FriendResult, NameResult, ReportResult } from '../backend/api.ts';
import { NAME_MESSAGES } from '../lobby/lobby-model.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine, ChatRefusal, WhisperDirection, WhisperRefusal } from '../backend/live-protocol.ts';
import type { PartyFrame } from '../party/party-protocol.ts';
import type { ChatCommand } from './chat-command.ts';
import { CHAT_COMMAND, nameKey } from './chat-command.ts';

export const CHAT = { keep: 120, names: 200 } as const;

export const CHAT_DAYS = {
  today: 'Today',
  yesterday: 'Yesterday',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const;

export const CHAT_WORDS = {
  general: 'General',
  party: 'Party',
  hint: 'Whisper with /dm name, reply with /r, back to General with /g.',
  help: '/dm name message whispers to one player. /r message answers the last whisper. /g goes back to General. /invite name asks a player into your party, /p message speaks to it, /leave leaves it. The leader can /kick name and /lead name. In a whisper, put a name with spaces in quotes.',
  noWhispers: 'Whispers are not available yet.',
  noReply: 'No one has whispered to you yet.',
  noParty: 'You are not in a party. Ask someone in with /invite name.',
} as const;

export type NoteKind = 'plain' | 'name' | 'hint';

export type ChatScope = 'everyone' | 'hideout';

export type ChatTarget = { readonly kind: 'general' } | { readonly kind: 'party' } | { readonly kind: 'whisper'; readonly name: string };

export const GENERAL: ChatTarget = { kind: 'general' };

export const PARTY: ChatTarget = { kind: 'party' };

export type ChatEntry =
  | { readonly kind: 'line'; readonly key: string; readonly line: ChatLine; readonly own: boolean }
  | { readonly kind: 'whisper'; readonly key: string; readonly line: ChatLine; readonly dir: WhisperDirection; readonly with: string }
  | { readonly kind: 'party'; readonly key: string; readonly line: ChatLine; readonly own: boolean }
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
  readonly party: boolean;
}

export const EMPTY_CHAT: ChatState = { entries: [], you: null, me: null, notes: 0, scope: null, target: GENERAL, replyTo: null, names: [], party: false };

export type ChatAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'say'; readonly text: string }
  | { readonly kind: 'whisper'; readonly to: string; readonly text: string }
  | { readonly kind: 'party_say'; readonly text: string }
  | { readonly kind: 'party_invite'; readonly name: string }
  | { readonly kind: 'party_kick'; readonly name: string }
  | { readonly kind: 'party_lead'; readonly name: string }
  | { readonly kind: 'party_leave' };

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

interface Day {
  readonly year: number;
  readonly month: number;
  readonly date: number;
}

function dayOf(ms: number): Day {
  const moment: Date = new Date(ms);
  return { year: moment.getFullYear(), month: moment.getMonth(), date: moment.getDate() };
}

function sameDay(left: Day, right: Day): boolean {
  return left.year === right.year && left.month === right.month && left.date === right.date;
}

function stampOf(at: string | null): number | null {
  if (at === null) return null;
  const parsed: number = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dayLabel(at: number, now: number): string {
  const day: Day = dayOf(at);
  const today: Day = dayOf(now);
  if (sameDay(day, today)) return CHAT_DAYS.today;
  const before: Date = new Date(today.year, today.month, today.date - 1);
  if (sameDay(day, dayOf(before.getTime()))) return CHAT_DAYS.yesterday;
  const named: string = `${String(day.date)} ${CHAT_DAYS.months[day.month] ?? ''}`;
  return day.year === today.year ? named : `${named} ${String(day.year)}`;
}

export function dayDivider(previous: string | null, at: string | null, now: number): string | null {
  const stamp: number | null = stampOf(at);
  if (stamp === null) return null;
  const earlier: number | null = stampOf(previous);
  if (earlier === null ? sameDay(dayOf(stamp), dayOf(now)) : sameDay(dayOf(stamp), dayOf(earlier))) return null;
  return dayLabel(stamp, now);
}

export function readers(state: ChatState): string {
  if (state.target.kind === 'whisper') return `Only you and ${state.target.name} read this.`;
  if (state.target.kind === 'party') return 'Only your party reads this.';
  return state.scope === 'hideout' ? 'Everyone in the Hideout reads this.' : 'Everyone online reads this.';
}

export function destination(aim: ChatTarget): string {
  switch (aim.kind) {
    case 'whisper':
      return `To ${aim.name}`;
    case 'party':
      return `To ${CHAT_WORDS.party}`;
    case 'general':
      return `To ${CHAT_WORDS.general}`;
  }
  return `To ${CHAT_WORDS.general}`;
}

export function isResidentName(name: string, line: ChatLine | null, known: ReadonlySet<string>): boolean {
  return line?.resident === true || known.has(name.toLowerCase());
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
    case 'party':
      return partyReceive(state, event.frame);
    case 'gone':
      return state.party || state.target.kind === 'party' ? { ...state, party: false, target: state.target.kind === 'party' ? GENERAL : state.target } : state;
    case 'left':
    case 'moves':
    case 'friends':
    case 'trade':
    case 'away':
      return state;
  }
  return state;
}

function partyReceive(state: ChatState, frame: PartyFrame): ChatState {
  switch (frame.type) {
    case 'party_said':
      return withEntries(state, [{ kind: 'party', key: `party-${String(frame.line.id)}`, line: frame.line, own: frame.line.own === true }]);
    case 'party_state': {
      const party: boolean = frame.members.length > 0;
      if (party === state.party) return state;
      return { ...state, party, target: !party && state.target.kind === 'party' ? GENERAL : state.target };
    }
    case 'party_invited':
    case 'party_note':
    case 'party_refused':
      return state;
  }
  return state;
}

export function target(state: ChatState, next: ChatTarget): ChatState {
  switch (next.kind) {
    case 'general':
      return state.target.kind === 'general' ? state : { ...state, target: GENERAL };
    case 'party':
      return state.target.kind === 'party' ? state : { ...state, target: PARTY };
    case 'whisper':
      return withName({ ...state, target: next }, next.name);
  }
  return state;
}

function none(state: ChatState, keepOpen: boolean = false): ChatStep {
  return { state, action: { kind: 'none' }, keepOpen };
}

function toParty(state: ChatState, text: string | null): ChatStep {
  if (!state.party) return none(addNote(state, CHAT_WORDS.noParty));
  const aimed: ChatState = target(state, PARTY);
  return text === null ? none(aimed, true) : { state: aimed, action: { kind: 'party_say', text }, keepOpen: false };
}

function noNameText(typed: string): string {
  const word: string = typed.slice(CHAT_COMMAND.prefix.length);
  const whispers: boolean = CHAT_COMMAND.whisper.some((known: string): boolean => known === word);
  return whispers ? `Name a player: ${typed} name message` : `Name a player: ${typed} name`;
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
      if (state.target.kind === 'whisper') return whisperTo(state, state.target.name, parsed.text);
      if (state.target.kind === 'party') return toParty(state, parsed.text);
      return { state, action: { kind: 'say', text: parsed.text }, keepOpen: false };
    case 'party':
      return toParty(state, parsed.text);
    case 'invite':
      return { state, action: { kind: 'party_invite', name: parsed.name }, keepOpen: false };
    case 'kick':
      return { state, action: { kind: 'party_kick', name: parsed.name }, keepOpen: false };
    case 'lead':
      return { state, action: { kind: 'party_lead', name: parsed.name }, keepOpen: false };
    case 'leave':
      return state.party ? { state, action: { kind: 'party_leave' }, keepOpen: false } : none(addNote(state, CHAT_WORDS.noParty));
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
      return { state: addNote(state, noNameText(parsed.command)), action: { kind: 'none' }, keepOpen: false };
    case 'unknown':
      return { state: addNote(state, `${parsed.command} is not a command. Try /dm name, /r, /g, /invite name or /p.`), action: { kind: 'none' }, keepOpen: false };
  }
  return { state, action: { kind: 'none' }, keepOpen: false };
}

export function speaker(entry: ChatEntry): string | null {
  switch (entry.kind) {
    case 'line':
      return entry.own ? null : entry.line.name;
    case 'whisper':
      return entry.with;
    case 'party':
      return entry.own ? null : entry.line.name;
    case 'note':
      return null;
  }
  return null;
}
