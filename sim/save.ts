import type { Fields } from './content/read.ts';
import { isFields } from './content/read.ts';
import type { Content, ItemSlot } from './content/types.ts';
import { emptyEquipment, slotOf } from './items.ts';
import { findNode } from './progression.ts';
import type { Equipment, GroundItem, ItemInstance, RespawnPoint, RolledAffix, World } from './world/types.ts';

export const SAVE_VERSION: number = 2;
const READABLE_VERSIONS: ReadonlySet<unknown> = new Set<unknown>([1, SAVE_VERSION]);

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
  readonly spilled: readonly ItemInstance[];
  readonly surge: number;
  readonly nextItemUid: number;
  readonly zone: string;
  readonly respawn: RespawnPoint;
  readonly visited: readonly string[];
  readonly heard: readonly string[];
}

interface Worn {
  readonly equipped: Equipment;
  readonly spilled: ItemInstance[];
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
    spilled: world.ground.flatMap((ground: GroundItem): ItemInstance[] => (ground.kept && ground.content.kind === 'item' ? [ground.content.item] : [])),
    surge: world.surge,
    nextItemUid: world.nextItemUid,
    zone: world.zone.id,
    respawn: world.respawn,
    visited: [...world.visited],
    heard: [...world.heard],
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

function readEquipped(content: Content, value: unknown, inventory: (ItemInstance | null)[]): Worn {
  const equipped: Equipment = emptyEquipment();
  const spilled: ItemInstance[] = [];
  if (!isFields(value)) return { equipped, spilled };
  const strays: ItemInstance[] = [];
  for (const key of Object.keys(value)) {
    const item: ItemInstance | null = readItem(content, value[key]);
    if (item === null) continue;
    const slot: ItemSlot | null = slotOf(content, item);
    if (slot !== null && slot === key && equipped[slot] === null) equipped[slot] = item;
    else strays.push(item);
  }
  for (const item of strays) {
    const slot: ItemSlot | null = slotOf(content, item);
    const free: number = inventory.indexOf(null);
    if (slot !== null && equipped[slot] === null) equipped[slot] = item;
    else if (free >= 0) inventory[free] = item;
    else spilled.push(item);
  }
  return { equipped, spilled };
}

function readRespawn(value: unknown): RespawnPoint {
  if (!isFields(value)) return { type: 'start' };
  const exit: unknown = value['exit'];
  const checkpoint: unknown = value['checkpoint'];
  if (value['type'] === 'exit' && typeof exit === 'string') return { type: 'exit', exit };
  if (value['type'] === 'checkpoint' && typeof checkpoint === 'string') return { type: 'checkpoint', checkpoint };
  return { type: 'start' };
}

function readVisited(content: Content, value: unknown, zone: string): string[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  const visited: string[] = list.filter((id: unknown): id is string => typeof id === 'string' && content.zones.has(id));
  return visited.includes(zone) ? visited : [...visited, zone];
}

function readHeard(content: Content, value: unknown): string[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  const known: Set<string> = new Set<string>([...content.npcs.values()].flatMap((npc): string[] => npc.talks.map((talk): string => talk.id)));
  return list.filter((id: unknown): id is string => typeof id === 'string' && known.has(id));
}

export function readSave(content: Content, value: unknown): SaveData | null {
  if (!isFields(value) || !READABLE_VERSIONS.has(value['version'])) return null;
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
  const savedZone: unknown = value['zone'];
  const known: boolean = typeof savedZone === 'string' && content.zones.has(savedZone);
  const zone: string = typeof savedZone === 'string' && known ? savedZone : content.world.start;
  const slots: (ItemInstance | null)[] = Array.from({ length: size }, (_: unknown, index: number): ItemInstance | null => readItem(content, inventoryList[index]));
  const worn: Worn = readEquipped(content, value['equipped'], slots);
  const spilled: unknown = value['spilled'];
  const spilledList: readonly unknown[] = Array.isArray(spilled) ? spilled : [];
  const kept: ItemInstance[] = spilledList.map((entry: unknown): ItemInstance | null => readItem(content, entry)).filter((entry: ItemInstance | null): entry is ItemInstance => entry !== null);
  return {
    version: SAVE_VERSION,
    level: Math.min(Math.floor(level), content.player.xp.maxLevel),
    xp,
    gold,
    kills,
    skillPoints: Math.floor(skillPoints),
    allocated: allocatedList.filter((node: unknown): node is string => typeof node === 'string' && findNode(content, node) !== null),
    inventory: slots,
    equipped: worn.equipped,
    spilled: [...kept, ...worn.spilled],
    surge: Math.floor(surge),
    nextItemUid: Math.floor(nextItemUid),
    zone,
    respawn: known ? readRespawn(value['respawn']) : { type: 'start' },
    visited: readVisited(content, value['visited'], zone),
    heard: readHeard(content, value['heard']),
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
