import type { MonsterDef, MonsterScaling, RangedBehaviour, SkillDef, SurgeRules } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance, facingOf, normalize, rotate } from '../math.ts';
import { lineOfSight, lineWalkable, moveWithCollision, nearestWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { lifePhase, pickBossSkill } from './boss.ts';
import { aggroPack } from './combat.ts';
import { allHold } from './conditions.ts';
import { stepKnock, stepTimers } from './movement.ts';
import { blockedReason, startSkill, stepAction } from './skills.ts';
import type { MonsterState, PlayerState, World } from './types.ts';

const MONSTERS = {
  repathInterval: 0.45,
  waypointReach: 0.35,
  corpseTime: 6,
  spawnTime: 0.9,
  spawnScatter: 2.6,
  spawnSnap: 6,
  retreatSpeed: 0.75,
  strafeSpeed: 0.45,
  strafeAngle: 1.35,
  holdBand: 0.8,
} as const;

function travel(world: World, monster: MonsterState, direction: Vec2, speed: number, dt: number): void {
  moveWithCollision(world.grid, monster.pos, direction.x * speed * dt, direction.z * speed * dt);
  monster.facing = facingOf(direction);
  monster.moving = true;
}

function approach(world: World, monster: MonsterState, target: Vec2, dt: number): void {
  if (lineWalkable(world.grid, monster.pos, target)) {
    monster.path = [];
    travel(world, monster, normalize({ x: target.x - monster.pos.x, z: target.z - monster.pos.z }, { x: 0, z: 1 }), monster.def.moveSpeed, dt);
    return;
  }
  monster.repathTimer -= dt;
  if (monster.repathTimer <= 0 || monster.path.length === 0) {
    monster.path = findPath(world.grid, monster.pos, target);
    monster.repathTimer = MONSTERS.repathInterval;
  }
  const waypoint: Vec2 | undefined = monster.path[0];
  if (waypoint === undefined) return;
  if (distance(monster.pos, waypoint) < MONSTERS.waypointReach) {
    monster.path.shift();
    return;
  }
  travel(world, monster, normalize({ x: waypoint.x - monster.pos.x, z: waypoint.z - monster.pos.z }, { x: 0, z: 1 }), monster.def.moveSpeed, dt);
}

function attack(world: World, monster: MonsterState, skill: SkillDef, player: PlayerState): boolean {
  if (blockedReason(monster, skill) !== null) return false;
  startSkill(world, monster, skill, { x: player.pos.x - monster.pos.x, z: player.pos.z - monster.pos.z });
  monster.nextSkill = null;
  return true;
}

function chosenSkill(world: World, monster: MonsterState): SkillDef | null {
  if (monster.def.boss === null) return world.content.skills.get(monster.def.skill) ?? null;
  if (lifePhase(monster, monster.def.boss) > monster.phase) monster.nextSkill = null;
  monster.nextSkill ??= pickBossSkill(world, monster, monster.def.boss);
  return monster.nextSkill;
}

function chase(world: World, monster: MonsterState, skill: SkillDef, player: PlayerState, dt: number): void {
  const gap: number = distance(monster.pos, player.pos) - player.radius;
  if (gap <= skill.engageRange) {
    monster.facing = facingOf({ x: player.pos.x - monster.pos.x, z: player.pos.z - monster.pos.z });
    attack(world, monster, skill, player);
    return;
  }
  approach(world, monster, player.pos, dt);
}

function keepRange(world: World, monster: MonsterState, behaviour: RangedBehaviour, skill: SkillDef, player: PlayerState, dt: number): void {
  const gap: number = distance(monster.pos, player.pos);
  const toward: Vec2 = normalize({ x: player.pos.x - monster.pos.x, z: player.pos.z - monster.pos.z }, { x: 0, z: 1 });
  const sight: boolean = lineOfSight(world.grid, monster.pos, player.pos);
  if (sight && gap <= skill.engageRange + player.radius && attack(world, monster, skill, player)) return;
  if (!sight || gap > behaviour.preferredRange + MONSTERS.holdBand) {
    approach(world, monster, player.pos, dt);
    return;
  }
  if (gap < behaviour.retreatRange) {
    travel(world, monster, { x: -toward.x, z: -toward.z }, monster.def.moveSpeed * MONSTERS.retreatSpeed, dt);
    monster.facing = facingOf(toward);
    return;
  }
  travel(world, monster, rotate(toward, MONSTERS.strafeAngle * monster.strafeSign), monster.def.moveSpeed * MONSTERS.strafeSpeed, dt);
  monster.facing = facingOf(toward);
}

function wake(world: World, monster: MonsterState, player: PlayerState): void {
  if (distance(monster.pos, player.pos) > monster.def.aggroRadius) return;
  if (!lineOfSight(world.grid, monster.pos, player.pos)) return;
  monster.aggro = true;
  world.events.push({ type: 'aggro', monsterId: monster.id });
  aggroPack(world, monster);
}

export function stepMonster(world: World, monster: MonsterState, dt: number): void {
  stepKnock(world.grid, monster, dt);
  monster.moving = false;
  if (!monster.alive) {
    monster.deadTime += dt;
    return;
  }
  stepTimers(monster, dt);
  if (monster.spawnTime > 0) {
    monster.spawnTime = Math.max(0, monster.spawnTime - dt);
    return;
  }
  stepAction(world, monster, dt);
  const player: PlayerState = world.player;
  if (monster.action !== null || monster.stagger > 0 || !player.alive) return;
  if (!monster.aggro) {
    wake(world, monster, player);
    return;
  }
  const skill: SkillDef | null = chosenSkill(world, monster);
  if (skill === null) return;
  const behaviour = monster.def.behaviour;
  switch (behaviour.type) {
    case 'chaser':
      chase(world, monster, skill, player, dt);
      return;
    case 'ranged':
      keepRange(world, monster, behaviour, skill, player, dt);
      return;
  }
}

export function removeCorpses(world: World): void {
  const kept: MonsterState[] = [];
  for (const monster of world.monsters) {
    if (!monster.alive && monster.deadTime > MONSTERS.corpseTime) world.events.push({ type: 'monster_remove', monsterId: monster.id });
    else kept.push(monster);
  }
  world.monsters = kept;
}

export function monsterLevel(world: World): number {
  return world.zone.level + (world.zone.surge === null ? 0 : world.surge - 1);
}

function spawnMonster(world: World, def: MonsterDef, packId: number, center: Vec2): void {
  const scaling: MonsterScaling = world.content.world.scaling;
  const level: number = monsterLevel(world);
  const angle: number = world.rng.range(0, Math.PI * 2);
  const reach: number = world.rng.range(0, MONSTERS.spawnScatter);
  const wanted: Vec2 = { x: center.x + Math.cos(angle) * reach, z: center.z + Math.sin(angle) * reach };
  const pos: Vec2 = nearestWalkable(world.grid, wanted, MONSTERS.spawnSnap) ?? { x: center.x, z: center.z };
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
    alive: true,
    deadTime: 0,
    moving: false,
    aggro: false,
    path: [],
    repathTimer: 0,
    spawnTime: MONSTERS.spawnTime,
    phase: 0,
    nextSkill: null,
  };
  world.nextId += 1;
  world.monsters.push(monster);
  world.events.push({ type: 'monster_spawn', monsterId: monster.id });
}

