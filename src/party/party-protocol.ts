import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import type { ChatLine } from '../backend/live-protocol.ts';

export const PARTY_VERSION: number = 1;

export const PARTY_LIMITS: {
  readonly size: number;
  readonly id: number;
  readonly nameChars: number;
  readonly zoneChars: number;
  readonly level: number;
  readonly invites: number;
} = {
  size: 4,
  id: Number.MAX_SAFE_INTEGER,
  nameChars: 40,
  zoneChars: 64,
  level: 1000,
  invites: 8,
};

export interface PartyMember {
  readonly name: string;
  readonly leader: boolean;
  readonly online: boolean;
  readonly you: boolean;
  readonly zone: string | null;
  readonly level: number | null;
}

export type PartyNoteKind = 'invited' | 'joined' | 'left' | 'kicked' | 'lead' | 'declined' | 'expired' | 'disbanded';

export type PartyRefusal =
  | 'unsupported'
  | 'no_such_player'
  | 'offline'
  | 'self'
  | 'in_party'
  | 'full'
  | 'not_leader'
  | 'not_in_party'
  | 'ignored'
  | 'slow_down'
  | 'expired'
  | 'bad_text'
  | 'name_needed'
  | 'blocked'
  | 'pending';

export const PARTY_NOTES: readonly PartyNoteKind[] = ['invited', 'joined', 'left', 'kicked', 'lead', 'declined', 'expired', 'disbanded'];

export const PARTY_REFUSALS: readonly PartyRefusal[] = ['unsupported', 'no_such_player', 'offline', 'self', 'in_party', 'full', 'not_leader', 'not_in_party', 'ignored', 'slow_down', 'expired', 'bad_text', 'name_needed', 'blocked', 'pending'];

export type PartyFrame =
  | { readonly type: 'party_state'; readonly members: readonly PartyMember[] }
  | { readonly type: 'party_invited'; readonly id: number; readonly from: string; readonly level: number | null; readonly expiresAt: number }
  | { readonly type: 'party_note'; readonly kind: PartyNoteKind; readonly name: string }
  | { readonly type: 'party_refused'; readonly reason: PartyRefusal; readonly name: string | null }
  | { readonly type: 'party_said'; readonly line: ChatLine };

function text(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value !== '' && value.length <= limit ? value : null;
}

function whole(value: unknown, low: number, high: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high ? value : null;
}

function instant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const at: number = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function known<T extends string>(list: readonly T[], value: unknown): T | null {
  return list.find((entry: T): boolean => entry === value) ?? null;
}

function readLevel(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return whole(value, 1, PARTY_LIMITS.level) ?? undefined;
}

function readZone(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return text(value, PARTY_LIMITS.zoneChars) ?? undefined;
}

export function readPartyMember(value: unknown): PartyMember | null {
  if (!isFields(value)) return null;
  const name: string | null = text(value['name'], PARTY_LIMITS.nameChars);
  const leader: unknown = value['leader'];
  const online: unknown = value['online'];
  const you: unknown = value['you'];
  const zone: string | null | undefined = readZone(value['zone']);
  const level: number | null | undefined = readLevel(value['level']);
  if (name === null || typeof leader !== 'boolean' || typeof online !== 'boolean' || typeof you !== 'boolean' || zone === undefined || level === undefined) return null;
  return { name, leader, online, you, zone, level };
}

function readMembers(value: unknown): readonly PartyMember[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  if (list.length > PARTY_LIMITS.size) return null;
  const members: PartyMember[] = [];
  for (const entry of list) {
    const member: PartyMember | null = readPartyMember(entry);
    if (member === null) return null;
    members.push(member);
  }
  return members;
}

export type LineReader = (value: unknown) => ChatLine | null;

export function readPartyFrame(source: Fields, readLine: LineReader): PartyFrame | null {
  switch (source['type']) {
    case 'party_state': {
      const members: readonly PartyMember[] | null = readMembers(source['members']);
      return members === null ? null : { type: 'party_state', members };
    }
    case 'party_invited': {
      const id: number | null = whole(source['id'], 0, PARTY_LIMITS.id);
      const from: string | null = text(source['from'], PARTY_LIMITS.nameChars);
      const level: number | null | undefined = readLevel(source['level']);
      const expiresAt: number | null = instant(source['expiresAt']);
      return id === null || from === null || level === undefined || expiresAt === null ? null : { type: 'party_invited', id, from, level, expiresAt };
    }
    case 'party_note': {
      const kind: PartyNoteKind | null = known(PARTY_NOTES, source['kind']);
      const name: string | null = text(source['name'], PARTY_LIMITS.nameChars);
      return kind === null || name === null ? null : { type: 'party_note', kind, name };
    }
    case 'party_refused': {
      const reason: PartyRefusal | null = known(PARTY_REFUSALS, source['reason']);
      const raw: unknown = source['name'];
      const name: string | null = raw === null || raw === undefined ? null : text(raw, PARTY_LIMITS.nameChars);
      return reason === null || (raw !== null && raw !== undefined && name === null) ? null : { type: 'party_refused', reason, name };
    }
    case 'party_said': {
      const line: ChatLine | null = readLine(source['line']);
      return line === null ? null : { type: 'party_said', line };
    }
    default:
      return null;
  }
}

export function partyInviteFrame(to: string): string {
  return JSON.stringify({ type: 'party_invite', to });
}

export function partyAnswerFrame(id: number, accept: boolean): string {
  return JSON.stringify({ type: 'party_answer', id, accept });
}

export function partyLeaveFrame(): string {
  return JSON.stringify({ type: 'party_leave' });
}

export function partyKickFrame(name: string): string {
  return JSON.stringify({ type: 'party_kick', name });
}

export function partyLeadFrame(name: string): string {
  return JSON.stringify({ type: 'party_lead', name });
}

export function partySayFrame(said: string): string {
  return JSON.stringify({ type: 'party_say', text: said });
}

export function partyWhereFrame(zone: string, level: number): string {
  return JSON.stringify({ type: 'party_where', zone: zone.slice(0, PARTY_LIMITS.zoneChars), level: Math.min(PARTY_LIMITS.level, Math.max(1, Math.floor(level))) });
}
