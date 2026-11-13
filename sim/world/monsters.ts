import { attacksHeld } from './glitch-hold.ts';
import type { StalkerBehaviour, SummonDef } from '../content/combat-types.ts';
import type { MonsterDef, RangedBehaviour, SkillDef, SurgeRules } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { clamp, directionOf, distance, facingOf, normalize, rotate } from '../math.ts';
import { isWalkable, lineOfSight, lineWalkable, nearestWalkable, routedGrid } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { lifePhase, pickBossSkill } from './boss.ts';
import { aggroPack } from './combat.ts';
import { allHold } from './conditions.ts';
import { modsNamed, withMods } from './elites.ts';
import type { Steering, SteerStep } from './movement.ts';
import { beingKnocked, faceToward, steerAlong, steerToward, stepKnock, stepTimers } from './movement.ts';
import { blockedReason, startSkill, stepAction } from './skills.ts';
import { SPAWN, spawnMonster } from './spawn.ts';
import { mayStrike } from './factions.ts';
import { LEASH, shellPoint, shutOut } from './leash.ts';
import { revivable } from './revive.ts';
import { roomAhead } from './queue.ts';
import type { Actor, MomentState, MonsterStance, MonsterState, World, WorldEvent } from './types.ts';

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
  queueRoom: 1,
  queuePatience: 2,
  stillStep: 1e-4,
  blockedGrace: 0.1,
  orbitBand: 1.5,
  orbitPull: 0.7,
  orbitSpeed: 0.85,
  feudReach: 1.5,
  strandSeconds: 2,
  strandReach: 6,
  strandSpeed: 2.5,
} as const;

const STEERING: Steering = { maxTurnRate: 11.5, minTurnRate: 2, turnGain: 20, fullSpeedAngle: 0.25, sharpAngle: 1, sharpSpeed: 0.3, passRadius: 0.45, settleRadius: 0.2 };

function towardOf(monster: MonsterState, target: Vec2): Vec2 {
  return normalize({ x: target.x - monster.pos.x, z: target.z - monster.pos.z }, directionOf(monster.facing));
}

function face(monster: MonsterState, target: Vec2, dt: number): void {
  faceToward(monster, { x: target.x - monster.pos.x, z: target.z - monster.pos.z }, MONSTERS.turnRate * dt);
}

function travel(world: World, monster: MonsterState, direction: Vec2, speed: number, foe: Vec2, dt: number): void {
  if (monster.root > 0) {
    face(monster, foe, dt);
    return;
  }
  const step: SteerStep = steerToward(routedGrid(world.grid), monster, facingOf(direction), speed * dt, dt, STEERING);
  monster.lastTravel = step.tried;
  monster.moving = step.moved > MONSTERS.stillStep || (step.tried > 0 && monster.stuckTime < MONSTERS.blockedGrace);
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
    monster.path = findPath(routedGrid(world.grid), monster.pos, target);
    monster.repathTimer = MONSTERS.repathInterval;
  }
  if (monster.path.length === 1 && lineWalkable(routedGrid(world.grid), monster.pos, target)) monster.path = [{ x: target.x, z: target.z }];
  if (monster.path.length === 0) {
    face(monster, target, dt);
    return;
  }
  const step: SteerStep = steerAlong(routedGrid(world.grid), monster, monster.path, monster.def.moveSpeed * dt, dt, STEERING);
  if (monster.path.length === 0) monster.repathTimer = 0;
  monster.lastTravel = step.tried;
  monster.moving = step.moved > MONSTERS.stillStep || (step.tried > 0 && monster.stuckTime < MONSTERS.blockedGrace);
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

