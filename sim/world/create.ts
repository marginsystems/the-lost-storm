import type { GlitchDef } from '../content/glitches.ts';
import { loadGlitches } from '../content/glitches.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { emptyEquipment, generateItem, slotOf } from '../items.ts';
import { buildNavGrid } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import { defaultBar, startingSkills } from '../skill-book.ts';
import { copyVendors } from '../save.ts';
import type { SaveData } from '../save.ts';
import { computeStats, resolveSkillBar } from '../stats.ts';
import { addToInventory } from './character.ts';
import { createFlasks } from './flasks.ts';
import { decodeExplored, exploredSize, stepExploration } from './exploration.ts';
import { spawnNpcs } from './dialogue.ts';
import { dropOnGround } from './ground.ts';
import { createGlitchState, storyProgress } from './glitch.ts';
import { spawnPacks } from './monsters.ts';
import { startMoments } from './moments.ts';
import { emptyPathLog, markStart, readPathLog } from './path-log.ts';
import { startQuests } from './quests.ts';
import type { Equipment, ItemInstance, PlayerState, RespawnPoint, World } from './types.ts';
import { emptyStash } from './trade.ts';
import { beginVoid } from './wake.ts';
import { placePlayer, respawnExists, startZone } from './zones.ts';

export interface WorldOptions {
  readonly seed: number;
  readonly save: SaveData | null;
  readonly opening?: boolean;
  readonly glitches?: GlitchDef;
}

const PLAYER_ID: number = 1;

function freshPlayer(content: Content, save: SaveData | null): PlayerState {
  const equipped: Equipment = save === null ? emptyEquipment() : { ...save.equipped };
  const allocated: string[] = save === null ? [] : [...save.allocated];
  const level: number = save?.level ?? 1;
  const bar: (string | null)[] = save === null ? defaultBar(content) : [...save.bar];
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
    combo: null,
    root: 0,
    tempo: 1,
    tempoTime: 0,
    brand: null,
    alive: true,
    deadTime: 0,
    moving: false,
    mana: stats.maxMana,
    stats,
    bar,
    skills: resolveSkillBar(content, bar, allocated),
    level,
    xp: save?.xp ?? 0,
    gold: save?.gold ?? 0,
    skillPoints: save?.skillPoints ?? 0,
    allocated,
    learned: save === null ? startingSkills(content) : [...save.learned],
    grantsTaken: save === null ? [] : [...save.grants],
    inventory,
    equipped,
    intent: { type: 'idle' },
    path: [],
    repathTimer: 0,
    queued: null,
    held: [],
    invulnerable: 0,
    strideTravel: 0,
    kills: save?.kills ?? 0,
    flasks: createFlasks(content, save?.flasks ?? null),
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

function savedZone(content: Content, save: SaveData | null, opening: boolean): ZoneDef {
  if (save !== null) return content.zones.get(save.zone) ?? startZone(content);
  const first: ZoneDef | undefined = opening && content.world.opening !== null ? content.zones.get(content.world.opening) : undefined;
  return first ?? startZone(content);
}

function restoreExplored(content: Content, save: SaveData | null): Record<string, Uint8Array> {
  const explored: Record<string, Uint8Array> = {};
  for (const [zoneId, text] of Object.entries(save?.explored ?? {})) {
    const zone: ZoneDef | undefined = content.zones.get(zoneId);
    const cells: Uint8Array | null = zone === undefined ? null : decodeExplored(text, exploredSize(zone));
    if (cells !== null) explored[zoneId] = cells;
  }
  return explored;
}

export function createWorld(content: Content, options: WorldOptions): World {
  const save: SaveData | null = options.save;
  const zone: ZoneDef = savedZone(content, save, options.opening === true);
  const respawn: RespawnPoint = save !== null && save.zone === zone.id && respawnExists(zone, save.respawn) ? save.respawn : { type: 'start' };
  const visited: string[] = save === null ? [] : save.visited.filter((id: string): boolean => content.zones.has(id));
  if (!visited.includes(zone.id)) visited.push(zone.id);
  const world: World = {
    content,
    zone,
    grid: buildNavGrid(zone, content.props, content.surfaces, content.player.radius),
    respawn,
    death: null,
    visited,
    rng: createRng(options.seed),
    time: 0,
    player: freshPlayer(content, save),
    monsters: [],
    spawnedPacks: [],
    npcs: [],
    dialogue: null,
    heard: save === null ? [] : [...save.heard],
    quests: save === null ? {} : { ...save.quests },
    waypoints: save === null ? [] : [...save.waypoints],
    explored: restoreExplored(content, save),
    exploredRevision: 0,
    projectiles: [],
    hazards: [],
    echoes: [],
    areas: [],
    ground: [],
    nextId: PLAYER_ID + 1,
    nextItemUid: save?.nextItemUid ?? 1,
    nextPackId: 1,
    surge: save?.surge ?? 1,
    surgeTimer: null,
    wake: null,
    shift: { x: 0, z: 0 },
    trail: { x: 0, z: 0 },
    heading: { x: 0, z: 1 },
    encounters: [],
    shore: null,
    flags: save === null ? {} : { ...save.flags },
    events: [],
    service: null,
    vendors: save === null ? {} : copyVendors(save.vendors),
    stash: save === null ? emptyStash(content) : [...save.stash],
    tradeZone: zone.id,
    glitch: createGlitchState(options.glitches ?? loadGlitches(), options.seed, save?.glitch ?? null),
    path: save === null ? emptyPathLog() : readPathLog(save.path, new Set<string>(content.zones.keys())),
    moments: [],
    strikeTimer: 0,
    strikeMisses: 0,
  };
  placePlayer(world);
  beginVoid(world, 'first');
  if (save === null && world.zone.void?.emptyHanded !== true) giveStartingItems(world);
  for (const item of save?.spilled ?? []) dropOnGround(world, world.player.pos, { kind: 'item', item }).kept = true;
  startQuests(world);
  spawnNpcs(world);
  spawnPacks(world);
  startMoments(world);
  stepExploration(world);
  world.glitch.progress = storyProgress(world);
  markStart(world);
  world.events = [];
  return world;
}
