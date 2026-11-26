import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PartyMember } from '../party/party-protocol.ts';
import type { ChatState, ChatStep } from './chat.ts';
import { CHAT_WORDS, command, destination, EMPTY_CHAT, PARTY, readers, receive, speaker } from './chat.ts';
import { parseChat } from './chat-command.ts';

const EVERYONE: ChatState = receive(EMPTY_CHAT, { type: 'welcome', you: 'c1', chat: [] });

const MEMBERS: readonly PartyMember[] = [
  { name: 'Wren', leader: true, online: true, you: true, zone: null, level: null },
  { name: 'Ash', leader: false, online: true, you: false, zone: null, level: null },
];

const IN_PARTY: ChatState = receive(EVERYONE, { type: 'party', frame: { type: 'party_state', members: MEMBERS } });

function typed(state: ChatState, raw: string): ChatStep {
  return command(state, parseChat(raw, state.names));
}

void test('party lines arrive once and name who spoke', (): void => {
  const line = { id: 9, from: 'h1', name: 'Ash', text: 'this way', at: '2026-11-26T10:00:00.000Z', own: false };
  let state: ChatState = receive(IN_PARTY, { type: 'party', frame: { type: 'party_said', line } });
  state = receive(state, { type: 'party', frame: { type: 'party_said', line } });
  assert.equal(state.entries.length, 1);
  const entry = state.entries[0];
  assert.ok(entry !== undefined && entry.kind === 'party');
  assert.equal(speaker(entry), 'Ash');
});

void test('/p sends to the party when in one, and says how to start one otherwise', (): void => {
  assert.deepEqual(typed(IN_PARTY, '/p go').action, { kind: 'party_say', text: 'go' });
  const outside: ChatStep = typed(EVERYONE, '/p go');
  assert.deepEqual(outside.action, { kind: 'none' });
  const last = outside.state.entries.at(-1);
  assert.ok(last !== undefined && last.kind === 'note' && last.text === CHAT_WORDS.noParty);
});

void test('after /p with no text, plain lines go to the party until the party is gone', (): void => {
  const aimed: ChatStep = typed(IN_PARTY, '/p');
  assert.deepEqual(aimed.state.target, PARTY);
  assert.equal(aimed.keepOpen, true);
  assert.equal(readers(aimed.state), 'Only your party reads this.');
  assert.equal(destination(aimed.state.target), 'To Party');
  assert.deepEqual(typed(aimed.state, 'hello').action, { kind: 'party_say', text: 'hello' });
  const left: ChatState = receive(aimed.state, { type: 'party', frame: { type: 'party_state', members: [] } });
  assert.equal(left.party, false);
  assert.deepEqual(left.target, { kind: 'general' });
});

void test('invite, kick, lead and leave become party actions', (): void => {
  assert.deepEqual(typed(EVERYONE, '/invite Ash').action, { kind: 'party_invite', name: 'Ash' });
  assert.deepEqual(typed(IN_PARTY, '/kick Ash').action, { kind: 'party_kick', name: 'Ash' });
  assert.deepEqual(typed(IN_PARTY, '/lead Ash').action, { kind: 'party_lead', name: 'Ash' });
  assert.deepEqual(typed(IN_PARTY, '/leave').action, { kind: 'party_leave' });
  assert.deepEqual(typed(EVERYONE, '/leave').action, { kind: 'none' });
  const named = typed(EVERYONE, '/invite').state.entries.at(-1);
  assert.ok(named !== undefined && named.kind === 'note' && named.text === 'Name a player: /invite name');
});
