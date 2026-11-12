import { attacksHeld } from './glitch-hold.ts';
import type { StalkerBehaviour, SummonDef } from '../content/combat-types.ts';
import type { MonsterDef, RangedBehaviour, SkillDef, SurgeRules } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { clamp, directionOf, distance, normalize, rotate } from '../math.ts';
import { lineOfSight, lineWalkable, moveWithCollision, paceAt } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { lifePhase, pickBossSkill } from './boss.ts';
import { aggroPack } from './combat.ts';
import { allHold } from './conditions.ts';
import { modsNamed, withMods } from './elites.ts';
import { faceToward, followPath, stepKnock, stepTimers } from './movement.ts';
import { blockedReason, startSkill, stepAction } from './skills.ts';
import { SPAWN, spawnMonster } from './spawn.ts';
import { mayStrike } from './factions.ts';
import { revivable } from './revive.ts';
import type { Actor, MonsterStance, MonsterState, World, WorldEvent } from './types.ts';

const MONSTERS = {
  repathInterval: 0.45,
  repathDrift: 1,
  corpseTime: 6,
  retreatSpeed: 0.75,
  strafeSpeed: 0.45,
  strafeAngle: 1.35,
  holdBand: 0.8,
  retreatBand: 1.2,
  retreatProbe: 1.5,
  roomBand: 1.5,
  engageBand: 0.6,
  blindGrace: 0.6,
  turnRate: 10,
  stuckFraction: 0.3,
  stuckLimit: 0.3,
  restTime: 0.6,
  stillStep: 1e-4,
  blockedGrace: 0.1,
  orbitBand: 1.5,
  orbitPull: 0.7,
  orbitSpeed: 0.85,
  feudReach: 1.5,
} as const;

function towardOf(monster: MonsterState, target: Vec2): Vec2 {
  return normalize({ x: target.x - monster.pos.x, z: target.z - monster.pos.z }, directionOf(monster.facing));
}

function face(monster: MonsterState, target: Vec2, dt: number): void {
  faceToward(monster, { x: target.x - monster.pos.x, z: target.z - monster.pos.z }, MONSTERS.turnRate * dt);
}

function travel(world: World, monster: MonsterState, direction: Vec2, speed: number, dt: number): void {
  if (monster.root > 0) return;
  const fromX: number = monster.pos.x;
  const fromZ: number = monster.pos.z;
  const paced: number = speed * paceAt(world.grid, monster.pos.x, monster.pos.z);
  moveWithCollision(world.grid, monster.pos, direction.x * paced * dt, direction.z * paced * dt);
  monster.lastTravel = paced * dt;
  monster.moving = Math.hypot(monster.pos.x - fromX, monster.pos.z - fromZ) > MONSTERS.stillStep || monster.stuckTime < MONSTERS.blockedGrace;
}

function approach(world: World, monster: MonsterState, target: Vec2, dt: number): void {
  if (monster.root > 0) {
    face(monster, target, dt);
    return;
  }
  monster.repathTimer -= dt;
  const goal: Vec2 | undefined = monster.path.at(-1);
  const drifted: boolean = goal === undefined || distance(goal, target) > MONSTERS.repathDrift;
  if (monster.repathTimer <= 0 && drifted) {
    monster.path = findPath(world.grid, monster.pos, target);
    monster.repathTimer = MONSTERS.repathInterval;
  }
  if (monster.path.length === 1 && lineWalkable(world.grid, monster.pos, target)) monster.path = [{ x: target.x, z: target.z }];
  if (monster.path.length === 0) {
    face(monster, target, dt);
    return;
  }
  const moved: number = followPath(world.grid, monster, monster.path, monster.def.moveSpeed * dt, MONSTERS.turnRate * dt);
  if (monster.path.length === 0) monster.repathTimer = 0;
  monster.lastTravel = monster.def.moveSpeed * paceAt(world.grid, monster.pos.x, monster.pos.z) * dt;
  monster.moving = moved > MONSTERS.stillStep || monster.stuckTime < MONSTERS.blockedGrace;
}

