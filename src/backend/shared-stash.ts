import type { Content } from '../../sim/content/types.ts';
import { isFields } from '../../sim/content/read.ts';
import { readItemList } from '../../sim/save.ts';
import { mergeStashes } from '../../sim/world/shared-stash.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { CloudStash } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import type { Epochs } from './epoch.ts';
import { readLocalSave, SAVE_KEY } from './local.ts';
import type { LocalCopy } from './local.ts';
import { loadRoster, parkedKey } from './roster-store.ts';
import type { Roster, Slot } from './roster.ts';

export const STASH_KEY: string = 'the-lost-storm.stash.v1';

export interface StashRecord {
  readonly items: readonly (ItemInstance | null)[];
  readonly account: string | null;
  readonly epoch: number | null;
  readonly revision: number | null;
}

export interface StashOwner {
  readonly account: string;
  readonly epoch: number;
}

export type StashSide = 'device' | 'cloud';

export interface DeviceStash {
  read(): StashRecord | null;
  gathered(): (ItemInstance | null)[];
  keep(items: readonly (ItemInstance | null)[]): boolean;
  adopt(record: StashRecord): void;
  agree(owner: StashOwner, revision: number, sent: readonly (ItemInstance | null)[]): void;
}

function wholeOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function readStashRecord(content: Content, text: string | null): StashRecord | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isFields(parsed) || !Array.isArray(parsed['items'])) return null;
  const account: unknown = parsed['account'];
  const epoch: number | null | undefined = wholeOrNull(parsed['epoch']);
  const revision: number | null | undefined = wholeOrNull(parsed['revision']);
  if ((account !== null && typeof account !== 'string') || epoch === undefined || revision === undefined) return null;
  return { items: readItemList(content, parsed['items']), account, epoch, revision };
}

export function serializeStashRecord(record: StashRecord): string {
  return JSON.stringify(record);
}

export function chooseStash(device: StashRecord | null, cloud: CloudStash, owner: StashOwner): StashSide {
  if (device !== null && device.revision === null && cloud.revision === 0) return 'device';
  if (device === null || device.account !== owner.account || device.epoch !== owner.epoch) return 'cloud';
  return device.revision === cloud.revision ? 'device' : 'cloud';
}

export interface HeldStash {
  readonly owner: StashOwner;
  readonly items: readonly (ItemInstance | null)[];
}

export function heldStash(device: StashRecord | null, account: string | null): HeldStash | null {
  if (device === null || device.revision === null || device.epoch === null || account === null || device.account !== account) return null;
  return { owner: { account, epoch: device.epoch }, items: device.items };
}

export function sharedStash(device: StashRecord | null, cloud: CloudStash, owner: StashOwner): StashRecord {
  if (chooseStash(device, cloud, owner) === 'device' && device !== null) {
    const agreed: boolean = device.account === owner.account && device.epoch === owner.epoch && device.revision === cloud.revision;
    return agreed ? device : { items: device.items, account: owner.account, epoch: owner.epoch, revision: cloud.revision };
  }
  return { items: cloud.items, account: owner.account, epoch: owner.epoch, revision: cloud.revision };
}

function stashOf(copy: LocalCopy | null, current: number): readonly (ItemInstance | null)[] {
  return copy === null || copy.epoch < current ? [] : copy.save.stash;
}

export function gatherStashes(content: Content, store: KeyValueStore, epochs: Epochs): (ItemInstance | null)[] {
  const roster: Roster = loadRoster(store);
  const current: number = epochs.current();
  const active: readonly (ItemInstance | null)[] = stashOf(readLocalSave(content, store.read(SAVE_KEY)), current);
  const parked: readonly (readonly (ItemInstance | null)[])[] = roster.slots
    .filter((slot: Slot): boolean => slot.key !== roster.active)
    .map((slot: Slot): readonly (ItemInstance | null)[] => stashOf(readLocalSave(content, store.read(parkedKey(SAVE_KEY, slot.key))), current));
  return mergeStashes([active, ...parked]);
}

export function createDeviceStash(content: Content, store: KeyValueStore, epochs: Epochs): DeviceStash {
  const read = (): StashRecord | null => readStashRecord(content, store.read(STASH_KEY));
  const write = (record: StashRecord): boolean => store.write(STASH_KEY, serializeStashRecord(record));
  return {
    read,
    gathered: (): (ItemInstance | null)[] => gatherStashes(content, store, epochs),
    keep(items: readonly (ItemInstance | null)[]): boolean {
      const held: StashRecord | null = read();
      return write({ items, account: held?.account ?? null, epoch: held?.epoch ?? null, revision: held?.revision ?? null });
    },
    adopt(record: StashRecord): void {
      write(record);
    },
    agree(owner: StashOwner, revision: number, sent: readonly (ItemInstance | null)[]): void {
      const held: StashRecord | null = read();
      if (held === null || held.account !== owner.account) return;
      if (JSON.stringify(held.items) !== JSON.stringify(readItemList(content, sent))) return;
      const raised: boolean = held.epoch !== owner.epoch || held.revision === null || revision > held.revision;
      if (raised) write({ ...held, epoch: owner.epoch, revision });
    },
  };
}
