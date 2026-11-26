import type { Live, LiveEvent } from '../backend/live.ts';
import { sayable } from '../backend/live-protocol.ts';
import type { PartyInvite, PartyState, PartyStep } from './party-model.ts';
import { answered, expireInvites, NO_PARTY, partyStep } from './party-model.ts';
import { partyAnswerFrame, partyInviteFrame, partyKickFrame, partyLeadFrame, partyLeaveFrame, partySayFrame, partyWhereFrame } from './party-protocol.ts';

export const PARTY_FLOW = {
  unsent: 'Not connected. Try again in a moment.',
} as const;

export interface PartyFlowOptions {
  readonly live: Pick<Live, 'canParty' | 'party' | 'subscribe'>;
}

export interface PartyFlow {
  state(): PartyState;
  available(): boolean;
  invite(name: string): boolean;
  answer(id: number, accept: boolean): boolean;
  leave(): boolean;
  kick(name: string): boolean;
  lead(name: string): boolean;
  say(text: string): boolean;
  where(zone: string, level: number): void;
  expire(now: number): void;
  subscribe(listener: () => void): () => void;
  onNote(listener: (text: string) => void): () => void;
}

function tell<T>(listeners: ReadonlySet<(value: T) => void>, value: T): void {
  for (const listener of listeners) {
    try {
      listener(value);
    } catch {
      continue;
    }
  }
}

export function createPartyFlow(options: PartyFlowOptions): PartyFlow {
  const { live } = options;
  const listeners: Set<() => void> = new Set<() => void>();
  const noteListeners: Set<(text: string) => void> = new Set<(text: string) => void>();
  let state: PartyState = NO_PARTY;
  let wanted: { readonly zone: string; readonly level: number } | null = null;
  let sentWhere: string | null = null;

  const set = (next: PartyState): void => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        continue;
      }
    }
  };

  const sendWhere = (): void => {
    if (wanted === null || !live.canParty()) return;
    const key: string = `${wanted.zone}|${String(wanted.level)}`;
    if (key === sentWhere) return;
    if (live.party(partyWhereFrame(wanted.zone, wanted.level))) sentWhere = key;
  };

  live.subscribe((event: LiveEvent): void => {
    switch (event.type) {
      case 'welcome':
        sentWhere = null;
        sendWhere();
        return;
      case 'gone':
        sentWhere = null;
        set(NO_PARTY);
        return;
      case 'party': {
        const step: PartyStep = partyStep(state, event.frame);
        set(step.state);
        if (step.note !== null) tell(noteListeners, step.note);
        return;
      }
      case 'present':
      case 'said':
      case 'refused':
      case 'whisper':
      case 'unsent':
      case 'joined':
      case 'left':
      case 'look':
      case 'moves':
      case 'friends':
      case 'trade':
      case 'away':
        return;
    }
  });

  const send = (frame: string): boolean => live.party(frame);

  return {
    state: (): PartyState => state,
    available: (): boolean => live.canParty(),
    invite: (name: string): boolean => send(partyInviteFrame(name)),
    answer(id: number, accept: boolean): boolean {
      const held: PartyInvite | undefined = state.invites.find((invite: PartyInvite): boolean => invite.id === id);
      if (held === undefined) return false;
      if (!send(partyAnswerFrame(id, accept))) {
        tell(noteListeners, PARTY_FLOW.unsent);
        return false;
      }
      set(answered(state, id));
      return true;
    },
    leave: (): boolean => send(partyLeaveFrame()),
    kick: (name: string): boolean => send(partyKickFrame(name)),
    lead: (name: string): boolean => send(partyLeadFrame(name)),
    say(text: string): boolean {
      const line: string | null = sayable(text);
      return line !== null && send(partySayFrame(line));
    },
    where(zone: string, level: number): void {
      if (wanted?.zone === zone && wanted.level === level) return;
      wanted = { zone, level };
      sendWhere();
    },
    expire(now: number): void {
      set(expireInvites(state, now));
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    onNote(listener: (text: string) => void): () => void {
      noteListeners.add(listener);
      return (): void => {
        noteListeners.delete(listener);
      };
    },
  };
}