export function spawnPacks(world: World): void {
  const rules: SurgeRules | null = world.zone.surge;
  const extra: number = rules === null ? 0 : Math.min(rules.maxExtraMonsters, Math.floor((world.surge - 1) / Math.max(1, rules.surgesPerExtraMonster)));
  for (const pack of world.zone.packs) {
    if (world.spawnedPacks.includes(pack) || !allHold(world, pack.when)) continue;
    world.spawnedPacks.push(pack);
    const packId: number = world.nextPackId;
    world.nextPackId += 1;
    pack.members.forEach((member, index: number): void => {
      const def: MonsterDef | undefined = world.content.monsters.get(member.monster);
      if (def === undefined) return;
      const count: number = member.count + (index === 0 ? extra : 0);
      for (let spawned: number = 0; spawned < count; spawned += 1) spawnMonster(world, def, packId, { x: pack.x, z: pack.z });
    });
  }
}

export function stepSurge(world: World, dt: number): void {
  const rules: SurgeRules | null = world.zone.surge;
  if (rules === null) return;
  if (world.surgeTimer === null) {
    if (world.monsters.some((monster: MonsterState): boolean => monster.alive)) return;
    world.surgeTimer = rules.delay;
    world.events.push({ type: 'surge_cleared', surge: world.surge, delay: world.surgeTimer });
    return;
  }
  world.surgeTimer -= dt;
  if (world.surgeTimer > 0) return;
  world.surgeTimer = null;
  world.surge += 1;
  world.spawnedPacks = [];
  spawnPacks(world);
  world.events.push({ type: 'surge', surge: world.surge });
}
