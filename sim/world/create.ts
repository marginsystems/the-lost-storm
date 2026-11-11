import type { Content, ZoneDef } from '../content/types.ts';
import { emptyEquipment, generateItem, slotOf } from '../items.ts';
import { buildNavGrid } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import type { SaveData } from '../save.ts';
import { computeStats, resolveSkillBar } from '../stats.ts';
import { addToInventory } from './character.ts';
import { spawnNpcs } from './dialogue.ts';
import { dropOnGround } from './ground.ts';
import { spawnPacks } from './monsters.ts';
import type { Equipment, ItemInstance, PlayerState, RespawnPoint, World } from './types.ts';
import { placePlayer, respawnExists, startZone } from './zones.ts';

export interface WorldOptions {
  readonly seed: number;
  readonly save: SaveData | null;
}

const PLAYER_ID: number = 1;

function freshPlayer(content: Content, save: SaveData | null): PlayerState {
  const equipped: Equipment = save === null ? emptyEquipment() : { ...save.equipped };
  const allocated: string[] = save === null ? [] : [...save.allocated];
  const level: number = save?.level ?? 1;
  const stats = computeStats(content, level, equipped, allocated);
  const inventory: (ItemInstance | null)[] = Array.from({ length: content.player.inventorySize }, (_: unknown, index: number): ItemInstance | null => save?.inventory[index] ?? null);
  return {
    kind: 'player',
    id: PLAYER_ID,
    pos: { x: 0, z: 0 },
    facing: Math.PI,
    knock: { x: 0, z: 0 },
    radius: content.player.radius,
    life: stats.maxLife,
    maxLife: stats.maxLife,
    action: null,
    cooldowns: {},
    stagger: 0,
    alive: true,
    deadTime: 0,
    moving: false,
    mana: stats.maxMana,
    stats,
    skills: resolveSkillBar(content, allocated),
    level,
    xp: save?.xp ?? 0,
    gold: save?.gold ?? 0,
    skillPoints: save?.skillPoints ?? 0,
    allocated,
    inventory,
    equipped,
    intent: { type: 'idle' },
    path: [],
    repathTimer: 0,
    queued: null,
    respawnTimer: 0,
    strideTravel: 0,
    kills: save?.kills ?? 0,
  };
}

function giveStartingItems(world: World): void {
  const commonRarity: string | null = world.content.rarities[0]?.id ?? null;
  for (const baseId of world.content.player.startingItems) {
    const item: ItemInstance | null = generateItem(world.content, world.rng, world.nextItemUid, 1, baseId, commonRarity);
    if (item === null) continue;
    world.nextItemUid += 1;
    const slot = slotOf(world.content, item);
    if (slot !== null && world.player.equipped[slot] === null) world.player.equipped[slot] = item;
    else addToInventory(world.player, item);
  }
  world.player.stats = computeStats(world.content, world.player.level, world.player.equipped, world.player.allocated);
}

function savedZone(content: Content, save: SaveData | null): ZoneDef {
  return (save === null ? undefined : content.zones.get(save.zone)) ?? startZone(content);
}

export function createWorld(content: Content, options: WorldOptions): World {
  const save: SaveData | null = options.save;
  const zone: ZoneDef = savedZone(content, save);
  const respawn: RespawnPoint = save !== null && save.zone === zone.id && respawnExists(zone, save.respawn) ? save.respawn : { type: 'start' };
  const visited: string[] = save === null ? [] : save.visited.filter((id: string): boolean => content.zones.has(id));
  if (!visited.includes(zone.id)) visited.push(zone.id);
  const world: World = {
    content,
    zone,
    grid: buildNavGrid(zone, content.props, content.player.radius),
    respawn,
    visited,
    rng: createRng(options.seed),
    time: 0,
    player: freshPlayer(content, save),
    monsters: [],
    npcs: [],
    dialogue: null,
    heard: save === null ? [] : [...save.heard],
    projectiles: [],
    ground: [],
    nextId: PLAYER_ID + 1,
    nextItemUid: save?.nextItemUid ?? 1,
    nextPackId: 1,
    surge: save?.surge ?? 1,
    surgeTimer: null,
    events: [],
  };
  placePlayer(world);
  if (save === null) giveStartingItems(world);
  for (const item of save?.spilled ?? []) dropOnGround(world, world.player.pos, { kind: 'item', item }).kept = true;
  spawnNpcs(world);
  spawnPacks(world);
  world.events = [];
  return world;
}
