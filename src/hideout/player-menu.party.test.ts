import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntryId, MenuEntry, MenuFacts } from './player-menu.ts';
import { actionOf, menuEntries } from './player-menu.ts';

const FACTS: MenuFacts = {
  friend: 'none',
  friendsAvailable: true,
  muted: false,
  blocked: false,
  blocksAvailable: true,
  reportAvailable: true,
  canMessage: true,
  canProfile: true,
  trade: 'ready',
  party: 'ready',
  reported: false,
  busy: new Set<EntryId>(),
};

function partyEntry(facts: MenuFacts): MenuEntry {
  const found: MenuEntry | undefined = menuEntries(facts).find((candidate: MenuEntry): boolean => candidate.id === 'party');
  assert.ok(found !== undefined);
  return found;
}

void test('Invite to party sends an invite only when the player may invite them', (): void => {
  assert.deepEqual(actionOf(partyEntry(FACTS), FACTS), { type: 'invite' });
  for (const party of ['unsupported', 'member', 'not_leader', 'full'] as const) {
    const facts: MenuFacts = { ...FACTS, party };
    assert.equal(actionOf(partyEntry(facts), facts), null, party);
  }
  const blocked: MenuFacts = { ...FACTS, blocked: true };
  assert.equal(actionOf(partyEntry(blocked), blocked), null);
});

void test('the party entry says why it is closed, and a member reads as In your party', (): void => {
  assert.equal(partyEntry({ ...FACTS, party: 'member' }).label, 'In your party');
  assert.equal(partyEntry({ ...FACTS, party: 'not_leader' }).detail, 'Only the leader invites');
  assert.equal(partyEntry({ ...FACTS, party: 'full' }).detail, 'Your party is full');
  assert.equal(partyEntry({ ...FACTS, party: 'unsupported' }).soon, true);
});
