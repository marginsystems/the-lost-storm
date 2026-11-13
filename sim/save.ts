import type { Fields } from './content/read.ts';
import { isFields } from './content/read.ts';
import type { StoryFlags } from './content/story-types.ts';
import type { RetiredZones } from './content/road-types.ts';
import type { Content, ItemSlot } from './content/types.ts';
import { emptyEquipment, generateItem, slotOf } from './items.ts';
import { createRng } from './rng.ts';
import { retireUnworn } from './save-retire.ts';
import { adoptLearned, findNode, reachablePlaces } from './progression.ts';
import type { AdoptedPlaces } from './progression.ts';
import { readBar, readLearned } from './skill-book.ts';
import { grantIds } from './world/learning.ts';
import { flaskCharges } from './world/flasks.ts';
import { glitchToSave } from './world/glitch.ts';
import type { GlitchSave, PathLogSave } from './world/glitch-types.ts';
import { readGlitchSave } from './world/glitch-save.ts';
import { emptyPathLog, pathToSave, readPathLog } from './world/path-log.ts';
import { LEDGER_ID } from './world/ledger.ts';
import { decodeExplored, encodeExplored, exploredSize } from './world/exploration.ts';
import type { Equipment, GroundItem, ItemInstance, RespawnPoint, RolledAffix, VendorStock, World } from './world/types.ts';

export const SAVE_VERSION: number = 6;
const FLAGGED_VERSION: number = 5;
const READABLE_VERSIONS: ReadonlySet<unknown> = new Set<unknown>([1, 2, 3, 4, 5, SAVE_VERSION]);

export interface SaveData {
  readonly version: number;
  readonly level: number;
  readonly xp: number;
  readonly gold: number;
  readonly kills: number;
  readonly skillPoints: number;
  readonly allocated: readonly string[];
  readonly learned: readonly string[];
  readonly grants: readonly string[];
  readonly bar: readonly (string | null)[];
  readonly inventory: readonly (ItemInstance | null)[];
  readonly equipped: Equipment;
  readonly spilled: readonly ItemInstance[];
  readonly surge: number;
  readonly nextItemUid: number;
  readonly zone: string;
  readonly respawn: RespawnPoint;
  readonly visited: readonly string[];
  readonly heard: readonly string[];
  readonly quests: Readonly<Record<string, number>>;
  readonly waypoints: readonly string[];
  readonly explored: Readonly<Record<string, string>>;
  readonly flasks: Readonly<Record<string, number>>;
  readonly stash: readonly (ItemInstance | null)[];
  readonly vendors: Readonly<Record<string, VendorStock>>;
  readonly flags: StoryFlags;
  readonly glitch: GlitchSave;
  readonly path: PathLogSave;
}

interface Worn {
  readonly equipped: Equipment;
  readonly spilled: ItemInstance[];
}