function attack(world: World, monster: MonsterState, skill: SkillDef, foe: Actor): boolean {
  if (blockedReason(monster, skill) !== null || attacksHeld(world)) return false;
  startSkill(world, monster, skill, { x: foe.pos.x - monster.pos.x, z: foe.pos.z - monster.pos.z });
  monster.nextSkill = null;
  return true;
}

function chosenSkill(world: World, monster: MonsterState): SkillDef | null {
  if (monster.def.boss === null) return world.content.skills.get(monster.def.skill) ?? null;
  if (lifePhase(monster, monster.def.boss) > monster.phase) monster.nextSkill = null;
  monster.nextSkill ??= pickBossSkill(world, monster, monster.def.boss);
  return monster.nextSkill;
}

function chase(world: World, monster: MonsterState, skill: SkillDef, foe: Actor, dt: number): void {
  const gap: number = distance(monster.pos, foe.pos) - foe.radius;
  const sight: boolean = gap <= skill.engageRange + MONSTERS.engageBand && lineOfSight(world.grid, monster.pos, foe.pos);
  const inReach: boolean = sight && gap <= skill.engageRange;
  const waiting: boolean = sight && monster.stance === 'engage' && blockedReason(monster, skill) !== null;
  if (inReach || waiting) {
    monster.stance = 'engage';
    face(monster, foe.pos, dt);
    if (inReach) attack(world, monster, skill, foe);
    return;
  }
  monster.stance = 'approach';
  approach(world, monster, foe.pos, dt);
}

function rangeStance(monster: MonsterState, behaviour: RangedBehaviour, gap: number, sight: boolean, roomBehind: boolean): MonsterStance {
  const blind: boolean = monster.blindTime > MONSTERS.blindGrace;
  const away: boolean = blind || gap > behaviour.preferredRange + MONSTERS.holdBand;
  if (monster.stance === 'approach' || monster.stance === 'engage') return sight && gap <= behaviour.preferredRange ? 'hold' : 'approach';
  if (away) return 'approach';
  if (monster.stance === 'hold') return gap < behaviour.retreatRange && roomBehind ? 'retreat' : 'hold';
  return gap > behaviour.retreatRange + MONSTERS.retreatBand || !roomBehind ? 'hold' : 'retreat';
}

function keepRange(world: World, monster: MonsterState, behaviour: RangedBehaviour, skill: SkillDef, foe: Actor, dt: number): void {
  const gap: number = distance(monster.pos, foe.pos);
  const toward: Vec2 = towardOf(monster, foe.pos);
  const sight: boolean = lineOfSight(world.grid, monster.pos, foe.pos);
  const lostSight: boolean = !sight && monster.blindTime === 0;
  monster.blindTime = sight ? 0 : monster.blindTime + dt;
  if (sight && gap <= skill.engageRange + foe.radius && attack(world, monster, skill, foe)) return;
  const probe: number = MONSTERS.retreatProbe + (monster.stance === 'retreat' ? 0 : MONSTERS.roomBand);
  const behind: Vec2 = { x: monster.pos.x - toward.x * probe, z: monster.pos.z - toward.z * probe };
  monster.stance = rangeStance(monster, behaviour, gap, sight, lineWalkable(world.grid, monster.pos, behind));
  switch (monster.stance) {
    case 'approach':
    case 'engage':
      approach(world, monster, foe.pos, dt);
      return;
    case 'retreat':
      travel(world, monster, { x: -toward.x, z: -toward.z }, monster.def.moveSpeed * MONSTERS.retreatSpeed, dt);
      face(monster, foe.pos, dt);
      return;
    case 'hold':
      if (lostSight) {
        monster.strafeSign = -monster.strafeSign;
        monster.restTime = MONSTERS.restTime;
      }
      travel(world, monster, rotate(toward, MONSTERS.strafeAngle * monster.strafeSign), monster.def.moveSpeed * MONSTERS.strafeSpeed, dt);
      face(monster, foe.pos, dt);
      return;
  }
}

