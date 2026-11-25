import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createMemoryStore, makeSave, storedLocal } from '../../test/backend-support.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { SaveData } from '../../sim/save.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { CloudStash } from './api.ts';
import { createEpochs, SAVE_EPOCH } from './epoch.ts';
import { SAVE_KEY } from './local.ts';
import { parkedKey } from './roster-store.ts';
import { ROSTER_KEY, serializeRoster } from './roster.ts';
import { chooseStash, createDeviceStash, gatherStashes, heldStash, readStashRecord, serializeStashRecord, sharedStash, STASH_KEY } from './shared-stash.ts';
import type { DeviceStash, StashOwner, StashRecord } from './shared-stash.ts';

const OWNER: StashOwner = { account: 'login-1', epoch: SAVE_EPOCH };

function gear(uid: number): ItemInstance {
  const base: string | undefined = [...content.itemBases.values()].find((candidate): boolean => candidate.slot !== null)?.id;
  const rarity: string | undefined = content.rarities[0]?.id;
  assert.ok(base !== undefined && rarity !== undefined);
  const item: ItemInstance | null = generateItem(content, createRng(uid), uid, 1, base, rarity);
  assert.ok(item !== null);
  return item;
}

function stashing(items: readonly (ItemInstance | null)[]): SaveData {
  const save: SaveData = makeSave(2, 0);
  return { ...save, stash: save.stash.map((entry: ItemInstance | null, index: number): ItemInstance | null => items[index] ?? entry) };
}

function record(revision: number | null, items: readonly (ItemInstance | null)[] = [gear(1)]): StashRecord {
  return { items, account: OWNER.account, epoch: OWNER.epoch, revision };
}

function cloud(revision: number, items: readonly (ItemInstance | null)[] = [gear(2)]): CloudStash {
  return { items, revision };
}

function uids(items: readonly (ItemInstance | null)[]): readonly (number | null)[] {
  return items.filter((item: ItemInstance | null): boolean => item !== null).map((item: ItemInstance | null): number | null => item?.uid ?? null);
}

void test('a stash record reads back as it was written, and anything else reads as none', (): void => {
  const kept: StashRecord = record(3, [gear(1), null]);
  assert.deepEqual(readStashRecord(content, serializeStashRecord(kept)), kept);
  assert.equal(readStashRecord(content, null), null);
  assert.equal(readStashRecord(content, 'not json'), null);
  assert.equal(readStashRecord(content, JSON.stringify({ items: [], account: 4, epoch: null, revision: null })), null);
  assert.equal(readStashRecord(content, JSON.stringify({ items: [], account: null, epoch: null, revision: -1 })), null);
});

void test('the device stash wins only when it comes from the revision the cloud still has', (): void => {
  assert.equal(chooseStash(record(4), cloud(4), OWNER), 'device');
  assert.equal(chooseStash(record(4), cloud(5), OWNER), 'cloud');
  assert.equal(chooseStash(record(null), cloud(3), OWNER), 'cloud');
  assert.equal(chooseStash(null, cloud(0), OWNER), 'cloud');
  assert.equal(chooseStash({ ...record(4), account: 'login-2' }, cloud(4), OWNER), 'cloud');
  assert.equal(chooseStash({ ...record(4), epoch: OWNER.epoch - 1 }, cloud(4), OWNER), 'cloud');
});

void test('the shared stash taken from the cloud carries its revision and owner', (): void => {
  assert.deepEqual(sharedStash(record(1), cloud(2, [gear(7)]), OWNER), { items: [gear(7)], account: OWNER.account, epoch: OWNER.epoch, revision: 2 });
  const device: StashRecord = record(2);
  assert.equal(sharedStash(device, cloud(2), OWNER), device);
});

void test('a device stash never shared with a server is kept over a login that has shared none, and takes its owner', (): void => {
  const offline: StashRecord = { items: [gear(8)], account: null, epoch: null, revision: null };
  assert.equal(chooseStash(offline, cloud(0), OWNER), 'device');
  assert.deepEqual(sharedStash(offline, cloud(0), OWNER), { items: [gear(8)], account: OWNER.account, epoch: OWNER.epoch, revision: 0 });
});

void test('away from the cloud the device stash is used only for the account that agreed it with a server', (): void => {
  assert.deepEqual(heldStash(record(3), OWNER.account), { owner: OWNER, items: record(3).items });
  assert.equal(heldStash(record(null), OWNER.account), null);
  assert.equal(heldStash(record(3), 'login-2'), null);
  assert.equal(heldStash(record(3), null), null);
  assert.equal(heldStash(null, OWNER.account), null);
});

void test('agreeing raises the revision for the same account, and a later lower answer leaves it', (): void => {
  const store = createMemoryStore();
  const device: DeviceStash = createDeviceStash(content, store, createEpochs(SAVE_EPOCH));
  device.adopt(record(2));
  const sent: readonly (ItemInstance | null)[] = record(2).items;
  device.agree(OWNER, 5, sent);
  assert.equal(device.read()?.revision, 5);
  device.agree(OWNER, 4, sent);
  assert.equal(device.read()?.revision, 5);
  device.agree({ ...OWNER, account: 'login-2' }, 9, sent);
  assert.equal(device.read()?.revision, 5);
  device.agree({ ...OWNER, epoch: OWNER.epoch + 1 }, 1, sent);
  assert.deepEqual(device.read(), { ...record(1), epoch: OWNER.epoch + 1 });
});

void test('an answer for a stash this device no longer holds does not raise its revision', (): void => {
  const store = createMemoryStore();
  const device: DeviceStash = createDeviceStash(content, store, createEpochs(SAVE_EPOCH));
  device.adopt(record(2, [gear(1)]));
  device.agree(OWNER, 3, [gear(6)]);
  assert.equal(device.read()?.revision, 2);
});

void test('a stash the device could not write is reported', (): void => {
  const store = createMemoryStore();
  const device: DeviceStash = createDeviceStash(content, store, createEpochs(SAVE_EPOCH));
  store.failWrites = true;
  assert.equal(device.keep([gear(3)]), false);
  assert.equal(device.read(), null);
});

void test('keeping new items keeps the owner and revision they come from', (): void => {
  const store = createMemoryStore();
  const device: DeviceStash = createDeviceStash(content, store, createEpochs(SAVE_EPOCH));
  device.keep([gear(3)]);
  assert.deepEqual(device.read(), { items: [gear(3)], account: null, epoch: null, revision: null });
  device.adopt(record(6));
  device.keep([null, gear(4)]);
  assert.deepEqual(device.read(), record(6, [null, gear(4)]));
  assert.ok(store.read(STASH_KEY) !== null);
});

void test('the first shared stash on a device gathers every character stash kept on it', (): void => {
  const store = createMemoryStore();
  store.write(ROSTER_KEY, serializeRoster({ active: 'first', account: null, slots: [{ key: 'first', id: null, legacy: true, name: null, hero: null, level: null }, { key: 'c2', id: null, legacy: false, name: 'Reed', hero: null, level: null }, { key: 'c3', id: null, legacy: false, name: 'Fen', hero: null, level: null }] }));
  store.write(SAVE_KEY, storedLocal(stashing([gear(1), null])));
  store.write(parkedKey(SAVE_KEY, 'c2'), storedLocal(stashing([gear(2), gear(3)])));
  store.write(parkedKey(SAVE_KEY, 'c3'), storedLocal(stashing([gear(4)]), SAVE_EPOCH - 1));
  assert.deepEqual(uids(gatherStashes(content, store, createEpochs(SAVE_EPOCH))), [1, 2, 3]);
});
