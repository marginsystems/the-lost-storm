import { isFields } from '../../sim/content/read.ts';
import type { KeyValueStore } from './backend.ts';
import type { CharactersApi, CreateResult, DeleteResult, ListResult } from './characters-api.ts';
import { SAVE_KEY } from './local.ts';
import { activeSlot, credentialOf, firstSlot, forAccount, hasRoom, initialRoster, needsList, newKey, readRoster, reconcile, replaceSlot, ROSTER, ROSTER_KEY, serializeRoster, sessionOf, slotByKey } from './roster.ts';
import type { Reconciled, Roster, ServerCharacter, Slot } from './roster.ts';
import { parseSyncRecord, serializeSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export const ROSTER_STORE: { readonly nameAttempts: number; readonly nameMax: number } = { nameAttempts: 4, nameMax: 16 };

export interface RosterPlace {
  readonly store: KeyValueStore;
  readonly serverUrl: string | null;
  readonly extraKeys: readonly string[];
}

export interface Summary {
  readonly name: string | null;
  readonly hero: string | null;
  readonly level: number | null;
}

export type RemoveOutcome = 'removed' | 'listed' | 'offline';

export type ReconcileMode = 'boot' | 'live';

export function parkedKey(key: string, slot: string): string {
  return `${key}.slot.${slot}`;
}

export function loadRoster(store: KeyValueStore): Roster {
  return readRoster(store.read(ROSTER_KEY)) ?? initialRoster();
}

function keep(store: KeyValueStore, roster: Roster): boolean {
  return store.write(ROSTER_KEY, serializeRoster(roster));
}

function syncRecord(place: RosterPlace): SyncRecord | null {
  return place.serverUrl === null ? null : parseSyncRecord(place.store.read(SYNC_KEY), place.serverUrl);
}

function parkedSync(place: RosterPlace, slot: string): SyncRecord | null {
  return place.serverUrl === null ? null : parseSyncRecord(place.store.read(parkedKey(SYNC_KEY, slot)), place.serverUrl);
}

function movedKeys(place: RosterPlace): readonly string[] {
  return [SAVE_KEY, SYNC_KEY, ...place.extraKeys];
}

export function readSummary(text: string | null): Summary {
  if (text === null) return { name: null, hero: null, level: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { name: null, hero: null, level: null };
  }
  if (!isFields(parsed)) return { name: null, hero: null, level: null };
  const level: unknown = parsed['level'];
  const hero: unknown = parsed['hero'];
  return { name: null, hero: typeof hero === 'string' ? hero : null, level: typeof level === 'number' && Number.isSafeInteger(level) && level >= 1 ? level : null };
}

function pendingOf(place: RosterPlace, roster: Roster, slot: string): boolean {
  const record: SyncRecord | null = slot === roster.active ? syncRecord(place) : parkedSync(place, slot);
  const saveKey: string = slot === roster.active ? SAVE_KEY : parkedKey(SAVE_KEY, slot);
  if (place.store.read(saveKey) === null) return false;
  return record === null || record.pending || record.overwriteCloud;
}

function forget(place: RosterPlace, slot: string): void {
  for (const key of movedKeys(place)) place.store.remove(parkedKey(key, slot));
}

function park(place: RosterPlace, slot: string): boolean {
  for (const key of movedKeys(place)) {
    const value: string | null = place.store.read(key);
    if (value === null) place.store.remove(parkedKey(key, slot));
    else if (!place.store.write(parkedKey(key, slot), value)) return false;
  }
  return true;
}

function unpark(place: RosterPlace, roster: Roster, slot: Slot, account: SyncRecord | null): boolean {
  for (const key of [SAVE_KEY, ...place.extraKeys]) {
    const value: string | null = place.store.read(parkedKey(key, slot.key));
    if (value === null) place.store.remove(key);
    else if (!place.store.write(key, value)) return false;
  }
  if (account !== null) {
    const parked: SyncRecord | null = parkedSync(place, slot.key);
    const token: string = credentialOf(sessionOf(account.token), slot);
    const base: SyncRecord = parked ?? { ...account, revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false };
    if (!place.store.write(SYNC_KEY, serializeSyncRecord({ ...base, serverUrl: account.serverUrl, accountId: account.accountId, token }))) return false;
  }
  forget(place, slot.key);
  return keep(place.store, { ...roster, active: slot.key });
}

function suffixed(place: RosterPlace, roster: Roster): void {
  const record: SyncRecord | null = syncRecord(place);
  if (record === null) return;
  const token: string = credentialOf(sessionOf(record.token), activeSlot(roster));
  if (token !== record.token) place.store.write(SYNC_KEY, serializeSyncRecord({ ...record, token }));
}

function restartParked(place: RosterPlace, roster: Roster, account: SyncRecord): void {
  for (const slot of roster.slots) {
    if (slot.key === roster.active) continue;
    const parked: SyncRecord | null = parkedSync(place, slot.key);
    if (parked === null) continue;
    const pending: boolean = parked.pending || parked.overwriteCloud;
    place.store.write(parkedKey(SYNC_KEY, slot.key), serializeSyncRecord({ ...parked, accountId: account.accountId, token: account.token, revision: 0, updatedAt: null, savedAt: pending ? parked.savedAt : null, pending, overwriteCloud: false }));
  }
}

function afterSignOut(place: RosterPlace, roster: Roster): Roster {
  const active: Slot = activeSlot(roster);
  const kept: Slot[] = [];
  for (const slot of roster.slots) {
    if (slot.key === active.key) continue;
    if (pendingOf(place, roster, slot.key)) kept.push({ ...slot, id: null, legacy: false });
    else forget(place, slot.key);
  }
  const first: Slot = place.store.read(SAVE_KEY) === null ? { ...firstSlot(), key: active.key } : { ...active, id: null, legacy: true };
  return { active: first.key, account: null, slots: [first, ...kept] };
}

export function prepareRoster(place: RosterPlace): Roster {
  const stored: Roster = loadRoster(place.store);
  const record: SyncRecord | null = syncRecord(place);
  let roster: Roster = stored;
  if (place.serverUrl !== null && record === null && stored.account !== null) roster = afterSignOut(place, stored);
  if (record !== null) {
    roster = forAccount(stored, record.accountId);
    if (stored.account !== null && stored.account !== record.accountId) restartParked(place, roster, record);
  }
  keep(place.store, roster);
  suffixed(place, roster);
  return roster;
}

function variant(name: string, attempt: number): string {
  if (attempt === 0) return name;
  const tail: string = String(attempt + 1);
  return `${name.slice(0, ROSTER_STORE.nameMax - tail.length)}${tail}`;
}

async function bind(api: CharactersApi, token: string, name: string, signal: AbortSignal, attempt: number): Promise<ServerCharacter | null> {
  if (attempt >= ROSTER_STORE.nameAttempts) return null;
  const result: CreateResult = await api.create(token, variant(name, attempt), signal);
  if (result.kind === 'ok') return result.character;
  if (result.kind !== 'invalid' || result.reason !== 'name_taken') return null;
  return bind(api, token, name, signal, attempt + 1);
}

async function bindUnbound(api: CharactersApi, token: string, roster: Roster, room: number, from: number, signal: AbortSignal): Promise<Roster> {
  const slot: Slot | undefined = roster.slots[from];
  if (slot === undefined || room <= 0) return roster;
  if (slot.id !== null || slot.legacy || slot.name === null) return bindUnbound(api, token, roster, room, from + 1, signal);
  const made: ServerCharacter | null = await bind(api, token, slot.name, signal, 0);
  const next: Roster = made === null ? roster : replaceSlot(roster, { ...slot, id: made.id, name: made.name });
  return bindUnbound(api, token, next, made === null ? room : room - 1, from + 1, signal);
}

export async function reconcileRoster(place: RosterPlace, api: CharactersApi, signal: AbortSignal, mode: ReconcileMode): Promise<Roster> {
  const before: Roster = mode === 'boot' ? prepareRoster(place) : loadRoster(place.store);
  const record: SyncRecord | null = syncRecord(place);
  if (record === null || (mode === 'boot' && !needsList(before))) return before;
  const listed: ListResult = await api.list(sessionOf(record.token), signal);
  if (listed.kind !== 'ok') return before;
  const fixed: string | null = mode === 'live' ? before.active : null;
  const settled: Reconciled = reconcile(loadRoster(place.store), listed.roster, (key: string): boolean => pendingOf(place, before, key), fixed);
  for (const key of settled.dropped) forget(place, key);
  if (settled.dropped.includes(before.active)) {
    place.store.remove(SAVE_KEY);
    for (const extra of place.extraKeys) place.store.remove(extra);
    unpark(place, settled.roster, activeSlot(settled.roster), { ...record, revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false });
  }
  const room: number = listed.roster.max - settled.roster.slots.filter((slot: Slot): boolean => slot.id !== null).length;
  const roster: Roster = await bindUnbound(api, sessionOf(record.token), settled.roster, room, 0, signal);
  keep(place.store, roster);
  if (mode === 'boot') suffixed(place, roster);
  return roster;
}

export function noteActive(place: RosterPlace, summary: Summary): Roster {
  const roster: Roster = loadRoster(place.store);
  const slot: Slot = activeSlot(roster);
  const next: Roster = replaceSlot(roster, { ...slot, name: summary.name ?? slot.name, hero: summary.hero ?? slot.hero, level: summary.level ?? slot.level });
  keep(place.store, next);
  return next;
}

export function switchCharacter(place: RosterPlace, key: string): boolean {
  const roster: Roster = loadRoster(place.store);
  const target: Slot | null = slotByKey(roster, key);
  if (target === null || key === roster.active) return false;
  const account: SyncRecord | null = syncRecord(place);
  if (!park(place, roster.active)) return false;
  return unpark(place, roster, target, account);
}

export function addCharacter(place: RosterPlace, name: string, id: string | null, random: () => number): string | null {
  const roster: Roster = loadRoster(place.store);
  if (!hasRoom(roster)) return null;
  const key: string = newKey(random);
  const slot: Slot = { key, id, legacy: false, name, hero: null, level: null };
  if (!keep(place.store, { ...roster, slots: [...roster.slots, slot] })) return null;
  return switchCharacter(place, key) ? key : null;
}

export async function removeCharacter(place: RosterPlace, key: string, api: CharactersApi | null, signal: AbortSignal): Promise<RemoveOutcome> {
  const roster: Roster = loadRoster(place.store);
  const slot: Slot | null = slotByKey(roster, key);
  if (slot === null) return 'removed';
  const record: SyncRecord | null = syncRecord(place);
  if (slot.id !== null) {
    if (api === null || record === null) return 'offline';
    const result: DeleteResult = await api.remove(sessionOf(record.token), slot.id, signal);
    if (result.kind === 'listed') return 'listed';
    if (result.kind !== 'ok' && result.kind !== 'gone') return 'offline';
  }
  const rest: readonly Slot[] = roster.slots.filter((each: Slot): boolean => each.key !== key);
  if (key !== roster.active) {
    forget(place, key);
    keep(place.store, { ...roster, slots: rest });
    return 'removed';
  }
  const next: Slot = rest[0] ?? { ...firstSlot(), key: newKey(Math.random), legacy: true };
  const remaining: Roster = { ...roster, active: next.key, slots: rest.length === 0 ? [next] : rest };
  place.store.remove(SAVE_KEY);
  for (const extra of place.extraKeys) place.store.remove(extra);
  const fresh: SyncRecord | null = record === null ? null : { ...record, revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false };
  if (fresh !== null) place.store.write(SYNC_KEY, serializeSyncRecord(fresh));
  return unpark(place, remaining, next, fresh) ? 'removed' : 'offline';
}

export function rosterRoom(roster: Roster): number {
  return ROSTER.max - roster.slots.length;
}