function stalk(world: World, monster: MonsterState, behaviour: StalkerBehaviour, skill: SkillDef, foe: Actor, dt: number): void {
  const gap: number = distance(monster.pos, foe.pos) - foe.radius;
  const sight: boolean = lineOfSight(world.grid, monster.pos, foe.pos);
  if (sight && gap <= skill.engageRange && attack(world, monster, skill, foe)) return;
  if (!sight || gap > behaviour.orbitRange + MONSTERS.orbitBand) {
    monster.stance = 'approach';
    approach(world, monster, foe.pos, dt);
    return;
  }
  monster.stance = 'hold';
  const pull: number = clamp((gap - behaviour.orbitRange) / MONSTERS.orbitBand, -1, 1);
  const heading: Vec2 = rotate(towardOf(monster, foe.pos), (Math.PI / 2 - pull * MONSTERS.orbitPull) * monster.strafeSign);
  travel(world, monster, heading, monster.def.moveSpeed * MONSTERS.orbitSpeed, dt);
  faceToward(monster, heading, MONSTERS.turnRate * dt);
}

function summonOf(world: World, monster: MonsterState, summon: SummonDef, dt: number): void {
  monster.summonTimer -= dt;
  if (monster.summonTimer > 0) return;
  monster.summonTimer = summon.cooldown;
  const def: MonsterDef | undefined = world.content.monsters.get(summon.monster ?? monster.def.id);
  if (def === undefined) return;
  const called: number = world.monsters.filter((other: MonsterState): boolean => other.alive && other.summonerId === monster.id).length;
  for (let index: number = 0; index < Math.min(summon.count, summon.limit - called); index += 1) {
    const minion: MonsterState = spawnMonster(world, def, monster.packId, monster.pos, { summonerId: monster.id, scatter: SPAWN.summonScatter, revived: false });
    minion.aggro = true;
    world.events.push({ type: 'aggro', monsterId: minion.id });
  }
}

function trackProgress(monster: MonsterState, dt: number): void {
  const progress: number = distance(monster.lastPos, monster.pos);
  const blocked: boolean = monster.lastTravel > 0 && progress < monster.lastTravel * MONSTERS.stuckFraction;
  monster.stuckTime = blocked ? monster.stuckTime + dt : 0;
  monster.lastPos = { x: monster.pos.x, z: monster.pos.z };
  monster.lastTravel = 0;
  if (monster.stuckTime < MONSTERS.stuckLimit) return;
  monster.stuckTime = 0;
  monster.restTime = MONSTERS.restTime;
  monster.path = [];
  monster.repathTimer = 0;
  monster.strafeSign = -monster.strafeSign;
  if (monster.stance === 'retreat') monster.stance = 'hold';
}

function heard(world: World, monster: MonsterState, radius: number): boolean {
  const near = (pos: Vec2): boolean => distance(monster.pos, pos) <= radius;
  return world.events.some((event: WorldEvent): boolean => {
    if (event.type === 'skill_impact') return event.actorId !== monster.id && near(event.origin);
    if (event.type === 'damage' || event.type === 'death') return near(event.pos);
    return false;
  });
}

function strikes(world: World, monster: MonsterState, actor: Actor): boolean {
  return mayStrike(world, { sourceId: monster.id, faction: monster.def.faction }, actor);
}

function foeOf(world: World, monster: MonsterState): Actor | null {
  const held: Actor | undefined = monster.foeId === null ? undefined : [world.player, ...world.monsters].find((actor: Actor): boolean => actor.id === monster.foeId);
  if (held !== undefined && strikes(world, monster, held)) return held;
  monster.foeId = null;
  let best: Actor | null = strikes(world, monster, world.player) ? world.player : null;
  let bestGap: number = best === null ? Infinity : distance(monster.pos, best.pos);
  const reach: number = monster.def.aggroRadius * MONSTERS.feudReach;
  for (const other of world.monsters) {
    const gap: number = distance(monster.pos, other.pos);
    if (gap >= bestGap || gap > reach || !strikes(world, monster, other)) continue;
    best = other;
    bestGap = gap;
  }
  return best;
}

