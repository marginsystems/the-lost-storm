import type { SkillLeap } from '../content/combat-types.ts';
import type { HoldDef } from '../content/shape-types.ts';
import type { ComboStep, Delivery, ProjectileDelivery, SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, directionOf, dot, facingOf, normalize, rotate } from '../math.ts';
import { isSolid, isWalkable, lineOfSight, moveWithCollision } from '../nav/grid.ts';
import type { Offence } from './combat.ts';
import { applyHit, offenceOf, targetsOf, teamOf } from './combat.ts';
import { stepDash } from './dash.ts';
import { effectiveAttackSpeed } from '../stats.ts';
import { placeField, timeScaleAt } from './fields.ts';
import { placeHazard } from './hazards.ts';
import { resolveBeam, resolveBlink, resolveChain } from './shapes.ts';
import type { ActionState, Actor, NoticeReason, ProjectileState, World } from './types.ts';

export const SKILLS = {
  projectileOrigin: 0.9,
  projectileStep: 0.3,
  leapProbe: 0.2,
} as const;

export function blockedReason(actor: Actor, skill: SkillDef): NoticeReason | null {
  if ((actor.cooldowns[skill.id] ?? 0) > 0) return 'on_cooldown';
  if (actor.kind === 'player' && actor.mana < skill.manaCost) return 'no_mana';
  return null;
}

function widened(delivery: Delivery, scale: number): Delivery {
  if (delivery.type === 'arc') return { ...delivery, reach: delivery.reach * scale };
  if (delivery.type === 'nova' || delivery.type === 'mark' || delivery.type === 'field' || delivery.type === 'blink') return { ...delivery, radius: delivery.radius * scale };
  if (delivery.type === 'beam') return { ...delivery, range: delivery.range * scale };
  return delivery;
}

export function comboHits(actor: Actor, skill: SkillDef): number {
  const chain = actor.combo;
  if (skill.combo === null || chain === null || chain.skill !== skill.id || chain.timeLeft <= 0) return 0;
  return chain.hits > skill.combo.steps.length ? 0 : chain.hits;
}

export function chainedSkill(actor: Actor, skill: SkillDef): SkillDef {
  const step: ComboStep | undefined = skill.combo?.steps[comboHits(actor, skill) - 1];
  if (step === undefined) return skill;
  return {
    ...skill,
    animation: step.animation,
    windup: step.windup,
    recovery: step.recovery,
    delivery: widened(skill.delivery, step.areaScale),
    damage: { weaponPercent: skill.damage.weaponPercent * step.damageScale, flatMin: skill.damage.flatMin * step.damageScale, flatMax: skill.damage.flatMax * step.damageScale },
    knockback: skill.knockback * step.knockbackScale,
    stagger: step.stagger,
    shake: step.shake,
    hitStop: step.hitStop,
  };
}

function aimedRange(delivery: Delivery): number | null {
  switch (delivery.type) {
    case 'mark':
    case 'chain':
    case 'blink':
      return delivery.range;
    case 'field':
      return delivery.anchor === 'ground' ? delivery.range : null;
    case 'arc':
    case 'nova':
    case 'projectile':
    case 'dash':
    case 'beam':
      return null;
  }
  return null;
}

function reachOf(skill: SkillDef, leap: SkillLeap | null, wanted: number): number {
  if (leap !== null) return Math.min(leap.distance, Math.max(0, wanted - leap.stopShort));
  return Math.min(aimedRange(skill.delivery) ?? 0, wanted);
}

function walksTo(skill: SkillDef): boolean {
  return skill.leap !== null || skill.delivery.type === 'blink' || skill.delivery.type === 'field';
}

export function payCost(actor: Actor, skill: SkillDef): boolean {
  if (actor.kind !== 'player') return true;
  if (actor.mana < skill.manaCost) return false;
  actor.mana -= skill.manaCost;
  return true;
}

export function isHeld(actor: Actor, action: ActionState): boolean {
  return actor.kind === 'player' && action.slot !== null && actor.held.includes(action.slot);
}

