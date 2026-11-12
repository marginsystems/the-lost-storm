import type { MonsterDef, MonsterScaling } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { nearestWalkable } from '../nav/grid.ts';
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
}

export function monsterLevel(world: World): number {
  return world.zone.level + (world.zone.surge === null ? 0 : world.surge - 1);
}

export function spawnMonster(world: World, def: MonsterDef, packId: number, center: Vec2, origin: SpawnOrigin): MonsterState {
  const scaling: MonsterScaling = world.content.world.scaling;
  const level: number = monsterLevel(world);
  const angle: number = world.rng.range(0, Math.PI * 2);
  const reach: number = world.rng.range(0, origin.scatter);
  const wanted: Vec2 = { x: center.x + Math.cos(angle) * reach, z: center.z + Math.sin(angle) * reach };
  const pos: Vec2 = nearestWalkable(world.grid, wanted, SPAWN.spawnSnap) ?? { x: center.x, z: center.z };
  const life: number = Math.round(def.life * (1 + scaling.lifePerLevel * (level - 1)));
  const damageScale: number = 1 + scaling.damagePerLevel * (level - 1);
  const monster: MonsterState = {
    kind: 'monster',
    id: world.nextId,
    def,
    level,
    packId,
    damageMin: def.damageMin * damageScale,
    damageMax: def.damageMax * damageScale,
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
    combo: null,
    root: 0,
    brand: null,
    tempo: 1,
    tempoTime: 0,
    alive: true,
    deadTime: 0,
    moving: false,
    aggro: false,
    path: [],
    repathTimer: 0,
    stance: 'approach',
    blindTime: 0,
    stuckTime: 0,
    restTime: 0,
    lastPos: { x: pos.x, z: pos.z },
    lastTravel: 0,
    spawnTime: SPAWN.spawnTime,
    phase: 0,
    nextSkill: null,
    summonerId: origin.summonerId,
    summonTimer: (def.summon?.cooldown ?? 0) * SPAWN.firstSummon,
    foeId: null,
    revived: origin.revived,
  };
  world.nextId += 1;
  world.monsters.push(monster);
  world.events.push({ type: 'monster_spawn', monsterId: monster.id });
  return monster;
}
