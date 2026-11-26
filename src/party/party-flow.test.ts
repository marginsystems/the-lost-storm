import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveEvent, LiveListener } from '../backend/live.ts';
import type { PartyFlow } from './party-flow.ts';
import { createPartyFlow, PARTY_FLOW } from './party-flow.ts';
import type { PartyFrame, PartyMember } from './party-protocol.ts';

interface Rig {
  readonly flow: PartyFlow;
  readonly sent: unknown[];
  readonly notes: string[];
  readonly live: { ready: boolean };
  emit(event: LiveEvent): void;
  frame(frame: PartyFrame): void;
}

function rig(): Rig {
  const sent: unknown[] = [];
  const notes: string[] = [];
  const listeners: LiveListener[] = [];
  const live = { ready: true };
  const flow: PartyFlow = createPartyFlow({
    live: {
      canParty: (): boolean => live.ready,
      party: (frame: string): boolean => {
        if (!live.ready) return false;
        sent.push(JSON.parse(frame));
        return true;
      },
      subscribe: (listener: LiveListener): (() => void) => {
        listeners.push(listener);
        return (): void => undefined;
      },
    },
  });
  flow.onNote((text: string): void => {
    notes.push(text);
  });
  const emit = (event: LiveEvent): void => {
    for (const listener of listeners) listener(event);
  };
  return { flow, sent, notes, live, emit, frame: (frame: PartyFrame): void => emit({ type: 'party', frame }) };
}

const MEMBERS: readonly PartyMember[] = [
  { name: 'Wren', leader: false, online: true, you: true, zone: 'cave_1', level: 4 },
  { name: 'Ash', leader: true, online: true, you: false, zone: 'cave_1', level: 6 },
];

void test('the flow sends party frames only to a server that speaks parties', (): void => {
  const r: Rig = rig();
  assert.equal(r.flow.invite('Ash'), true);
  assert.equal(r.flow.say('  hello  '), true);
  r.live.ready = false;
  assert.equal(r.flow.invite('Bo'), false);
  assert.equal(r.flow.leave(), false);
  assert.deepEqual(r.sent, [
    { type: 'party_invite', to: 'Ash' },
    { type: 'party_say', text: 'hello' },
  ]);
});

void test('where is sent once per change and again after a reconnect', (): void => {
  const r: Rig = rig();
  r.flow.where('cave_1', 4);
  r.flow.where('cave_1', 4);
  r.flow.where('cave_2', 4);
  r.emit({ type: 'welcome', you: 'c1', chat: [] });
  assert.deepEqual(r.sent, [
    { type: 'party_where', zone: 'cave_1', level: 4 },
    { type: 'party_where', zone: 'cave_2', level: 4 },
    { type: 'party_where', zone: 'cave_2', level: 4 },
  ]);
});

void test('an invite is answered once and leaves the card, and notes reach the chat', (): void => {
  const r: Rig = rig();
  r.frame({ type: 'party_invited', id: 5, from: 'Ash', level: 6, expiresAt: 10_000 });
  r.flow.answer(5, true);
  r.flow.answer(5, true);
  assert.deepEqual(r.sent, [{ type: 'party_answer', id: 5, accept: true }]);
  assert.deepEqual(r.flow.state().invites, []);
  r.frame({ type: 'party_state', members: MEMBERS });
  r.frame({ type: 'party_note', kind: 'joined', name: 'Wren' });
  assert.deepEqual(r.notes, ['You joined the party.']);
});

void test('an answer that cannot be sent keeps the invite and says so', (): void => {
  const r: Rig = rig();
  r.frame({ type: 'party_invited', id: 5, from: 'Ash', level: 6, expiresAt: 10_000 });
  r.live.ready = false;
  assert.equal(r.flow.answer(5, true), false);
  assert.deepEqual(r.sent, []);
  assert.equal(r.flow.state().invites.length, 1);
  assert.deepEqual(r.notes, [PARTY_FLOW.unsent]);
  r.live.ready = true;
  assert.equal(r.flow.answer(5, true), true);
  assert.deepEqual(r.flow.state().invites, []);
});

void test('invites run out, and a dropped socket forgets the party until the server says again', (): void => {
  const r: Rig = rig();
  r.frame({ type: 'party_invited', id: 5, from: 'Ash', level: 6, expiresAt: 10_000 });
  r.flow.expire(9_999);
  assert.equal(r.flow.state().invites.length, 1);
  r.flow.expire(10_000);
  assert.equal(r.flow.state().invites.length, 0);
  r.frame({ type: 'party_state', members: MEMBERS });
  r.emit({ type: 'gone' });
  assert.deepEqual(r.flow.state().members, []);
});