function stillCharging(actor: Actor, action: ActionState): boolean {
  const hold: HoldDef | null = action.skill.hold;
  return hold?.type === 'charge' && action.elapsed < hold.max && isHeld(actor, action);
}

export function chargeOf(action: ActionState): number {
  const hold: HoldDef | null = action.skill.hold;
  if (hold?.type !== 'charge') return 0;
  return Math.min(1, action.elapsed / hold.max);
}

export function chargedSkill(skill: SkillDef, charge: number): SkillDef {
  const hold: HoldDef | null = skill.hold;
  if (hold?.type !== 'charge' || charge <= 0) return skill;
  const power: number = 1 + (hold.damageScale - 1) * charge;
  const weight: number = Math.sqrt(power);
  return {
    ...skill,
    delivery: widened(skill.delivery, 1 + (hold.areaScale - 1) * charge),
    damage: { weaponPercent: skill.damage.weaponPercent * power, flatMin: skill.damage.flatMin * power, flatMax: skill.damage.flatMax * power },
    knockback: skill.knockback * weight,
    stagger: skill.stagger * weight,
    shake: skill.shake * weight,
    hitStop: skill.hitStop * weight,
  };
}

function clearReach(world: World, actor: Actor, aim: ReadonlyVec2, wanted: number): number {
  let reach: number = 0;
  while (reach < wanted) {
    const next: number = Math.min(wanted, reach + SKILLS.leapProbe);
    if (!isWalkable(world.grid, actor.pos.x + aim.x * next, actor.pos.z + aim.z * next)) return reach;
    reach = next;
  }
  return reach;
}

export function startSkill(world: World, actor: Actor, requested: SkillDef, direction: ReadonlyVec2, slot: number | null = null): void {
  const hits: number = comboHits(actor, requested);
  const skill: SkillDef = chainedSkill(actor, requested);
  const speed: number = actor.kind === 'player' && skill.scalesWithAttackSpeed ? effectiveAttackSpeed(actor.stats) : 1;
  const aim: Vec2 = normalize(direction, directionOf(actor.facing));
  const windup: number = skill.delivery.type === 'dash' ? skill.delivery.duration : skill.windup / speed;
  const recovery: number = skill.recovery / speed;
  payCost(actor, skill);
  actor.cooldowns[skill.id] = skill.cooldown;
  actor.facing = facingOf(aim);
  actor.moving = false;
  const planned: number = reachOf(skill, skill.leap, Math.hypot(direction.x, direction.z));
  const reach: number = walksTo(skill) ? clearReach(world, actor, aim, planned) : planned;
  const aimsAhead: boolean = skill.leap !== null || aimedRange(skill.delivery) !== null;
  const target: Vec2 | null = aimsAhead ? { x: actor.pos.x + aim.x * reach, z: actor.pos.z + aim.z * reach } : null;
  const travelSpeed: number = skill.leap === null ? 0 : reach / Math.min(windup, skill.leap.airTime);
  actor.action = { skill, phase: 'windup', timeLeft: windup, windup, recovery, direction: aim, target, travelSpeed, travelLeft: skill.leap === null ? 0 : reach, slot, elapsed: 0 };
  actor.combo = requested.combo === null ? null : { skill: requested.id, hits: hits + 1, timeLeft: windup + recovery + requested.combo.window };
  world.events.push({ type: 'skill_start', actorId: actor.id, skill, direction: aim, windup, recovery });
}

function spawnProjectiles(world: World, actor: Actor, skill: SkillDef, delivery: ProjectileDelivery, direction: ReadonlyVec2, offence: Offence): void {
  const count: number = Math.max(1, Math.round(delivery.count));
  for (let index: number = 0; index < count; index += 1) {
    const offset: number = count === 1 ? 0 : (index - (count - 1) / 2) * delivery.spreadDegrees * DEGREES_TO_RADIANS;
    const aim: Vec2 = rotate(direction, offset);
    const projectile: ProjectileState = {
      id: world.nextId,
      ownerId: actor.id,
      team: offence.team,
      skill,
      damageMin: offence.damageMin,
      damageMax: offence.damageMax,
      damagePercent: offence.damagePercent,
      critChance: offence.critChance,
      critMultiplier: offence.critMultiplier,
      pos: { x: actor.pos.x + aim.x * SKILLS.projectileOrigin, z: actor.pos.z + aim.z * SKILLS.projectileOrigin },
      direction: aim,
      distanceLeft: delivery.range,
      pierceLeft: delivery.pierce,
      hitIds: [],
    };
    world.nextId += 1;
    world.projectiles.push(projectile);
    world.events.push({ type: 'projectile_spawn', projectile });
  }
}

