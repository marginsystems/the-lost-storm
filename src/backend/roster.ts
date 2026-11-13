import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';

export const ROSTER_KEY: string = 'the-lost-storm.characters.v1';

export const ROSTER: { readonly max: number; readonly firstKey: string; readonly keyChars: number; readonly nameChars: number } = { max: 3, firstKey: 'first', keyChars: 24, nameChars: 32 };

export interface Slot {
  readonly key: string;
  readonly id: string | null;
  readonly legacy: boolean;
  readonly name: string | null;
  readonly hero: string | null;
  readonly level: number | null;
}

export interface Roster {
  readonly active: string;
  readonly account: string | null;
  readonly slots: readonly Slot[];
}

export interface ServerCharacter {
  readonly id: string;
  readonly name: string;
  readonly hero: string | null;
  readonly level: number;
}

export interface ServerRoster {
  readonly characters: readonly ServerCharacter[];
  readonly max: number;
  readonly defaultId: string;
  readonly username: string | null;
}

export interface Reconciled {
  readonly roster: Roster;
  readonly dropped: readonly string[];
}

const KEY_SHAPE: RegExp = /^[A-Za-z0-9_-]+$/;

export function firstSlot(): Slot {
  return { key: ROSTER.firstKey, id: null, legacy: true, name: null, hero: null, level: null };
}

export function initialRoster(): Roster {
  return { active: ROSTER.firstKey, account: null, slots: [firstSlot()] };
}

export function sessionOf(token: string): string {
  const dot: number = token.indexOf('.');
  return dot < 0 ? token : token.slice(0, dot);
}

export function credentialOf(session: string, slot: Slot): string {
  if (slot.id !== null) return `${session}.${slot.id}`;
  return slot.legacy ? session : `${session}.${slot.key}`;
}

export function activeSlot(roster: Roster): Slot {
  return roster.slots.find((slot: Slot): boolean => slot.key === roster.active) ?? roster.slots[0] ?? firstSlot();
}

export function slotByKey(roster: Roster, key: string): Slot | null {
  return roster.slots.find((slot: Slot): boolean => slot.key === key) ?? null;
}

export function hasRoom(roster: Roster): boolean {
  return roster.slots.length < ROSTER.max;
}

export function newKey(random: () => number): string {
  return `c${Math.floor(random() * 2 ** 48).toString(36)}`;
}

function textOrNull(source: Fields, key: string, limit: number): string | null | undefined {
  const value: unknown = source[key];
  if (value === null) return null;
  return typeof value === 'string' && value !== '' && value.length <= limit ? value : undefined;
}

function readSlot(value: unknown): Slot | null {
  if (!isFields(value)) return null;
  const key: unknown = value['key'];
  const legacy: unknown = value['legacy'];
  const level: unknown = value['level'];
  const id: string | null | undefined = textOrNull(value, 'id', ROSTER.nameChars * 2);
  const name: string | null | undefined = textOrNull(value, 'name', ROSTER.nameChars);
  const hero: string | null | undefined = textOrNull(value, 'hero', ROSTER.nameChars);
  if (typeof key !== 'string' || key.length > ROSTER.keyChars || !KEY_SHAPE.test(key) || typeof legacy !== 'boolean') return null;
  if (id === undefined || name === undefined || hero === undefined) return null;
  if (level !== null && (typeof level !== 'number' || !Number.isSafeInteger(level) || level < 1)) return null;
  return { key, id, legacy, name, hero, level };
}

export function readRoster(text: string | null): Roster | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isFields(parsed) || !Array.isArray(parsed['slots'])) return null;
  const list: readonly unknown[] = parsed['slots'];
  const slots: (Slot | null)[] = list.map(readSlot);
  const active: unknown = parsed['active'];
  const account: string | null | undefined = textOrNull(parsed, 'account', ROSTER.nameChars * 4);
  if (slots.length === 0 || slots.some((slot: Slot | null): boolean => slot === null) || typeof active !== 'string' || account === undefined) return null;
  const kept: readonly Slot[] = slots.filter((slot: Slot | null): slot is Slot => slot !== null);
  if (new Set(kept.map((slot: Slot): string => slot.key)).size !== kept.length) return null;
  if (!kept.some((slot: Slot): boolean => slot.key === active)) return null;
  return { active, account, slots: kept };
}

export function serializeRoster(roster: Roster): string {
  return JSON.stringify(roster);
}

export function needsList(roster: Roster): boolean {
  return roster.slots.length > 1 || roster.slots.some((slot: Slot): boolean => !slot.legacy);
}

export function replaceSlot(roster: Roster, next: Slot): Roster {
  return { ...roster, slots: roster.slots.map((slot: Slot): Slot => (slot.key === next.key ? next : slot)) };
}

export function forAccount(roster: Roster, account: string): Roster {
  if (roster.account === account) return roster;
  if (roster.account === null) return { ...roster, account };
  const first: string | undefined = roster.slots[0]?.key;
  return { ...roster, account, slots: roster.slots.map((slot: Slot): Slot => ({ ...slot, id: null, legacy: slot.key === first })) };
}

export function reconcile(roster: Roster, server: ServerRoster, pending: (key: string) => boolean, fixed: string | null): Reconciled {
  const listed: ReadonlyMap<string, ServerCharacter> = new Map(server.characters.map((character: ServerCharacter): [string, ServerCharacter] => [character.id, character]));
  const dropped: string[] = [];
  const bound: Set<string> = new Set<string>();
  const slots: Slot[] = [];
  for (const slot of roster.slots) {
    const id: string | null = slot.id ?? (slot.legacy ? server.defaultId : null);
    if (id === null) {
      slots.push(slot);
      continue;
    }
    const found: ServerCharacter | undefined = listed.get(id);
    if (found === undefined && slot.id === null) {
      bound.add(id);
      slots.push({ ...slot, id, legacy: false });
      continue;
    }
    if (found === undefined || bound.has(id)) {
      if (slot.key === fixed) slots.push(slot);
      else if (pending(slot.key)) slots.push({ ...slot, id: null, legacy: false });
      else dropped.push(slot.key);
      continue;
    }
    bound.add(id);
    slots.push({ ...slot, id, legacy: false, name: found.name, hero: found.hero ?? slot.hero, level: found.level });
  }
  const added: Slot[] = server.characters
    .filter((character: ServerCharacter): boolean => !bound.has(character.id))
    .map((character: ServerCharacter): Slot => ({ key: `s${character.id.replaceAll(/[^A-Za-z0-9]/g, '').slice(0, ROSTER.keyChars - 1)}`, id: character.id, legacy: false, name: character.name, hero: character.hero, level: character.level }));
  const all: readonly Slot[] = [...slots, ...added.filter((slot: Slot): boolean => !slots.some((kept: Slot): boolean => kept.key === slot.key))];
  const order: ReadonlyMap<string, number> = new Map(server.characters.map((character: ServerCharacter, index: number): [string, number] => [character.id, index]));
  const rank = (slot: Slot): number => (slot.id === null ? order.size : (order.get(slot.id) ?? order.size));
  const sorted: readonly Slot[] = all.toSorted((left: Slot, right: Slot): number => rank(left) - rank(right));
  const kept: readonly Slot[] = sorted.length === 0 ? [firstSlot()] : sorted;
  const active: string = kept.some((slot: Slot): boolean => slot.key === roster.active) ? roster.active : (kept[0]?.key ?? ROSTER.firstKey);
  return { roster: { ...roster, active, slots: kept }, dropped };
}