function rangeStance(monster: MonsterState, behaviour: RangedBehaviour, gap: number, sight: boolean, roomBehind: boolean, reach: number): MonsterStance {
  const blind: boolean = monster.blindTime > MONSTERS.blindGrace;
  const away: boolean = blind || gap > Math.max(behaviour.preferredRange + MONSTERS.holdBand, reach);
  const blockedInReach: boolean = monster.stuckTime > 0 && gap <= reach;
  if (monster.stance === 'approach' || monster.stance === 'engage') return sight && (gap <= behaviour.preferredRange || blockedInReach) ? 'hold' : 'approach';
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
  const reach: number = skill.engageRange + foe.radius;
  if (sight && gap <= reach && attack(world, monster, skill, foe)) return;
  const probe: number = MONSTERS.retreatProbe + (monster.stance === 'retreat' ? 0 : MONSTERS.roomBand);
  const behind: Vec2 = { x: monster.pos.x - toward.x * probe, z: monster.pos.z - toward.z * probe };
  monster.stance = rangeStance(monster, behaviour, gap, sight, lineWalkable(routedGrid(world.grid), monster.pos, behind), reach);
  switch (monster.stance) {
    case 'approach':
    case 'engage':
      approach(world, monster, foe.pos, dt);
      return;
    case 'retreat':
      travel(world, monster, { x: -toward.x, z: -toward.z }, monster.def.moveSpeed * MONSTERS.retreatSpeed, foe.pos, dt);
      return;
    case 'hold':
      if (lostSight) {
        monster.strafeSign = -monster.strafeSign;
        monster.restTime = MONSTERS.restTime;
      }
      travel(world, monster, rotate(toward, MONSTERS.strafeAngle * monster.strafeSign), monster.def.moveSpeed * MONSTERS.strafeSpeed, foe.pos, dt);
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
  travel(world, monster, heading, monster.def.moveSpeed * MONSTERS.orbitSpeed, foe.pos, dt);
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

function stillBlocked(world: World, monster: MonsterState, foe: Actor): boolean {
  if (monster.stalledFor === null || monster.stalledFor >= MONSTERS.queuePatience) return false;
  const skill: SkillDef | null = monster.nextSkill ?? world.content.skills.get(monster.def.skill) ?? null;
  if (monster.stance === 'hold') return skill !== null && blockedReason(monster, skill) !== null;
  return roomAhead(world, monster, facingOf({ x: foe.pos.x - monster.pos.x, z: foe.pos.z - monster.pos.z })) < MONSTERS.queueRoom;
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
  monster.stalledFor = 0;
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

function unstrand(world: World, monster: MonsterState, dt: number): void {
  const grid: NavGrid = routedGrid(world.grid);
  if (isWalkable(grid, monster.pos.x, monster.pos.z)) {
    monster.stranded = 0;
    return;
  }
  monster.stranded += dt;
  if (monster.stranded < MONSTERS.strandSeconds) return;
  const way: Vec2 | null = nearestWalkable(grid, monster.pos, MONSTERS.strandReach);
  if (way === null) return;
  const gap: number = distance(monster.pos, way);
  if (gap <= 0) return;
  const step: number = Math.min(gap, MONSTERS.strandSpeed * dt);
  monster.pos.x += ((way.x - monster.pos.x) / gap) * step;
  monster.pos.z += ((way.z - monster.pos.z) / gap) * step;
  monster.motion = 'stride';
}

function heldAtShell(world: World, monster: MonsterState, moment: MomentState, foe: Actor, dt: number): void {
  monster.leashTime += dt;
  if (monster.leashTime >= LEASH.wait) {
    monster.aggro = false;
    monster.foeId = null;
    monster.returning = true;
    monster.leashTime = 0;
    monster.path = [];
    return;
  }
  const shell: Vec2 = shellPoint(moment, monster);
  if (distance(monster.pos, shell) > LEASH.shellGap) approach(world, monster, shell, dt);
  else face(monster, foe.pos, dt);
}

function walkHome(world: World, monster: MonsterState, dt: number): void {
  if (distance(monster.pos, monster.home) <= LEASH.homeReach) {
    monster.returning = false;
    monster.path = [];
    return;
  }
  approach(world, monster, monster.home, dt);
}

export function stepMonster(world: World, monster: MonsterState, dt: number): void {
  monster.motion = 'still';
  stepKnock(routedGrid(world.grid), monster, dt);
  monster.moving = false;
  if (!monster.alive) {
    monster.deadTime += dt;
    return;
  }
  unstrand(world, monster, dt);
  stepTimers(monster, dt);
  if (monster.spawnTime > 0) {
    monster.motion = 'rising';
    monster.spawnTime = Math.max(0, monster.spawnTime - dt);
    return;
  }
  const local: number = dt * monster.tempo;
  stepAction(world, monster, local);
  trackProgress(monster, dt);
  if (local <= 0) return;
  const foe: Actor | null = monster.aggro ? foeOf(world, monster) : null;
  if (foe !== null && monster.summonerId === null && monster.def.summon !== null) summonOf(world, monster, monster.def.summon, local);
  if (monster.action !== null || monster.stagger > 0 || beingKnocked(monster)) return;
  if (!monster.aggro) {
    if (monster.returning) walkHome(world, monster, local);
    else wake(world, monster);
    return;
  }
  monster.returning = false;
  if (foe === null) {
    if (!strikes(world, monster, world.player)) monster.aggro = false;
    return;
  }
  if (support(world, monster)) return;
  const shut: MomentState | null = foe.kind === 'player' ? shutOut(world, monster, foe.pos) : null;
  if (shut !== null) {
    heldAtShell(world, monster, shut, foe, local);
    return;
  }
  monster.leashTime = 0;
  if (monster.restTime > 0) {
    monster.restTime = Math.max(0, monster.restTime - local);
    face(monster, foe.pos, local);
    if (monster.stalledFor !== null) monster.stalledFor += local;
    if (monster.restTime === 0 && stillBlocked(world, monster, foe)) monster.restTime = local;
    return;
  }
  monster.stalledFor = null;
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
