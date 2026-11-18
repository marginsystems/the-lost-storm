import { PLAYER_SIDE } from '../content/combat-types.ts';
import type { Content, ItemBaseDef, MonsterDef, SkillDef, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable, lineWalkable, nearestWalkable } from '../nav/grid.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import { createWorld } from '../world/create.ts';
import { regardOf } from '../world/factions.ts';
import { fightZones } from '../world/moments.ts';
import { spawnPackNear } from '../world/monsters.ts';
import { stepWorld } from '../world/step.ts';
import { enterZone } from '../world/zones.ts';
import type { Command, MonsterState, World, WorldEvent } from '../world/types.ts';
import type { BenchHero } from '../world/dev-commands.ts';
import { RL } from './contract.ts';
import type { Observation, ObserveContext } from './observe.ts';
import { hostileMonster, observe } from './observe.ts';
import type { RewardTally } from './reward.ts';
import { emptyTally, REWARD, rewardFor } from './reward.ts';

export const ARENA = {
  waves: 5,
  timeLimit: 150,
  waveGap: 1.5,
  spawnGap: { min: 7, max: 11 },
  spawnTries: 24,
  spawnReach: 4,
  fallbackGap: 5,
  levels: { min: 1, max: 12 },
  maxBaseLife: 150,
  levelSpread: 2,
  jitter: 0.2,
  speedJitter: 0.5,
  packSize: { min: 2, max: 5 },
  waveGrowth: 0.5,
  kinds: { min: 1, max: 2 },
  barSkills: { min: 0, max: 4 },
  basicSlot: 0,
  extraSlots: [1, 2, 3, 4],
  rollSlot: 5,
  benchSeed: 7919,
} as const;

export type ArenaOutcome = 'running' | 'won' | 'died' | 'timeout';

export interface ArenaOptions {
  readonly seed: number;
  readonly jitter: number;
  readonly waves: number;
}

export interface Arena {
  readonly options: ArenaOptions;
  readonly world: World;
  readonly rng: Rng;
  readonly pool: readonly MonsterDef[];
  readonly lives: Map<number, number>;
  readonly tally: RewardTally;
  readonly start: number;
  wave: number;
  nextWaveAt: number | null;
  outcome: ArenaOutcome;
  total: number;
  decisions: number;
}

export interface ArenaStep {
  readonly reward: number;
  readonly done: boolean;
  readonly events: readonly WorldEvent[];
}

function scaled(rng: Rng, spread: number): number {
  return 1 + rng.range(-spread, spread);
}

function jitterSkill(skill: SkillDef, rng: Rng, spread: number): SkillDef {
  const hit: number = scaled(rng, spread);
  return { ...skill, cooldown: skill.cooldown * scaled(rng, spread), manaCost: skill.manaCost * scaled(rng, spread), damage: { ...skill.damage, weaponPercent: skill.damage.weaponPercent * hit, flatMin: skill.damage.flatMin * hit, flatMax: skill.damage.flatMax * hit } };
}

function jitterMonster(monster: MonsterDef, rng: Rng, spread: number): MonsterDef {
  const hit: number = scaled(rng, spread);
  return { ...monster, life: monster.life * scaled(rng, spread), damageMin: monster.damageMin * hit, damageMax: monster.damageMax * hit, moveSpeed: monster.moveSpeed * scaled(rng, spread * ARENA.speedJitter) };
}

export function jitterContent(content: Content, rng: Rng, spread: number): Content {
  if (spread <= 0) return content;
  const skills: Map<string, SkillDef> = new Map<string, SkillDef>([...content.skills].map(([id, skill]: [string, SkillDef]): [string, SkillDef] => [id, jitterSkill(skill, rng, spread)]));
  const monsters: Map<string, MonsterDef> = new Map<string, MonsterDef>([...content.monsters].map(([id, monster]: [string, MonsterDef]): [string, MonsterDef] => [id, jitterMonster(monster, rng, spread)]));
  return { ...content, skills, monsters };
}

