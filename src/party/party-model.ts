import type { PartyFrame, PartyMember, PartyNoteKind, PartyRefusal } from './party-protocol.ts';
import { PARTY_LIMITS } from './party-protocol.ts';

export const PARTY_MODEL = {
  someone: 'They',
} as const;

export interface PartyInvite {
  readonly id: number;
  readonly from: string;
  readonly level: number | null;
  readonly expiresAt: number;
}

export interface PartyState {
  readonly members: readonly PartyMember[];
  readonly invites: readonly PartyInvite[];
}

export const NO_PARTY: PartyState = { members: [], invites: [] };

export type PartyStanding = 'ready' | 'unsupported' | 'member' | 'not_leader' | 'full';

export interface PartyStep {
  readonly state: PartyState;
  readonly note: string | null;
}

function nameKey(name: string): string {
  return name.toLowerCase().replaceAll(/\s+/g, '');
}

export function selfOf(state: PartyState): PartyMember | null {
  return state.members.find((member: PartyMember): boolean => member.you) ?? null;
}

export function othersOf(state: PartyState): readonly PartyMember[] {
  return state.members.filter((member: PartyMember): boolean => !member.you);
}

export function inParty(state: PartyState): boolean {
  return state.members.length > 0;
}

export function leads(state: PartyState): boolean {
  return selfOf(state)?.leader === true;
}

export function memberNamed(state: PartyState, name: string): PartyMember | null {
  const key: string = nameKey(name);
  return state.members.find((member: PartyMember): boolean => nameKey(member.name) === key) ?? null;
}

export function partyStanding(state: PartyState, available: boolean, name: string): PartyStanding {
  if (!available) return 'unsupported';
  if (memberNamed(state, name) !== null) return 'member';
  if (!inParty(state)) return 'ready';
  if (!leads(state)) return 'not_leader';
  return state.members.length >= PARTY_LIMITS.size ? 'full' : 'ready';
}

function isSelf(state: PartyState, name: string): boolean {
  const self: PartyMember | null = selfOf(state);
  return self !== null && nameKey(self.name) === nameKey(name);
}

export function noteText(state: PartyState, kind: PartyNoteKind, name: string): string {
  const self: boolean = isSelf(state, name);
  switch (kind) {
    case 'invited':
      return `Party invite sent to ${name}.`;
    case 'joined':
      return self ? 'You joined the party.' : `${name} joined the party.`;
    case 'left':
      return `${name} left the party.`;
    case 'kicked':
      return self || !inParty(state) ? 'You were removed from the party.' : `${name} was removed from the party.`;
    case 'lead':
      return self ? 'You lead the party now.' : `${name} leads the party now.`;
    case 'declined':
      return `${name} declined your party invite.`;
    case 'expired':
      return `Your party invite to ${name} ran out.`;
    case 'disbanded':
      return 'The party disbanded.';
  }
  return `${name} changed the party.`;
}

export function refusalText(reason: PartyRefusal, name: string | null): string {
  const who: string = name ?? PARTY_MODEL.someone;
  switch (reason) {
    case 'unsupported':
      return name === null ? 'Parties are not available here.' : `${name} cannot join parties yet.`;
    case 'no_such_player':
      return `No one is called ${who}. Put a name with spaces in quotes: /invite "Ash Walker"`;
    case 'offline':
      return `${who} is not online.`;
    case 'self':
      return 'That is you.';
    case 'in_party':
      return name === null ? 'You are already in a party.' : `${name} is already in a party.`;
    case 'full':
      return 'The party is full.';
    case 'not_leader':
      return 'Only the party leader can do that.';
    case 'not_in_party':
      return name === null ? 'You are not in a party.' : `${name} is not in your party.`;
    case 'ignored':
      return `${who} is not taking your invites.`;
    case 'slow_down':
      return 'Too fast. Wait a moment.';
    case 'expired':
      return 'That invite is gone.';
    case 'bad_text':
      return 'That line cannot be sent.';
    case 'name_needed':
      return 'Choose a name first.';
    case 'blocked':
      return 'That line was not sent.';
    case 'pending':
      return `${who} already has your invite.`;
  }
  return 'That did not work.';
}

export function invitedText(invite: PartyInvite): string {
  return invite.level === null ? `${invite.from} invites you to a party` : `${invite.from}, level ${String(invite.level)}, invites you to a party`;
}

function withInvite(state: PartyState, invite: PartyInvite): PartyState {
  const others: readonly PartyInvite[] = state.invites.filter((held: PartyInvite): boolean => held.id !== invite.id && nameKey(held.from) !== nameKey(invite.from));
  return { ...state, invites: [...others, invite].slice(-PARTY_LIMITS.invites) };
}

export function partyStep(state: PartyState, frame: PartyFrame): PartyStep {
  switch (frame.type) {
    case 'party_state':
      return { state: frame.members.length > 0 ? { members: frame.members, invites: [] } : { ...state, members: [] }, note: null };
    case 'party_invited':
      return { state: withInvite(state, { id: frame.id, from: frame.from, level: frame.level, expiresAt: frame.expiresAt }), note: null };
    case 'party_note':
      return { state, note: noteText(state, frame.kind, frame.name) };
    case 'party_refused':
      return { state, note: refusalText(frame.reason, frame.name) };
    case 'party_said':
      return { state, note: null };
  }
  return { state, note: null };
}

export function answered(state: PartyState, id: number): PartyState {
  const invites: readonly PartyInvite[] = state.invites.filter((invite: PartyInvite): boolean => invite.id !== id);
  return invites.length === state.invites.length ? state : { ...state, invites };
}

export function expireInvites(state: PartyState, now: number): PartyState {
  const invites: readonly PartyInvite[] = state.invites.filter((invite: PartyInvite): boolean => invite.expiresAt > now);
  return invites.length === state.invites.length ? state : { ...state, invites };
}

export function firstInvite(state: PartyState): PartyInvite | null {
  return state.invites[0] ?? null;
}