export function copyVendors(vendors: Readonly<Record<string, VendorStock>>): Record<string, VendorStock> {
  return Object.fromEntries(Object.entries(vendors).map(([id, vendor]: [string, VendorStock]): [string, VendorStock] => [id, { stock: [...vendor.stock], buyback: [...vendor.buyback], stale: vendor.stale }]));
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
    learned: [...player.learned],
    grants: [...player.grantsTaken],
    bar: [...player.bar],
    inventory: [...player.inventory],
    equipped: { ...player.equipped },
    spilled: world.ground.flatMap((ground: GroundItem): ItemInstance[] => (ground.kept && ground.content.kind === 'item' ? [ground.content.item] : [])),
    surge: world.surge,
    nextItemUid: world.nextItemUid,
    zone: world.zone.id,
    respawn: world.respawn,
    visited: [...world.visited],
    heard: [...world.heard],
    quests: { ...world.quests },
    waypoints: [...world.waypoints],
    explored: Object.fromEntries(Object.entries(world.explored).map(([zone, cells]: [string, Uint8Array]): [string, string] => [zone, encodeExplored(cells)])),
    flasks: flaskCharges(player.flasks),
    stash: [...world.stash],
    vendors: copyVendors(world.vendors),
    flags: { ...world.flags },
    glitch: glitchToSave(world.glitch),
    path: pathToSave(world.path),
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
  const ledger: unknown = value['ledger'];
  if (uid === null || level === null || typeof base !== 'string' || typeof rarity !== 'string' || !Array.isArray(affixes)) return null;
  if (!content.itemBases.has(base) || !content.rarities.some((candidate): boolean => candidate.id === rarity)) return null;
  const list: readonly unknown[] = affixes;
  const rolled: RolledAffix[] = list.map((entry: unknown): RolledAffix | null => readAffix(content, entry)).filter((entry: RolledAffix | null): entry is RolledAffix => entry !== null);
  const minted: string | null = typeof ledger === 'string' && LEDGER_ID.test(ledger) ? ledger : null;
  if (rolled.length === list.length) return { uid, base, rarity, level, affixes: rolled, ledger: minted };
  const fresh: ItemInstance | null = generateItem(content, createRng(uid), uid, level, base, rarity);
  return { uid, base, rarity, level, affixes: fresh === null ? rolled : fresh.affixes, ledger: null };
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

interface Dressed {
  readonly flags: StoryFlags;
  readonly nextItemUid: number;
}

function dressOnce(content: Content, equipped: Equipment, flags: StoryFlags, nextItemUid: number): Dressed {
  if (flags[content.player.dressedFlag] !== undefined) return { flags, nextItemUid };
  const common: string | null = content.rarities[0]?.id ?? null;
  let uid: number = nextItemUid;
  for (const id of content.player.startingItems) {
    const base = content.itemBases.get(id);
    if (base === undefined || base.slot === null || base.wear.length === 0 || equipped[base.slot] !== null) continue;
    const item: ItemInstance | null = generateItem(content, createRng(uid), uid, 1, id, common);
    if (item === null) continue;
    equipped[base.slot] = item;
    uid += 1;
  }
  return { flags: { ...flags, [content.player.dressedFlag]: 'yes' }, nextItemUid: uid };
}

function readRespawn(value: unknown): RespawnPoint {
  if (!isFields(value)) return { type: 'start' };
  const exit: unknown = value['exit'];
  const checkpoint: unknown = value['checkpoint'];
  if (value['type'] === 'exit' && typeof exit === 'string') return { type: 'exit', exit };
  if (value['type'] === 'checkpoint' && typeof checkpoint === 'string') return { type: 'checkpoint', checkpoint };
  if (value['type'] === 'waypoint') return { type: 'waypoint' };
  return { type: 'start' };
}

function readVisited(content: Content, value: unknown, zone: string): string[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  const visited: string[] = list.filter((id: unknown): id is string => typeof id === 'string' && content.zones.has(id));
  return visited.includes(zone) ? visited : [...visited, zone];
}

function readHeard(content: Content, value: unknown): string[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  const talks: string[] = [...content.npcs.values()].flatMap((npc): string[] => npc.talks.map((talk): string => talk.id));
  const voices: string[] = [...content.zones.values()].flatMap((zone): string[] => zone.voices.map((voice): string => voice.id));
  const known: Set<string> = new Set<string>([...talks, ...voices]);
  return list.filter((id: unknown): id is string => typeof id === 'string' && known.has(id));
}

function readQuests(content: Content, value: unknown): Record<string, number> {
  const quests: Record<string, number> = {};
  if (!isFields(value)) return quests;
  for (const quest of content.quests.values()) {
    const index: number | null = count(value, quest.id, 0);
    if (index !== null) quests[quest.id] = Math.min(Math.floor(index), quest.objectives.length);
  }
  return quests;
}

function readWaypoints(content: Content, value: unknown): string[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  return list.filter((id: unknown): id is string => typeof id === 'string' && (content.zones.get(id)?.waypoint ?? null) !== null);
}

function readExplored(content: Content, value: unknown): Record<string, string> {
  const explored: Record<string, string> = {};
  if (!isFields(value)) return explored;
  for (const zone of content.zones.values()) {
    const text: unknown = value[zone.id];
    if (typeof text === 'string' && decodeExplored(text, exploredSize(zone)) !== null) explored[zone.id] = text;
  }
  return explored;
}

function readFlasks(content: Content, value: unknown): Record<string, number> {
  const flasks: Record<string, number> = {};
  if (!isFields(value)) return flasks;
  for (const flask of content.flasks) {
    const charges: number | null = count(value, flask.id, 0);
    if (charges !== null) flasks[flask.id] = Math.min(Math.floor(charges), flask.maxCharges);
  }
  return flasks;
}

interface Stashed {
  readonly stash: (ItemInstance | null)[];
  readonly overflow: ItemInstance[];
}

function readStash(content: Content, value: unknown): Stashed {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  const stash: (ItemInstance | null)[] = Array.from({ length: content.trade.stashSize }, (_: unknown, index: number): ItemInstance | null => readItem(content, list[index]));
  const overflow: ItemInstance[] = list
    .slice(content.trade.stashSize)
    .map((entry: unknown): ItemInstance | null => readItem(content, entry))
    .filter((entry: ItemInstance | null): entry is ItemInstance => entry !== null);
  return { stash, overflow };
}

function readItems(content: Content, value: unknown): ItemInstance[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  return list.map((entry: unknown): ItemInstance | null => readItem(content, entry)).filter((entry: ItemInstance | null): entry is ItemInstance => entry !== null);
}

function readVendors(content: Content, value: unknown): Record<string, VendorStock> {
  const vendors: Record<string, VendorStock> = {};
  if (!isFields(value)) return vendors;
  for (const npc of content.npcs.values()) {
    const saved: unknown = value[npc.id];
    if (npc.service !== 'vendor' || !isFields(saved)) continue;
    const stock: unknown = saved['stock'];
    const list: readonly unknown[] = Array.isArray(stock) ? stock : [];
    vendors[npc.id] = {
      stock: Array.from({ length: content.trade.stockSize }, (_: unknown, index: number): ItemInstance | null => readItem(content, list[index])),
      buyback: readItems(content, saved['buyback']).slice(0, content.trade.buybackSize),
      stale: saved['stale'] !== false || !Array.isArray(stock),
    };
  }
  return vendors;
}

function readFlags(content: Content, value: unknown, legacy: boolean): StoryFlags {
  const flags: Record<string, string> = legacy ? { ...content.world.legacyFlags } : {};
  if (!isFields(value)) return flags;
  for (const key of Object.keys(value)) {
    const flag: unknown = value[key];
    if (typeof flag === 'string') flags[key] = flag;
  }
  return flags;
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
  const legacy: boolean = typeof value['version'] !== 'number' || value['version'] < FLAGGED_VERSION;
  const retired: RetiredZones | null = typeof savedZone === 'string' && !known && content.world.retired?.zones.includes(savedZone) === true ? content.world.retired : null;
  const zone: string = typeof savedZone === 'string' && known ? savedZone : retired !== null ? retired.to : legacy ? content.world.town : content.world.start;
  const slots: (ItemInstance | null)[] = Array.from({ length: size }, (_: unknown, index: number): ItemInstance | null => readItem(content, inventoryList[index]));
  const worn: Worn = readEquipped(content, value['equipped'], slots);
  const spilled: unknown = value['spilled'];
  const spilledList: readonly unknown[] = Array.isArray(spilled) ? spilled : [];
  const stashed: Stashed = readStash(content, value['stash']);
  const kept: ItemInstance[] = spilledList.map((entry: unknown): ItemInstance | null => readItem(content, entry)).filter((entry: ItemInstance | null): entry is ItemInstance => entry !== null);
  const reached: number = Math.min(Math.floor(level), content.player.xp.maxLevel);
  const savedBar: unknown = value['bar'];
  const listed: string[] = allocatedList.filter((node: unknown): node is string => typeof node === 'string' && findNode(content, node) !== null);
  const standing: readonly string[] = reachablePlaces(content, listed);
  const adopted: AdoptedPlaces = adoptLearned(content, value['learned'], standing);
  const taken: string[] = [...adopted.allocated];
  const learned: string[] = readLearned(content, value['learned'], taken);
  const dressed: Dressed = dressOnce(content, worn.equipped, { ...readFlags(content, value['flags'], legacy), ...retired?.flags }, Math.floor(nextItemUid));
  return retireUnworn(content, {
    version: SAVE_VERSION,
    level: reached,
    xp,
    gold,
    kills,
    skillPoints: Math.floor(skillPoints) + listed.length - standing.length + adopted.refund,
    allocated: taken,
    learned,
    grants: grantIds(content.chart.grants, value['grants']),
    bar: readBar(content, savedBar, learned),
    inventory: slots,
    equipped: worn.equipped,
    spilled: [...kept, ...worn.spilled, ...stashed.overflow],
    surge: Math.floor(surge),
    nextItemUid: dressed.nextItemUid,
    zone,
    respawn: known ? readRespawn(value['respawn']) : { type: 'start' },
    visited: readVisited(content, value['visited'], zone),
    heard: readHeard(content, value['heard']),
    quests: readQuests(content, value['quests']),
    waypoints: readWaypoints(content, value['waypoints']),
    explored: readExplored(content, value['explored']),
    flasks: readFlasks(content, value['flasks']),
    stash: stashed.stash,
    vendors: readVendors(content, value['vendors']),
    flags: dressed.flags,
    glitch: readGlitchSave(value['glitch']),
    path: value['version'] === SAVE_VERSION ? pathToSave(readPathLog(value['path'], new Set<string>(content.zones.keys()))) : pathToSave(emptyPathLog()),
  });
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
