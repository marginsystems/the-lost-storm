import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FriendsList } from '../backend/api.ts';
import type { FriendsState, FriendsStep } from './friends.ts';
import { friendRows, friendsFetched, friendsSummary, NO_FRIENDS, wantFriends } from './friends.ts';

const LIST: FriendsList = {
  friends: [
    { name: 'bram', here: false },
    { name: 'Ash', here: false },
    { name: 'Wren', here: true },
  ],
  incoming: ['Oak'],
  outgoing: ['Fern', 'Elm'],
};

void test('a fetch asked for while one is out is folded into a single fetch after it', (): void => {
  const first: FriendsStep = wantFriends(NO_FRIENDS);
  assert.equal(first.fetch, true);
  const nudged: FriendsStep = wantFriends(first.state);
  assert.equal(nudged.fetch, false);
  const twice: FriendsStep = wantFriends(nudged.state);
  assert.equal(twice.fetch, false);
  const done: FriendsStep = friendsFetched(twice.state, { kind: 'ok', list: LIST });
  assert.equal(done.fetch, true);
  assert.equal(done.state.list, LIST);
  const last: FriendsStep = friendsFetched(done.state, { kind: 'ok', list: LIST });
  assert.equal(last.fetch, false);
  assert.equal(last.state.loading, false);
});

void test('a failed fetch keeps the list it had and an old server hides friends for good', (): void => {
  const loaded: FriendsState = friendsFetched(wantFriends(NO_FRIENDS).state, { kind: 'ok', list: LIST }).state;
  const failed: FriendsState = friendsFetched(wantFriends(loaded).state, { kind: 'failed' }).state;
  assert.equal(failed.list, LIST);
  assert.equal(failed.available, true);
  const gone: FriendsState = friendsFetched(wantFriends(failed).state, { kind: 'unsupported' }).state;
  assert.equal(gone.available, false);
  assert.equal(gone.list, null);
  assert.equal(wantFriends(gone).fetch, false);
});

void test('requests come first, then friends in the Hideout, then the rest, then sent requests', (): void => {
  assert.deepEqual(
    friendRows(LIST).map((row: { readonly key: string }): string => row.key),
    ['incoming:oak', 'friend:wren', 'friend:ash', 'friend:bram', 'outgoing:elm', 'outgoing:fern'],
  );
  assert.deepEqual(friendRows(null), []);
});

void test('the header says who is here and how many are asking', (): void => {
  assert.equal(friendsSummary(LIST), '1 here · 1 request');
  assert.equal(friendsSummary({ friends: [], incoming: ['A', 'B'], outgoing: [] }), '2 requests');
  assert.equal(friendsSummary({ friends: [{ name: 'A', here: false }], incoming: [], outgoing: [] }), '');
  assert.equal(friendsSummary(null), '');
});