function resolveImpact(world: World, actor: Actor, action: ActionState, skill: SkillDef): void {
  const direction: ReadonlyVec2 = action.direction;
  const offence: Offence = offenceOf(actor);
  let hits: number = 0;
  const delivery = skill.delivery;
  switch (delivery.type) {
    case 'arc': {
      const minDot: number = Math.cos((delivery.arcDegrees / 2) * DEGREES_TO_RADIANS);
      for (const target of targetsOf(world, offence.team)) {
        const offset: Vec2 = { x: target.pos.x - actor.pos.x, z: target.pos.z - actor.pos.z };
        const gap: number = Math.hypot(offset.x, offset.z);
        if (gap > delivery.reach + target.radius) continue;
        const toward: Vec2 = normalize(offset, direction);
        if (gap > target.radius && dot(toward, direction) < minDot) continue;
        if (applyHit(world, offence, target, skill, toward)) hits += 1;
      }
      break;
    }
    case 'nova': {
      for (const target of targetsOf(world, offence.team)) {
        const offset: Vec2 = { x: target.pos.x - actor.pos.x, z: target.pos.z - actor.pos.z };
        if (Math.hypot(offset.x, offset.z) > delivery.radius + target.radius) continue;
        if (applyHit(world, offence, target, skill, normalize(offset, direction))) hits += 1;
      }
      break;
    }
    case 'projectile':
      spawnProjectiles(world, actor, skill, delivery, direction, offence);
      break;
    case 'dash':
      break;
    case 'mark':
      placeHazard(world, offence, skill, action.target ?? actor.pos);
      break;
    case 'field':
      placeField(world, offence, skill, delivery.anchor === 'caster' ? actor.pos : (action.target ?? actor.pos));
      break;
    case 'chain':
      hits += resolveChain(world, actor, skill, delivery, action.target ?? actor.pos, offence);
      break;
    case 'beam':
      hits += resolveBeam(world, actor, skill, delivery, direction, offence);
      break;
    case 'blink':
      hits += resolveBlink(world, actor, skill, delivery, action.target, offence);
      break;
  }
  world.events.push({ type: 'skill_impact', actorId: actor.id, team: teamOf(actor), skill, origin: { x: actor.pos.x, z: actor.pos.z }, direction: { x: direction.x, z: direction.z }, hits });
}

function land(world: World, actor: Actor, action: ActionState): void {
  const target: Vec2 | null = action.target;
  if (target === null || !isWalkable(world.grid, target.x, target.z) || !lineOfSight(world.grid, actor.pos, target)) return;
  actor.pos.x = target.x;
  actor.pos.z = target.z;
  action.travelLeft = 0;
}

function toRecovery(action: ActionState): void {
  action.phase = 'recovery';
  action.timeLeft = Math.max(0, action.timeLeft) + action.recovery;
}

function stepChannel(world: World, actor: Actor, action: ActionState): void {
  const hold: HoldDef | null = action.skill.hold;
  if (hold?.type !== 'channel' || !isHeld(actor, action) || action.elapsed >= hold.max) {
    toRecovery(action);
    return;
  }
  while (action.timeLeft <= 0) {
    if (!payCost(actor, action.skill)) {
      world.events.push({ type: 'notice', reason: 'no_mana' });
      toRecovery(action);
      return;
    }
    action.timeLeft += hold.interval;
    resolveImpact(world, actor, action, action.skill);
  }
}