export function arenaPool(content: Content): MonsterDef[] {
  return [...content.monsters.values()].filter((monster: MonsterDef): boolean => monster.boss === null && monster.summon === null && monster.life <= ARENA.maxBaseLife && monster.behaviour.type !== 'fixed' && monster.dormant === null && regardOf(content, PLAYER_SIDE, monster.faction) === 'hostile');
}

export function heroSkills(content: Content): string[] {
  const book: string[] = content.player.skillBook.map((unlock): string => unlock.skill);
  const unlocked: string[] = content.skillTree.flatMap((node): string[] => (node.unlock === null ? [] : [node.unlock]));
  return [...new Set<string>([...book, ...unlocked])].filter((skill: string): boolean => content.skills.has(skill));
}

function pick<T>(rng: Rng, list: readonly T[]): T | null {
  return list.length === 0 ? null : (list[rng.int(0, list.length - 1)] ?? null);
}

function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
  const out: T[] = [...list];
  for (let index: number = out.length - 1; index > 0; index -= 1) {
    const swap: number = rng.int(0, index);
    const held: T | undefined = out[index];
    const other: T | undefined = out[swap];
    if (held === undefined || other === undefined) continue;
    out[index] = other;
    out[swap] = held;
  }
  return out;
}

function benchHero(content: Content, rng: Rng, level: number): BenchHero {
  const weapons: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === 'weapon');
  const basic: string | null = content.player.skillBook[0]?.skill ?? null;
  const roll: string | null = content.player.skillBook[1]?.skill ?? null;
  const extras: string[] = shuffled(rng, heroSkills(content).filter((skill: string): boolean => skill !== basic && skill !== roll)).slice(0, rng.int(ARENA.barSkills.min, ARENA.barSkills.max));
  const bar: (string | null)[] = Array.from({ length: RL.slots }, (): string | null => null);
  bar[ARENA.basicSlot] = basic;
  bar[ARENA.rollSlot] = roll;
  shuffled(rng, ARENA.extraSlots).forEach((slot: number, index: number): void => {
    bar[slot] = extras[index] ?? null;
  });
  return { seed: ARENA.benchSeed + rng.int(0, ARENA.benchSeed), level, weapon: pick(rng, weapons)?.id ?? null, bar };
}

function arenaZone(content: Content, level: number): ZoneDef {
  const id: string | undefined = fightZones(content)[0];
  const zone: ZoneDef | undefined = id === undefined ? undefined : content.zones.get(id);
  if (zone === undefined) throw new Error('no fight zone to hold an arena in');
  return { ...zone, packs: [], surge: null, moments: null, level, levelUpTo: level };
}

function spawnSpot(world: World, rng: Rng): Vec2 {
  const from: Vec2 = world.player.pos;
  for (let attempt: number = 0; attempt < ARENA.spawnTries; attempt += 1) {
    const angle: number = rng.range(0, Math.PI * 2);
    const gap: number = rng.range(ARENA.spawnGap.min, ARENA.spawnGap.max);
    const spot: Vec2 = { x: from.x + Math.cos(angle) * gap, z: from.z + Math.sin(angle) * gap };
    if (!isWalkable(world.grid, spot.x, spot.z) || !lineWalkable(world.grid, from, spot)) continue;
    return nearestWalkable(world.grid, spot, ARENA.spawnReach) ?? spot;
  }
  return nearestWalkable(world.grid, { x: from.x + ARENA.fallbackGap, z: from.z }, ARENA.spawnReach) ?? from;
}

function spawnWave(arena: Arena): void {
  const world: World = arena.world;
  const rng: Rng = arena.rng;
  const at: Vec2 = spawnSpot(world, rng);
  const kinds: number = rng.int(ARENA.kinds.min, ARENA.kinds.max);
  const size: number = rng.int(ARENA.packSize.min, ARENA.packSize.max) + Math.floor(arena.wave * ARENA.waveGrowth);
  const spawned: MonsterState[] = [];
  for (let kind: number = 0; kind < kinds; kind += 1) {
    const def: MonsterDef | null = pick(rng, arena.pool);
    if (def === null) continue;
    spawned.push(...spawnPackNear(world, def.id, Math.max(1, Math.round(size / kinds)), at));
  }
  const friendly: ReadonlySet<MonsterState> = new Set<MonsterState>(spawned.filter((monster: MonsterState): boolean => !hostileMonster(world, monster)));
  world.monsters = world.monsters.filter((monster: MonsterState): boolean => !friendly.has(monster));
  for (const monster of spawned) {
    if (friendly.has(monster)) continue;
    monster.aggro = true;
    arena.lives.set(monster.id, monster.maxLife);
  }
  arena.wave += 1;
  arena.nextWaveAt = null;
}

