import type { Content } from '../content/types.ts';
import { generateItem, slotOf } from '../items.ts';
import { buildNavGrid } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import type { SaveData } from '../save.ts';
import { computeStats, resolveSkillBar } from '../stats.ts';
import { addToInventory } from './character.ts';
import { spawnSurge } from './monsters.ts';
import type { Equipment, ItemInstance, PlayerState, World } from './types.ts';

export interface WorldOptions {
  readonly seed: number;
  readonly save: SaveData | null;
}

const PLAYER_ID: number = 1;

function freshPlayer(content: Content, save: SaveData | null): PlayerState {
  const equipped: Equipment = save === null ? { weapon: null, armour: null, charm: null } : { ...save.equipped };
  const allocated: string[] = save === null ? [] : [...save.allocated];
  const level: number = save?.level ?? 1;
  const stats = computeStats(content, level, equipped, allocated);
  const inventory: (ItemInstance | null)[] = Array.from({ length: content.player.inventorySize }, (_: unknown, index: number): ItemInstance | null => save?.inventory[index] ?? null);
  return {
    kind: 'player',
    id: PLAYER_ID,
    pos: { x: content.arena.playerStart.x, z: content.arena.playerStart.z },
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

export function createWorld(content: Content, options: WorldOptions): World {
  const world: World = {
    content,
    arena: content.arena,
    grid: buildNavGrid(content.arena, content.props, content.player.radius),
    rng: createRng(options.seed),
    time: 0,
    player: freshPlayer(content, options.save),
    monsters: [],
    projectiles: [],
    ground: [],
    nextId: PLAYER_ID + 1,
    nextItemUid: options.save?.nextItemUid ?? 1,
    nextPackId: 1,
    surge: options.save?.surge ?? 1,
    surgeTimer: null,
    events: [],
  };
  if (options.save === null) giveStartingItems(world);
  spawnSurge(world);
  world.events = [];
  return world;
}
