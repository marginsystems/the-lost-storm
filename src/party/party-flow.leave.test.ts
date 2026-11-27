import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveListener } from '../backend/live.ts';
import type { PartyFlow } from './party-flow.ts';
import { createPartyFlow, PARTY_FLOW } from './party-flow.ts';
import type { PartyMember } from './party-protocol.ts';

interface Rig {
  readonly flow: PartyFlow;
  readonly notes: string[];
  readonly live: { ready: boolean };
  members(members: readonly PartyMember[]): void;
}

function rig(): Rig {
  const notes: string[] = [];
  const listeners: LiveListener[] = [];
  const live = { ready: true };
  const flow: PartyFlow = createPartyFlow({
    live: {
      canParty: (): boolean => live.ready,
      party: (): boolean => live.ready,
      subscribe: (listener: LiveListener): (() => void) => {
        listeners.push(listener);
        return (): void => undefined;
      },
    },
  });
  flow.onNote((text: string): void => {
    notes.push(text);
  });
  const members = (list: readonly PartyMember[]): void => {
    for (const listener of listeners) listener({ type: 'party', frame: { type: 'party_state', members: list } });
  };
  return { flow, notes, live, members };
}

const PAIR: readonly PartyMember[] = [
  { name: 'Wren', leader: false, online: true, you: true, zone: 'cave_1', level: 4 },
  { name: 'Ash', leader: true, online: true, you: false, zone: 'cave_1', level: 6 },
];

void test('leaving a party tells the one who left', (): void => {
  const r: Rig = rig();
  r.members(PAIR);
  assert.equal(r.flow.leave(), true);
  r.members([]);
  assert.deepEqual(r.notes, [PARTY_FLOW.left]);
});

void test('a leave that is not sent, or sent outside a party, says nothing of leaving', (): void => {
  const r: Rig = rig();
  assert.equal(r.flow.leave(), true);
  r.members(PAIR);
  r.live.ready = false;
  assert.equal(r.flow.leave(), false);
  assert.deepEqual(r.notes, []);
});