function finishWindup(world: World, actor: Actor, action: ActionState): void {
  if (action.travelSpeed > 0) land(world, actor, action);
  const hold: HoldDef | null = action.skill.hold;
  const skill: SkillDef = chargedSkill(action.skill, chargeOf(action));
  if (hold?.type === 'channel' && isHeld(actor, action)) {
    action.phase = 'channel';
    action.timeLeft = Math.max(0, action.timeLeft) + hold.interval;
    action.elapsed = 0;
  } else {
    action.phase = 'recovery';
    action.timeLeft += action.recovery;
  }
  resolveImpact(world, actor, action, skill);
}

export function stepAction(world: World, actor: Actor, dt: number): void {
  const action = actor.action;
  if (action === null) return;
  stepDash(world.grid, actor, action, dt);
  action.timeLeft -= dt;
  action.elapsed += dt;
  if (action.phase === 'windup' && action.travelLeft > 0 && action.timeLeft < action.travelLeft / action.travelSpeed + dt) {
    const step: number = Math.min(action.travelLeft, action.travelSpeed * dt);
    moveWithCollision(world.grid, actor.pos, action.direction.x * step, action.direction.z * step);
    action.travelLeft -= step;
  }
  if (action.phase === 'windup' && action.timeLeft <= 0) {
    if (stillCharging(actor, action)) action.timeLeft = 0;
    else finishWindup(world, actor, action);
  }
  if (actor.action === action && action.phase === 'channel') stepChannel(world, actor, action);
  if (actor.action === action && action.phase === 'recovery' && action.timeLeft <= 0) actor.action = null;
}

export function steerAction(actor: Actor, aim: ReadonlyVec2): void {
  const action: ActionState | null = actor.action;
  if (action === null || action.skill.hold === null || action.phase === 'recovery') return;
  const toward: Vec2 = normalize({ x: aim.x - actor.pos.x, z: aim.z - actor.pos.z }, action.direction);
  action.direction = toward;
  actor.facing = facingOf(toward);
}

function stepProjectile(world: World, projectile: ProjectileState, dt: number): boolean {
  const delivery = projectile.skill.delivery;
  if (delivery.type !== 'projectile') return false;
  let travel: number = Math.min(delivery.speed * dt * timeScaleAt(world, projectile.team, projectile.pos, delivery.radius), projectile.distanceLeft);
  while (travel > 0) {
    const step: number = Math.min(travel, SKILLS.projectileStep);
    travel -= step;
    projectile.pos.x += projectile.direction.x * step;
    projectile.pos.z += projectile.direction.z * step;
    projectile.distanceLeft -= step;
    if (isSolid(world.grid, projectile.pos.x, projectile.pos.z)) {
      world.events.push({ type: 'projectile_end', id: projectile.id, pos: { ...projectile.pos }, hit: true, skill: projectile.skill });
      return false;
    }
    for (const target of targetsOf(world, projectile.team)) {
      if (projectile.hitIds.includes(target.id)) continue;
      if (Math.hypot(target.pos.x - projectile.pos.x, target.pos.z - projectile.pos.z) > delivery.radius + target.radius) continue;
      projectile.hitIds.push(target.id);
      applyHit(world, { sourceId: projectile.ownerId, ...projectile }, target, projectile.skill, projectile.direction);
      projectile.pierceLeft -= 1;
      if (projectile.pierceLeft < 0) {
        world.events.push({ type: 'projectile_end', id: projectile.id, pos: { ...projectile.pos }, hit: true, skill: projectile.skill });
        return false;
      }
    }
  }
  if (projectile.distanceLeft <= 0) {
    world.events.push({ type: 'projectile_end', id: projectile.id, pos: { ...projectile.pos }, hit: false, skill: projectile.skill });
    return false;
  }
  return true;
}

export function stepProjectiles(world: World, dt: number): void {
  world.projectiles = world.projectiles.filter((projectile: ProjectileState): boolean => stepProjectile(world, projectile, dt));
}

export function clearProjectiles(world: World): void {
  for (const projectile of world.projectiles) world.events.push({ type: 'projectile_end', id: projectile.id, pos: { ...projectile.pos }, hit: false, skill: projectile.skill });
  world.projectiles = [];
}
