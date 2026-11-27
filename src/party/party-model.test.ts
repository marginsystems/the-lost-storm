import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PartyState } from './party-model.ts';
import { answered, expireInvites, firstInvite, invitedText, leads, NO_PARTY, noteText, othersOf, partyStanding, partyStep, refusalText } from './party-model.ts';
import type { PartyMember } from './party-protocol.ts';

function member(name: string, leader: boolean, you: boolean): PartyMember {
  return { name, leader, online: true, you, zone: 'cave_1', level: 10 };
}

const LED: PartyState = { members: [member('Wren', true, true), member('Ash', false, false)], invites: [] };
const FOLLOWING: PartyState = { members: [member('Wren', false, true), member('Ash', true, false)], invites: [] };

void test('a player outside a party or leading one with room can invite, and others are told why not', (): void => {
  assert.equal(partyStanding(NO_PARTY, true, 'Bo'), 'ready');
  assert.equal(partyStanding(LED, true, 'Bo'), 'ready');
  assert.equal(partyStanding(LED, true, 'ash'), 'member');
  assert.equal(partyStanding(FOLLOWING, true, 'Bo'), 'not_leader');
  assert.equal(partyStanding(LED, false, 'Bo'), 'unsupported');
  const full: PartyState = { members: [...LED.members, member('Bo', false, false), member('Kit', false, false)], invites: [] };
  assert.equal(partyStanding(full, true, 'Rae'), 'full');
});

void test('the party frame shows the other members, and the leader is known', (): void => {
  assert.deepEqual(
    othersOf(LED).map((shown: PartyMember): string => shown.name),
    ['Ash'],
  );
  assert.equal(leads(LED), true);
  assert.equal(leads(FOLLOWING), false);
});

void test('invites are kept one per inviter, answered or run out, and joining a party clears them', (): void => {
  let state: PartyState = partyStep(NO_PARTY, { type: 'party_invited', id: 1, from: 'Ash', level: 9, expiresAt: 1000 }).state;
  state = partyStep(state, { type: 'party_invited', id: 2, from: 'Bo', level: null, expiresAt: 2000 }).state;
  state = partyStep(state, { type: 'party_invited', id: 3, from: 'ash', level: 9, expiresAt: 3000 }).state;
  assert.deepEqual(
    state.invites.map((invite): number => invite.id),
    [2, 3],
  );
  assert.equal(firstInvite(state)?.from, 'Bo');
  assert.deepEqual(
    expireInvites(state, 2000).invites.map((invite): number => invite.id),
    [3],
  );
  assert.deepEqual(
    answered(state, 2).invites.map((invite): number => invite.id),
    [3],
  );
  assert.equal(answered(state, 9), state);
  assert.deepEqual(partyStep(state, { type: 'party_state', members: LED.members }).state.invites, []);
  assert.equal(invitedText({ id: 1, from: 'Ash', level: 9, expiresAt: 0 }), 'Ash, level 9, invites you to a party');
});

void test('notes are worded from the player own seat, using the state that came before them', (): void => {
  assert.equal(noteText(LED, 'joined', 'Wren'), 'You joined the party.');
  assert.equal(noteText(LED, 'joined', 'Ash'), 'Ash joined the party.');
  assert.equal(noteText(FOLLOWING, 'lead', 'Wren'), 'You lead the party now.');
  assert.equal(noteText(LED, 'kicked', 'Ash'), 'Ash was removed from the party.');
  assert.equal(noteText(NO_PARTY, 'kicked', 'Wren'), 'You were removed from the party.');
  assert.equal(noteText(NO_PARTY, 'disbanded', 'Ash'), 'Ash is gone, so the party disbanded.');
  assert.equal(noteText(NO_PARTY, 'disbanded', ''), 'The party disbanded.');
  assert.equal(partyStep(LED, { type: 'party_note', kind: 'declined', name: 'Bo' }).note, 'Bo declined your party invite.');
});

void test('every refusal reads as a plain sentence', (): void => {
  assert.equal(refusalText('offline', 'Bo'), 'Bo is not online.');
  assert.equal(refusalText('in_party', 'Bo'), 'Bo is already in a party.');
  assert.equal(refusalText('in_party', null), 'You are already in a party.');
  assert.equal(refusalText('not_leader', null), 'Only the party leader can do that.');
  assert.equal(partyStep(NO_PARTY, { type: 'party_refused', reason: 'full', name: null }).note, 'The party is full.');
});