export function createArena(content: Content, options: ArenaOptions): Arena {
  const rng: Rng = createRng(options.seed);
  const played: Content = jitterContent(content, rng, options.jitter);
  const level: number = rng.int(ARENA.levels.min, ARENA.levels.max);
  const world: World = createWorld(played, { seed: options.seed, save: null, opening: false });
  const zone: ZoneDef = arenaZone(played, Math.max(1, level + rng.int(-ARENA.levelSpread, ARENA.levelSpread)));
  enterZone(world, zone, { type: 'start' });
  world.zone = zone;
  world.monsters = [];
  world.moments = [];
  world.encounters = [];
  world.packReturns = [];
  stepWorld(world, [{ type: 'bench', hero: benchHero(played, rng, level) }], RL.tick);
  const arena: Arena = { options, world, rng, pool: arenaPool(played), lives: new Map<number, number>(), tally: emptyTally(), start: world.time, wave: 0, nextWaveAt: null, outcome: 'running', total: 0, decisions: 0 };
  spawnWave(arena);
  return arena;
}

function foesLeft(arena: Arena): number {
  return arena.world.monsters.filter((monster: MonsterState): boolean => hostileMonster(arena.world, monster)).length;
}

export function arenaRunning(arena: Arena): boolean {
  return arena.outcome === 'running';
}

export function arenaContext(arena: Arena): ObserveContext {
  return { situation: 'arena', objective: null, timeLeft: Math.max(0, ARENA.timeLimit - (arena.world.time - arena.start)), progress: arena.wave / Math.max(1, arena.options.waves) };
}

export function arenaObservation(arena: Arena): Observation {
  return observe(arena.world, arenaContext(arena));
}

export function afterTick(arena: Arena, events: readonly WorldEvent[]): number {
  if (arena.outcome !== 'running') return 0;
  const world: World = arena.world;
  for (const event of events) {
    if (event.type !== 'monster_spawn' || arena.lives.has(event.monsterId)) continue;
    const spawned: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.id === event.monsterId);
    if (spawned !== undefined) arena.lives.set(spawned.id, spawned.maxLife);
  }
  const lifeOf = (id: number): number => arena.lives.get(id) ?? world.monsters.find((monster: MonsterState): boolean => monster.id === id)?.maxLife ?? world.player.maxLife;
  let reward: number = rewardFor(events, { playerId: world.player.id, playerMaxLife: world.player.maxLife, lifeOf }, arena.tally);
  if (!world.player.alive || arena.tally.deaths > 0) arena.outcome = 'died';
  else if (foesLeft(arena) === 0 && arena.nextWaveAt === null) {
    reward += REWARD.wave;
    arena.tally.waves += 1;
    if (arena.wave >= arena.options.waves) {
      reward += REWARD.win;
      arena.outcome = 'won';
    }
    else arena.nextWaveAt = world.time + ARENA.waveGap;
  }
  else if (arena.nextWaveAt !== null && world.time >= arena.nextWaveAt) spawnWave(arena);
  if (arena.outcome === 'running' && world.time - arena.start >= ARENA.timeLimit) arena.outcome = 'timeout';
  arena.total += reward;
  return reward;
}

export function stepArena(arena: Arena, commands: readonly Command[]): ArenaStep {
  const events: WorldEvent[] = [];
  let reward: number = -REWARD.step;
  arena.total -= REWARD.step;
  for (let tick: number = 0; tick < RL.ticksPerDecision && arenaRunning(arena); tick += 1) {
    const happened: WorldEvent[] = stepWorld(arena.world, tick === 0 ? commands : [], RL.tick);
    events.push(...happened);
    reward += afterTick(arena, happened);
  }
  arena.decisions += 1;
  return { reward, done: arena.outcome !== 'running', events };
}
