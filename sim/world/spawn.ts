import type { MonsterDef, ZonePack } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { nearestWalkable, routedGrid } from '../nav/grid.ts';
import type { MonsterScale } from './monster-scale.ts';
import { monsterScale } from './monster-scale.ts';
import type { MonsterState, World } from './types.ts';

export const SPAWN = {
  spawnTime: 0.9,
  spawnScatter: 2.6,
  spawnSnap: 6,
  firstSummon: 0.4,
  summonScatter: 1.8,
} as const;

export interface SpawnOrigin {
  readonly summonerId: number | null;
  readonly scatter: number;
  readonly revived: boolean;
  readonly level: number;
}

export interface LevelSpan {
  readonly least: number;
  readonly most: number;
}

export function areaLevel(world: World): number {
  return Math.max(world.zone.level, Math.min(world.zone.levelUpTo, world.player.level));
}

export function monsterLevel(world: World): number {
  return areaLevel(world) + (world.zone.surge === null ? 0 : world.surge - 1);
}

export function packLevel(world: World, pack: ZonePack): number {
  return pack.level ?? monsterLevel(world);
}

export function levelSpan(world: World): LevelSpan {
  const levels: number[] = world.zone.packs.map((pack: ZonePack): number => packLevel(world, pack));
  if (levels.length === 0) return { least: monsterLevel(world), most: monsterLevel(world) };
  return { least: Math.min(...levels), most: Math.max(...levels) };
}

export function spawnMonster(world: World, def: MonsterDef, packId: number, center: Vec2, origin: SpawnOrigin): MonsterState {
  const level: number = origin.level;
  const scale: MonsterScale = monsterScale(world.content.world.scaling, level);
  const angle: number = world.rng.range(0, Math.PI * 2);
  const reach: number = world.rng.range(0, origin.scatter);
  const wanted: Vec2 = { x: center.x + Math.cos(angle) * reach, z: center.z + Math.sin(angle) * reach };
  const pos: Vec2 = nearestWalkable(routedGrid(world.grid), wanted, SPAWN.spawnSnap) ?? { x: center.x, z: center.z };
  const life: number = def.scalesLife ? Math.round(def.life * scale.life) : def.life;
  const monster: MonsterState = {
    kind: 'monster',
    unison: { seen: false, lookUntil: 0, flinchUntil: 0 },
    recovery: { guard: 0, strain: 0, unbroken: 0, stunned: 0 },
    leech: { at: 0, taken: 0 },
    id: world.nextId,
    def,
    level,
    packId,
    damageMin: def.damageMin * scale.damage,
    damageMax: def.damageMax * scale.damage,
    home: { x: pos.x, z: pos.z },
    strafeSign: world.rng.chance(0.5) ? 1 : -1,
    pos,
    facing: world.rng.range(0, Math.PI * 2),
    knock: { x: 0, z: 0 },
    radius: def.radius * def.scale,
    life,
    maxLife: life,
    action: null,
    cooldowns: {},
    stagger: 0,
    interrupts: 0,
    combo: null,
    root: 0,
    rootGrace: 0,
    brand: null,
    burn: null,
    tempo: 1,
    tempoTime: 0,
    alive: true,
    deadTime: 0,
    moving: false,
    motion: 'still',
    gait: 0,
    aggro: false,
    path: [],
    repathTimer: 0,
    stranded: 0,
    stance: 'approach',
    blindTime: 0,
    stuckTime: 0,
    restTime: 0,
    stalledFor: null,
    calm: 0,
    lastPos: { x: pos.x, z: pos.z },
    lastTravel: 0,
    spawnTime: SPAWN.spawnTime,
    phase: 0,
    nextSkill: null,
    measureStep: 0,
    beatAt: 0,
    sealed: def.behaviour.type === 'fixed' && def.behaviour.sealed,
    openUntil: 0,
    strikeReady: 0,
    held: false,
    yielded: false,
    summonerId: origin.summonerId,
    summonTimer: (def.summon?.cooldown ?? 0) * SPAWN.firstSummon,
    trailFrom: { x: pos.x, z: pos.z },
    foeId: null,
    revived: origin.revived,
    leashTime: 0,
    returning: false,
  };
  world.nextId += 1;
  world.monsters.push(monster);
  world.events.push({ type: 'monster_spawn', monsterId: monster.id });
  return monster;
}
