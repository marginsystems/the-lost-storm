import type { MonsterDef, ZoneDef, ZonePack } from '../content/types.ts';
import { momentOfEcho } from './moments.ts';
import type { KeptGround, KeptLive, KeptMonster, KeptSaved, KeptZone, PortalState } from './portal-types.ts';
import { spawnMonster } from './spawn.ts';
import type { GroundItem, MonsterState, World } from './types.ts';

export const PORTAL_KEEP = {
  monsters: 240,
  ground: 64,
  settledAge: 60,
  places: 100,
} as const;

function keptMonster(world: World, monster: MonsterState): boolean {
  return monster.alive && monster.summonerId === null && momentOfEcho(world, monster.id) === null;
}

export function keepLive(world: World): KeptLive {
  return {
    type: 'live',
    monsters: world.monsters.filter((monster: MonsterState): boolean => keptMonster(world, monster)),
    spawnedPacks: [...world.spawnedPacks],
    roused: [...world.roused],
    packReturns: [...world.packReturns],
    rankRun: { ...world.rankRun },
    cachesOpened: [...world.cachesOpened],
    ground: world.ground.filter((ground: GroundItem): boolean => !ground.kept),
  };
}

export function parkZone(world: World): void {
  const portal: PortalState | null = world.portal;
  if (portal === null || portal.zone !== world.zone.id) return;
  portal.kept = keepLive(world);
}

function placed(value: number): number {
  return Math.round(value * PORTAL_KEEP.places) / PORTAL_KEEP.places;
}

function packIndices(zone: ZoneDef, packs: readonly ZonePack[]): number[] {
  return packs.map((pack: ZonePack): number => zone.packs.indexOf(pack)).filter((index: number): boolean => index >= 0);
}

export function keptToSave(zone: ZoneDef, live: KeptLive): KeptSaved {
  return {
    type: 'saved',
    packs: packIndices(zone, live.spawnedPacks),
    roused: packIndices(zone, live.roused),
    monsters: live.monsters.slice(0, PORTAL_KEEP.monsters).map((monster: MonsterState): KeptMonster => ({ monster: monster.def.id, group: monster.packId, level: monster.level, x: placed(monster.pos.x), z: placed(monster.pos.z), life: Math.max(1, Math.round(monster.life)) })),
    caches: [...live.cachesOpened],
    ground: live.ground.slice(0, PORTAL_KEEP.ground).map((ground: GroundItem): KeptGround => ({ x: placed(ground.pos.x), z: placed(ground.pos.z), content: ground.content })),
  };
}

function calm(monster: MonsterState): MonsterState {
  monster.aggro = false;
  monster.path = [];
  monster.action = null;
  monster.foeId = null;
  monster.stance = 'approach';
  return monster;
}

function packsAt(zone: ZoneDef, indices: readonly number[]): ZonePack[] {
  return indices.flatMap((index: number): ZonePack[] => {
    const pack: ZonePack | undefined = zone.packs[index];
    return pack === undefined ? [] : [pack];
  });
}

function restoreSaved(world: World, kept: KeptSaved): void {
  world.spawnedPacks = packsAt(world.zone, kept.packs);
  world.roused = packsAt(world.zone, kept.roused);
  world.cachesOpened = [...kept.caches];
  const groups: Map<number, number> = new Map<number, number>();
  for (const saved of kept.monsters) {
    const def: MonsterDef | undefined = world.content.monsters.get(saved.monster);
    if (def === undefined) continue;
    const packId: number = groups.get(saved.group) ?? world.nextPackId;
    if (!groups.has(saved.group)) {
      groups.set(saved.group, packId);
      world.nextPackId += 1;
    }
    const monster: MonsterState = spawnMonster(world, def, packId, { x: saved.x, z: saved.z }, { summonerId: null, scatter: 0, revived: false, level: saved.level });
    monster.life = Math.min(monster.maxLife, saved.life);
  }
  for (const ground of kept.ground) {
    world.ground.push({ id: world.nextId, pos: { x: ground.x, z: ground.z }, from: { x: ground.x, z: ground.z }, content: ground.content, find: null, age: PORTAL_KEEP.settledAge, kept: false });
    world.nextId += 1;
  }
}

function restoreLive(world: World, kept: KeptLive): void {
  world.spawnedPacks = [...kept.spawnedPacks];
  world.roused = [...kept.roused];
  world.packReturns = [...kept.packReturns];
  world.rankRun = { ...kept.rankRun };
  world.cachesOpened = [...kept.cachesOpened];
  for (const monster of kept.monsters) {
    world.monsters.push(calm(monster));
    world.events.push({ type: 'monster_spawn', monsterId: monster.id });
  }
  world.ground.push(...kept.ground);
}

export function restoreKept(world: World): boolean {
  const portal: PortalState | null = world.portal;
  if (portal === null || portal.zone !== world.zone.id || portal.kept === null) return false;
  const kept: KeptZone = portal.kept;
  portal.kept = null;
  if (kept.type === 'live') restoreLive(world, kept);
  else restoreSaved(world, kept);
  return true;
}