function rouse(world: World, monster: MonsterState): void {
  monster.aggro = true;
  world.events.push({ type: 'aggro', monsterId: monster.id });
  aggroPack(world, monster);
}

function fighting(actor: Actor): boolean {
  return actor.kind === 'player' || actor.aggro;
}

function wake(world: World, monster: MonsterState): void {
  if (monster.def.dormant !== null) {
    if (heard(world, monster, monster.def.dormant.noiseRadius)) rouse(world, monster);
    return;
  }
  const seen: boolean = [world.player, ...world.monsters].some((actor: Actor): boolean => fighting(actor) && distance(monster.pos, actor.pos) <= monster.def.aggroRadius && strikes(world, monster, actor) && lineOfSight(world.grid, monster.pos, actor.pos));
  if (seen) rouse(world, monster);
}

function support(world: World, monster: MonsterState): boolean {
  const skill: SkillDef | undefined = monster.def.support === null ? undefined : world.content.skills.get(monster.def.support);
  if (skill === undefined || skill.delivery.type !== 'revive' || blockedReason(monster, skill) !== null) return false;
  const fallen: MonsterState | undefined = revivable(world, monster.def.faction, skill.delivery, monster.pos)[0];
  if (fallen === undefined) return false;
  startSkill(world, monster, skill, { x: fallen.pos.x - monster.pos.x, z: fallen.pos.z - monster.pos.z });
  return true;
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
  const local: number = dt * monster.tempo;
  stepAction(world, monster, local);
  trackProgress(monster, dt);
  if (local <= 0) return;
  const foe: Actor | null = monster.aggro ? foeOf(world, monster) : null;
  if (foe !== null && monster.summonerId === null && monster.def.summon !== null) summonOf(world, monster, monster.def.summon, local);
  if (monster.action !== null || monster.stagger > 0) return;
  if (!monster.aggro) {
    wake(world, monster);
    return;
  }
  if (foe === null) {
    if (!strikes(world, monster, world.player)) monster.aggro = false;
    return;
  }
  if (support(world, monster)) return;
  if (monster.restTime > 0) {
    monster.restTime = Math.max(0, monster.restTime - local);
    face(monster, foe.pos, local);
    return;
  }
  const skill: SkillDef | null = chosenSkill(world, monster);
  if (skill === null) return;
  const behaviour = monster.def.behaviour;
  switch (behaviour.type) {
    case 'chaser':
      chase(world, monster, skill, foe, local);
      return;
    case 'ranged':
      keepRange(world, monster, behaviour, skill, foe, local);
      return;
    case 'stalker':
      stalk(world, monster, behaviour, skill, foe, local);
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

export function spawnPacks(world: World): void {
  const rules: SurgeRules | null = world.zone.surge;
  const extra: number = rules === null ? 0 : Math.min(rules.maxExtraMonsters, Math.floor((world.surge - 1) / Math.max(1, rules.surgesPerExtraMonster)));
  for (const pack of world.zone.packs) {
    if (world.spawnedPacks.includes(pack) || !allHold(world, pack.when)) continue;
    world.spawnedPacks.push(pack);
    const packId: number = world.nextPackId;
    world.nextPackId += 1;
    let place: number = 0;
    pack.members.forEach((member, index: number): void => {
      const base: MonsterDef | undefined = world.content.monsters.get(member.monster);
      if (base === undefined) return;
      const def: MonsterDef = withMods(base, modsNamed(world.content.monsterMods, member.mods));
      const count: number = member.count + (index === 0 ? extra : 0);
      for (let spawned: number = 0; spawned < count; spawned += 1) {
        const row: Vec2 = pack.row ?? { x: 0, z: 0 };
        spawnMonster(world, def, packId, { x: pack.x + row.x * place, z: pack.z + row.z * place }, { summonerId: null, scatter: pack.row === undefined ? SPAWN.spawnScatter : 0, revived: false });
        place += 1;
      }
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
