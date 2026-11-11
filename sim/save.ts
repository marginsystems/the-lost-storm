import type { Fields } from './content/read.ts';
import { isFields } from './content/read.ts';
import type { Content, ItemSlot } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { findNode } from './progression.ts';
import type { Equipment, ItemInstance, RolledAffix, World } from './world/types.ts';

export const SAVE_VERSION: number = 1;

export interface SaveData {
  readonly version: number;
  readonly level: number;
  readonly xp: number;
  readonly gold: number;
  readonly kills: number;
  readonly skillPoints: number;
  readonly allocated: readonly string[];
  readonly inventory: readonly (ItemInstance | null)[];
  readonly equipped: Equipment;
  readonly surge: number;
  readonly nextItemUid: number;
}

export function toSave(world: World): SaveData {
  const player = world.player;
  return {
    version: SAVE_VERSION,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    kills: player.kills,
    skillPoints: player.skillPoints,
    allocated: [...player.allocated],
    inventory: [...player.inventory],
    equipped: { ...player.equipped },
    surge: world.surge,
    nextItemUid: world.nextItemUid,
  };
}

function count(source: Fields, key: string, min: number): number | null {
  const value: unknown = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) return null;
  return value;
}

function readAffix(content: Content, value: unknown): RolledAffix | null {
  if (!isFields(value)) return null;
  const affix: unknown = value['affix'];
  const rolled: unknown = value['value'];
  if (typeof affix !== 'string' || typeof rolled !== 'number' || !content.affixes.has(affix)) return null;
  return { affix, value: rolled };
}

function readItem(content: Content, value: unknown): ItemInstance | null {
  if (!isFields(value)) return null;
  const uid: number | null = count(value, 'uid', 0);
  const level: number | null = count(value, 'level', 1);
  const base: unknown = value['base'];
  const rarity: unknown = value['rarity'];
  const affixes: unknown = value['affixes'];
  if (uid === null || level === null || typeof base !== 'string' || typeof rarity !== 'string' || !Array.isArray(affixes)) return null;
  if (!content.itemBases.has(base) || !content.rarities.some((candidate): boolean => candidate.id === rarity)) return null;
  const list: readonly unknown[] = affixes;
  const rolled: RolledAffix[] = list.map((entry: unknown): RolledAffix | null => readAffix(content, entry)).filter((entry: RolledAffix | null): entry is RolledAffix => entry !== null);
  return { uid, base, rarity, level, affixes: rolled };
}

function readEquipped(content: Content, value: unknown): Equipment {
  const equipped: Equipment = { weapon: null, armour: null, charm: null };
  if (!isFields(value)) return equipped;
  for (const slot of ITEM_SLOTS) {
    const item: ItemInstance | null = readItem(content, value[slot]);
    const itemSlot: ItemSlot | undefined = item === null ? undefined : content.itemBases.get(item.base)?.slot;
    if (item !== null && itemSlot === slot) equipped[slot] = item;
  }
  return equipped;
}

export function readSave(content: Content, value: unknown): SaveData | null {
  if (!isFields(value) || value['version'] !== SAVE_VERSION) return null;
  const level: number | null = count(value, 'level', 1);
  const xp: number | null = count(value, 'xp', 0);
  const gold: number | null = count(value, 'gold', 0);
  const kills: number | null = count(value, 'kills', 0);
  const skillPoints: number | null = count(value, 'skillPoints', 0);
  const surge: number | null = count(value, 'surge', 1);
  const nextItemUid: number | null = count(value, 'nextItemUid', 1);
  const allocated: unknown = value['allocated'];
  const inventory: unknown = value['inventory'];
  if (level === null || xp === null || gold === null || kills === null || skillPoints === null || surge === null || nextItemUid === null) return null;
  if (!Array.isArray(allocated) || !Array.isArray(inventory)) return null;
  const allocatedList: readonly unknown[] = allocated;
  const inventoryList: readonly unknown[] = inventory;
  const size: number = content.player.inventorySize;
  const slots: (ItemInstance | null)[] = Array.from({ length: size }, (_: unknown, index: number): ItemInstance | null => readItem(content, inventoryList[index]));
  return {
    version: SAVE_VERSION,
    level: Math.min(Math.floor(level), content.player.xp.maxLevel),
    xp,
    gold,
    kills,
    skillPoints: Math.floor(skillPoints),
    allocated: allocatedList.filter((node: unknown): node is string => typeof node === 'string' && findNode(content, node) !== null),
    inventory: slots,
    equipped: readEquipped(content, value['equipped']),
    surge: Math.floor(surge),
    nextItemUid: Math.floor(nextItemUid),
  };
}

export function parseSaveText(content: Content, textValue: string | null): SaveData | null {
  if (textValue === null) return null;
  try {
    const parsed: unknown = JSON.parse(textValue);
    return readSave(content, parsed);
  } catch {
    return null;
  }
}
