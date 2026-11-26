import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLine } from '../backend/live-protocol.ts';
import type { PartyFrame } from './party-protocol.ts';
import { PARTY_LIMITS, partyAnswerFrame, partyInviteFrame, partyKickFrame, partyLeadFrame, partyLeaveFrame, partySayFrame, partyWhereFrame, readPartyFrame } from './party-protocol.ts';

function read(source: Readonly<Record<string, unknown>>): PartyFrame | null {
  return readPartyFrame(source, readLine);
}

const ASH: Readonly<Record<string, unknown>> = { name: 'Ash', leader: true, online: true, you: false, zone: 'cave_1', level: 12 };
const WREN: Readonly<Record<string, unknown>> = { name: 'Wren', leader: false, online: false, you: true, zone: null, level: null };

void test('a party state is read member by member, and one bad member drops the frame', (): void => {
  assert.deepEqual(read({ type: 'party_state', members: [ASH, WREN] }), { type: 'party_state', members: [ASH, WREN] });
  assert.deepEqual(read({ type: 'party_state', members: [] }), { type: 'party_state', members: [] });
  assert.equal(read({ type: 'party_state', members: [ASH, { ...WREN, leader: 'yes' }] }), null);
  assert.equal(read({ type: 'party_state', members: [ASH, { ...WREN, level: 0 }] }), null);
  assert.equal(read({ type: 'party_state', members: Array.from({ length: PARTY_LIMITS.size + 1 }, (): unknown => ASH) }), null);
});

void test('an invite carries its id, inviter, level and an expiry time', (): void => {
  const at: string = '2026-11-26T10:00:00.000Z';
  assert.deepEqual(read({ type: 'party_invited', id: 7, from: 'Ash', level: 12, expiresAt: at }), { type: 'party_invited', id: 7, from: 'Ash', level: 12, expiresAt: Date.parse(at) });
  assert.deepEqual(read({ type: 'party_invited', id: 7, from: 'Ash', level: null, expiresAt: at }), { type: 'party_invited', id: 7, from: 'Ash', level: null, expiresAt: Date.parse(at) });
  assert.equal(read({ type: 'party_invited', id: -1, from: 'Ash', level: 3, expiresAt: at }), null);
  assert.equal(read({ type: 'party_invited', id: 7, from: 'Ash', level: 3, expiresAt: 'soon' }), null);
});

void test('notes, refusals and party lines are read, and unknown kinds are not', (): void => {
  assert.deepEqual(read({ type: 'party_note', kind: 'joined', name: 'Ash' }), { type: 'party_note', kind: 'joined', name: 'Ash' });
  assert.equal(read({ type: 'party_note', kind: 'waved', name: 'Ash' }), null);
  assert.deepEqual(read({ type: 'party_refused', reason: 'full', name: null }), { type: 'party_refused', reason: 'full', name: null });
  assert.deepEqual(read({ type: 'party_refused', reason: 'offline', name: 'Ash' }), { type: 'party_refused', reason: 'offline', name: 'Ash' });
  assert.equal(read({ type: 'party_refused', reason: 'nope', name: null }), null);
  const line: Readonly<Record<string, unknown>> = { id: 3, from: 'h1', name: 'Ash', text: 'this way', at: '2026-11-26T10:00:00.000Z', own: false };
  assert.deepEqual(read({ type: 'party_said', line }), { type: 'party_said', line });
  assert.equal(read({ type: 'trade_closed', reason: 'expired' }), null);
});

void test('client party frames name the action and clamp the reported level', (): void => {
  assert.deepEqual(JSON.parse(partyInviteFrame('Ash')), { type: 'party_invite', to: 'Ash' });
  assert.deepEqual(JSON.parse(partyAnswerFrame(4, true)), { type: 'party_answer', id: 4, accept: true });
  assert.deepEqual(JSON.parse(partyLeaveFrame()), { type: 'party_leave' });
  assert.deepEqual(JSON.parse(partyKickFrame('Ash')), { type: 'party_kick', name: 'Ash' });
  assert.deepEqual(JSON.parse(partyLeadFrame('Ash')), { type: 'party_lead', name: 'Ash' });
  assert.deepEqual(JSON.parse(partySayFrame('go')), { type: 'party_say', text: 'go' });
  assert.deepEqual(JSON.parse(partyWhereFrame('cave_1', 12.7)), { type: 'party_where', zone: 'cave_1', level: 12 });
  assert.deepEqual(JSON.parse(partyWhereFrame('cave_1', 0)), { type: 'party_where', zone: 'cave_1', level: 1 });
});
