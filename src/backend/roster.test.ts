import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeSlot, credentialOf, firstSlot, forAccount, hasRoom, initialRoster, needsList, readRoster, reconcile, ROSTER, serializeRoster, sessionOf } from './roster.ts';
import type { Roster, ServerRoster, Slot } from './roster.ts';

function slot(key: string, id: string | null, name: string | null, legacy: boolean = false): Slot {
  return { key, id, legacy, name, hero: null, level: null };
}

function server(ids: readonly string[], defaultId: string): ServerRoster {
  return { characters: ids.map((id: string): ServerRoster['characters'][number] => ({ id, name: `Name ${id}`, hero: 'man', level: 2 })), max: ROSTER.max, defaultId, username: null };
}

const never = (): boolean => false;

void test('a fresh device has one legacy character that uses the plain token', (): void => {
  const roster: Roster = initialRoster();
  assert.equal(credentialOf('tok', activeSlot(roster)), 'tok');
  assert.equal(needsList(roster), false);
  assert.equal(hasRoom(roster), true);
});

void test('a bound character adds its id to the session, an unbound one adds its key so the server never mistakes it for another', (): void => {
  assert.equal(credentialOf('tok', slot('a', 'acc-2', 'A')), 'tok.acc-2');
  assert.equal(credentialOf('tok', slot('c1', null, 'B')), 'tok.c1');
  assert.equal(sessionOf('tok.acc-2'), 'tok');
  assert.equal(sessionOf('tok'), 'tok');
});

void test('a stored roster survives a round trip and anything malformed reads as no roster', (): void => {
  const roster: Roster = { active: 'c1', account: 'acc-1', slots: [firstSlot(), slot('c1', 'acc-2', 'Bright Reed')] };
  assert.deepEqual(readRoster(serializeRoster(roster)), roster);
  for (const broken of ['nope', '{}', JSON.stringify({ ...roster, active: 'missing' }), JSON.stringify({ ...roster, slots: [] }), JSON.stringify({ ...roster, slots: [firstSlot(), firstSlot()] }), JSON.stringify({ ...roster, slots: [{ ...firstSlot(), key: 'bad key' }] })]) {
    assert.equal(readRoster(broken), null, broken);
  }
  assert.equal(readRoster(null), null);
});

void test('a device that signs in to a different account forgets the old ids and keeps its first character as the legacy one', (): void => {
  const roster: Roster = { active: ROSTER.firstKey, account: 'acc-1', slots: [{ ...firstSlot(), legacy: false, id: 'acc-1' }, slot('c1', 'acc-2', 'B')] };
  const moved: Roster = forAccount(roster, 'acc-9');
  assert.deepEqual(
    moved.slots.map((each: Slot): [string | null, boolean] => [each.id, each.legacy]),
    [
      [null, true],
      [null, false],
    ],
  );
  assert.equal(forAccount({ ...roster, account: null }, 'acc-1').slots[1]?.id, 'acc-2');
});

void test('the legacy character binds to the server default, unknown server characters are added, and the list follows the server order', (): void => {
  const roster: Roster = initialRoster();
  const { roster: next, dropped } = reconcile(roster, server(['acc-1', 'acc-2'], 'acc-1'), never, null);
  assert.deepEqual(dropped, []);
  assert.deepEqual(
    next.slots.map((each: Slot): string | null => each.id),
    ['acc-1', 'acc-2'],
  );
  assert.equal(next.slots[0]?.name, 'Name acc-1');
  assert.equal(next.active, ROSTER.firstKey);
});

void test('a character gone from the server is dropped unless it has changes not yet sent, and then it waits on the device to be made again', (): void => {
  const roster: Roster = { active: 'a', account: 'acc-1', slots: [slot('a', 'acc-1', 'A'), slot('b', 'acc-2', 'B'), slot('c', 'acc-3', 'C')] };
  const { roster: next, dropped } = reconcile(roster, server(['acc-1'], 'acc-1'), (key: string): boolean => key === 'c', null);
  assert.deepEqual(dropped, ['b']);
  assert.deepEqual(
    next.slots.map((each: Slot): string | null => each.id),
    ['acc-1', null],
  );
});

void test('the character in play is never dropped while it is being played, only at the next load', (): void => {
  const roster: Roster = { active: 'b', account: 'acc-1', slots: [slot('a', 'acc-1', 'A'), slot('b', 'acc-2', 'B')] };
  const { roster: next, dropped } = reconcile(roster, server(['acc-1'], 'acc-1'), never, 'b');
  assert.deepEqual(dropped, []);
  assert.equal(next.active, 'b');
  assert.equal(activeSlot(next).id, 'acc-2');
  assert.deepEqual(reconcile(roster, server(['acc-1'], 'acc-1'), never, null).dropped, ['b']);
});

void test('the account default is kept even before the server lists it, since it has no name or save yet', (): void => {
  const roster: Roster = { active: 'a', account: 'acc-1', slots: [slot('a', 'acc-1', null), slot('b', null, 'B')] };
  const { roster: next, dropped } = reconcile(roster, server([], 'acc-1'), never, null);
  assert.deepEqual(dropped, []);
  assert.deepEqual(
    next.slots.map((each: Slot): string | null => each.id),
    ['acc-1', null],
  );
});

void test('server characters whose ids look alike after cleaning still get keys of their own, and long names are cut to fit', (): void => {
  const long: string = 'x'.repeat(ROSTER.nameChars + 10);
  const listed: ServerRoster = { characters: [{ id: 'acc-1', name: 'A', hero: null, level: 1 }, { id: 'acc1', name: long, hero: 'h'.repeat(60), level: 1 }], max: ROSTER.max, defaultId: 'acc-1', username: null };
  const { roster: next } = reconcile({ active: 'first', account: 'acc', slots: [{ ...firstSlot(), legacy: false, id: 'zzz' }] }, listed, (): boolean => true, null);
  assert.equal(new Set(next.slots.map((each: Slot): string => each.key)).size, next.slots.length);
  assert.deepEqual(readRoster(serializeRoster(next)), next);
  assert.equal(next.slots.find((each: Slot): boolean => each.id === 'acc1')?.name?.length, ROSTER.nameChars);
});

void test('a lone character on the account default goes back to the plain token', (): void => {
  const { roster: next } = reconcile({ active: 'a', account: 'acc', slots: [slot('a', 'acc-1', 'A')] }, server(['acc-1'], 'acc-1'), never, null);
  assert.deepEqual(next.slots, [{ key: 'a', id: null, legacy: true, name: 'Name acc-1', hero: 'man', level: 2 }]);
  assert.equal(needsList(next), false);
});

void test('a device that signs in elsewhere makes the character in play the one that meets the account default', (): void => {
  const roster: Roster = { active: 'c1', account: 'acc-1', slots: [{ ...firstSlot(), legacy: false, id: 'acc-1' }, slot('c1', 'acc-2', 'B')] };
  assert.deepEqual(
    forAccount(roster, 'acc-9').slots.map((each: Slot): boolean => each.legacy),
    [false, true],
  );
});
