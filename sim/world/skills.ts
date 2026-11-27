import { isDodge, recoveringFromDodge } from './dodge.ts';
import { isEmpty } from './press-buffer.ts';
import type { SkillLeap } from '../content/combat-types.ts';
import type { AreaDelivery, PressDef } from '../content/shape-types.ts';
import type { ComboStep, Delivery, ProjectileDelivery, SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, directionOf, dot, facingOf, normalize, rotate } from '../math.ts';
import { isSolid, isWalkable, moveWithCollision } from '../nav/grid.ts';
import { gridFor } from './movement.ts';
import { canReach, sameFloor } from './floors.ts';
import type { Offence } from './combat.ts';
import type { TargetFilter } from './combat.ts';
import { applyHit, offenceOf, targetsWhere, teamOf } from './combat.ts';
import { clearSpot, passesThrough, stepDash } from './dash.ts';
import { refreshHero } from './character.ts';
import { firePowers, leftBehind } from '../powers.ts';
import { effectiveAttackSpeed } from '../stats.ts';
import { widenedSkill } from '../widen.ts';
import { openArea, placeArea, timeScaleAt } from './areas.ts';
import { placeHazard, placeMarks } from './hazards.ts';
import { raiseFallen } from './revive.ts';
import { mendAllies } from './heal.ts';
import { braceThrough } from './poise.ts';
import { rankSize } from './ranks.ts';
import { feedMomentum, glidesWith, MOMENTUM, momentumOf, momentumStep, settleTurn, spendMomentum } from './momentum.ts';
import type { MomentumStep } from './momentum.ts';
import { resolveBeam, resolveBlink, resolveChain } from './shapes.ts';
import { aimChannel, beginChannel, drawCapacity, endChannels } from './channels.ts';
import { flareAreas } from './flare.ts';
import { needsPivot, turnInPlace, turnRateOf } from './pivot.ts';
import type { PivotState } from './pivot.ts';
import { turnToward } from './movement.ts';
import type { ActionState, Actor, ForkedLane, EchoState, NoticeReason, PlayerState, ProjectileState, QueuedShot, Team, World } from './types.ts';

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

export function readyToRepeat(player: PlayerState, skill: SkillDef | null | undefined): boolean {
  if (skill === undefined || skill === null || skill.press !== null) return false;
  if (blockedReason(player, skill) !== null) return false;
  if (player.action === null) return isEmpty(player.buffered);
  return isDodge(player.action.skill) && !isDodge(skill) && player.buffered.skill === null && player.buffered.dodge === null;
}

export function comboHits(actor: Actor, skill: SkillDef): number {
  const chain = actor.combo;
  if (skill.combo === null || chain === null || chain.skill !== skill.id || chain.timeLeft <= 0) return 0;
  return chain.hits > skill.combo.steps.length ? 0 : chain.hits;
}

export function chainedSkill(actor: Actor, skill: SkillDef): SkillDef {
  const step: ComboStep | undefined = skill.combo?.steps[comboHits(actor, skill) - 1];
  return step === undefined ? skill : stepSkill(skill, step);
}

export function bodySized(actor: Actor, skill: SkillDef): SkillDef {
  if (actor.kind !== 'monster' || skill.delivery.type !== 'arc') return skill;
  return widenedSkill(skill, rankSize(actor.def));
}

export function stepSkill(skill: SkillDef, step: ComboStep): SkillDef {
  return {
    ...widenedSkill(skill, step.areaScale),
    animation: step.animation,
    windup: step.windup,
    recovery: step.recovery,
    damage: { ...skill.damage, weaponPercent: skill.damage.weaponPercent * step.damageScale, flatMin: skill.damage.flatMin * step.damageScale, flatMax: skill.damage.flatMax * step.damageScale },
    knockback: skill.knockback * step.knockbackScale,
    stagger: step.stagger,
    shake: step.shake,
    hitStop: step.hitStop,
  };
}

function areaStart(delivery: AreaDelivery, origin: ReadonlyVec2, direction: ReadonlyVec2, target: ReadonlyVec2 | null): ReadonlyVec2 {
  if (delivery.anchor === 'caster') return origin;
  if (delivery.length > 0) return { x: origin.x + direction.x * delivery.range, z: origin.z + direction.z * delivery.range };
  return target ?? origin;
}

function aimedRange(delivery: Delivery): number | null {
  switch (delivery.type) {
    case 'mark':
    case 'field':
    case 'chain':
    case 'blink':
      return delivery.range;
    case 'area':
      return delivery.anchor === 'ground' && delivery.length === 0 ? delivery.range : null;
    case 'arc':
    case 'nova':
    case 'projectile':
    case 'dash':
    case 'beam':
    case 'revive':
      return null;
  }
  return null;
}

function reachOf(skill: SkillDef, leap: SkillLeap | null, wanted: number): number {
  if (leap !== null) return Math.min(leap.distance, Math.max(0, wanted - leap.stopShort));
  return Math.min(aimedRange(skill.delivery) ?? 0, wanted);
}

function walksTo(skill: SkillDef): boolean {
  return skill.leap !== null || skill.delivery.type === 'blink' || skill.delivery.type === 'area';
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
  const hold: PressDef | null = action.skill.press;
  return hold?.type === 'charge' && action.elapsed < hold.max && isHeld(actor, action);
}

export function chargeOf(action: ActionState): number {
  const hold: PressDef | null = action.skill.press;
  if (hold?.type !== 'charge') return 0;
  return Math.min(1, action.elapsed / hold.max);
}

export function chargedSkill(skill: SkillDef, charge: number): SkillDef {
  const hold: PressDef | null = skill.press;
  if (hold?.type !== 'charge' || charge <= 0) return skill;
  const power: number = 1 + (hold.damageScale - 1) * charge;
  const weight: number = Math.sqrt(power);
  return {
    ...widenedSkill(skill, 1 + (hold.areaScale - 1) * charge),
    damage: { ...skill.damage, weaponPercent: skill.damage.weaponPercent * power, flatMin: skill.damage.flatMin * power, flatMax: skill.damage.flatMax * power },
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
    if (!isWalkable(gridFor(world, actor), actor.pos.x + aim.x * next, actor.pos.z + aim.z * next)) return reach;
    reach = next;
  }
  return reach;
}

export function startSkill(world: World, actor: Actor, requested: SkillDef, direction: ReadonlyVec2, slot: number | null = null): void {
  if (drawCapacity(world, actor, requested.trail) <= 0) {
    actor.pivot = null;
    if (actor === world.player) world.events.push({ type: 'notice', reason: 'wall_full' });
    return;
  }
  const turnOnStart: boolean = actor.kind === 'player' && (recoveringFromDodge(actor.action) || requested.press?.type === 'travel' || (requested.press?.type === 'channel' && requested.press.strafe === true));
  if (!turnOnStart && needsPivot(actor, requested, direction)) {
    actor.pivot = { skill: requested, at: { x: actor.pos.x + direction.x, z: actor.pos.z + direction.z }, slot };
    return;
  }
  actor.pivot = null;
  const hits: number = comboHits(actor, requested);
  const skill: SkillDef = bodySized(actor, chainedSkill(actor, requested));
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
  const goal: Vec2 | null = glidesWith(skill.press) ? { x: actor.pos.x + direction.x, z: actor.pos.z + direction.z } : null;
  if (actor.kind === 'monster') braceThrough(actor, windup);
  const action: ActionState = { skill, phase: 'windup', timeLeft: windup, windup, recovery, direction: aim, target, travelSpeed, travelLeft: skill.leap === null ? 0 : reach, slot, elapsed: 0, goal, turned: 0, steeredAt: 0 };
  if (skill.press?.type === 'travel') {
    action.phase = 'channel';
    action.timeLeft = skill.press.max;
  }
  actor.action = action;
  actor.combo = requested.combo === null ? null : { skill: requested.id, hits: hits + 1, timeLeft: windup + recovery + requested.combo.window };
  endChannels(world);
  world.events.push({ type: 'skill_start', actorId: actor.id, skill, direction: aim, windup, recovery });
  beginChannel(world, actor, action, { x: actor.pos.x + direction.x, z: actor.pos.z + direction.z });
}

const VOLLEY_SCATTER: number = (Math.sqrt(5) - 1) / 2;

export function volleyOrder(count: number, interval: number): readonly number[] {
  const scatter = (index: number): number => (interval > 0 ? (index * VOLLEY_SCATTER) % 1 : index);
  return Array.from({ length: count }, (_: unknown, index: number): number => index).toSorted((a: number, b: number): number => scatter(a) - scatter(b));
}

function launch(world: World, projectile: ProjectileState): void {
  world.projectiles.push(projectile);
  world.events.push({ type: 'projectile_spawn', projectile });
}

function spawnProjectiles(world: World, origin: ReadonlyVec2, skill: SkillDef, delivery: ProjectileDelivery, direction: ReadonlyVec2, offence: Offence): void {
  const count: number = Math.max(1, Math.round(delivery.count));
  const order: readonly number[] = volleyOrder(count, delivery.interval);
  order.forEach((index: number, rank: number): void => {
    const offset: number = count === 1 ? 0 : (index - (count - 1) / 2) * delivery.spreadDegrees * DEGREES_TO_RADIANS;
    const aim: Vec2 = rotate(direction, offset);
    const projectile: ProjectileState = {
      id: world.nextId,
      ownerId: offence.sourceId,
      from: { x: origin.x, z: origin.z },
      team: offence.team,
      faction: offence.faction,
      skill,
      damageMin: offence.damageMin,
      damageMax: offence.damageMax,
      damagePercent: offence.damagePercent,
      critChance: offence.critChance,
      critMultiplier: offence.critMultiplier,
      pos: { x: origin.x + aim.x * SKILLS.projectileOrigin, z: origin.z + aim.z * SKILLS.projectileOrigin },
      direction: aim,
      distanceLeft: delivery.range,
      pierceLeft: delivery.pierce,
      hitIds: [],
    };
    world.nextId += 1;
    const wait: number = rank * delivery.interval;
    if (wait > 0) world.shots.push({ projectile, timeLeft: wait });
    else launch(world, projectile);
  });
}

interface Impact {
  readonly actor: Actor | null;
  readonly offence: Offence;
  readonly skill: SkillDef;
  readonly origin: ReadonlyVec2;
  readonly direction: ReadonlyVec2;
  readonly target: ReadonlyVec2 | null;
  readonly echo: boolean;
}

function strike(world: World, impact: Impact): number {
  const { offence, skill, origin, direction } = impact;
  let hits: number = 0;
  const delivery = skill.delivery;
  switch (delivery.type) {
    case 'arc': {
      const minDot: number = Math.cos((delivery.arcDegrees / 2) * DEGREES_TO_RADIANS);
      const near: TargetFilter = (target: Actor): boolean => !(Math.hypot(target.pos.x - origin.x, target.pos.z - origin.z) > delivery.reach + target.radius) && sameFloor(world, origin, target.pos);
      for (const target of targetsWhere(world, offence, near)) {
        const offset: Vec2 = { x: target.pos.x - origin.x, z: target.pos.z - origin.z };
        const gap: number = Math.hypot(offset.x, offset.z);
        if (gap > delivery.reach + target.radius || !sameFloor(world, origin, target.pos)) continue;
        const toward: Vec2 = normalize(offset, direction);
        if (gap > target.radius && dot(toward, direction) < minDot) continue;
        if (applyHit(world, offence, target, skill, toward)) hits += 1;
      }
      return hits;
    }
    case 'nova': {
      if (delivery.side === 'allies') return skill.mend === null ? 0 : mendAllies(world, offence, { skill, mend: skill.mend, origin, radius: delivery.radius });
      const near: TargetFilter = (target: Actor): boolean => !(Math.hypot(target.pos.x - origin.x, target.pos.z - origin.z) > delivery.radius + target.radius) && sameFloor(world, origin, target.pos);
      for (const target of targetsWhere(world, offence, near)) {
        const offset: Vec2 = { x: target.pos.x - origin.x, z: target.pos.z - origin.z };
        if (Math.hypot(offset.x, offset.z) > delivery.radius + target.radius || !sameFloor(world, origin, target.pos)) continue;
        if (applyHit(world, offence, target, skill, normalize(offset, direction))) hits += 1;
      }
      return hits;
    }
    case 'projectile':
      spawnProjectiles(world, origin, skill, delivery, direction, offence);
      return 0;
    case 'dash':
      return 0;
    case 'mark':
      placeMarks(world, offence, skill, impact.target ?? origin, direction);
      return 0;
    case 'field':
      placeHazard(world, offence, skill, impact.target ?? origin);
      return 0;
    case 'revive':
      return offence.faction === null ? 0 : raiseFallen(world, offence.sourceId, offence.faction, delivery, origin);
    case 'area': {
      const opened = openArea(world, offence, skill, areaStart(delivery, origin, direction, impact.target), direction);
      leave(world, impact, opened?.area.fork);
      return delivery.pushForward ? (opened?.hits ?? 0) : 0;
    }
    case 'chain':
      return resolveChain(world, origin, skill, delivery, impact.target ?? origin, offence);
    case 'beam':
      return resolveBeam(world, origin, skill, delivery, direction, offence);
    case 'blink':
      return resolveBlink(world, impact.actor, origin, skill, delivery, impact.target, offence);
  }
  return hits;
}

function leave(world: World, impact: Impact, fork?: ForkedLane): void {
  if (impact.echo || impact.skill.leaves === null) return;
  const left: SkillDef | undefined = world.content.skills.get(impact.skill.leaves);
  if (left === undefined) return;
  const parent: Delivery = impact.skill.delivery;
  const at: ReadonlyVec2 = parent.type === 'area' && parent.length > 0 ? areaStart(parent, impact.origin, impact.direction, impact.target) : impact.origin;
  placeArea(world, impact.offence, leftBehind(world, impact.offence.sourceId, impact.skill, left), at, impact.direction, null, fork);
}

function resolve(world: World, impact: Impact, team: Team): number {
  const hits: number = strike(world, impact);
  if (impact.skill.delivery.type !== 'area') leave(world, impact);
  const { offence, skill, origin, direction, target } = impact;
  world.events.push({ type: 'skill_impact', actorId: offence.sourceId, team, skill, origin: { x: origin.x, z: origin.z }, direction: { x: direction.x, z: direction.z }, hits, echo: impact.echo });
  if (impact.echo || skill.echo <= 0) return hits;
  const turned: Vec2 = skill.echoTurn === 0 ? { x: direction.x, z: direction.z } : rotate(direction, skill.echoTurn * DEGREES_TO_RADIANS);
  world.echoes.push({ ownerId: offence.sourceId, ...offence, skill: echoedSkill(skill), origin: { x: origin.x, z: origin.z }, direction: turned, target: target === null ? null : { x: target.x, z: target.z }, timeLeft: skill.echo });
  return hits;
}

export function echoedSkill(skill: SkillDef): SkillDef {
  if (skill.echoShare >= 1) return skill;
  const share: number = skill.echoShare;
  return { ...skill, damage: { ...skill.damage, weaponPercent: skill.damage.weaponPercent * share, flatMin: skill.damage.flatMin * share, flatMax: skill.damage.flatMax * share } };
}

export function spunSkill(actor: Actor, skill: SkillDef): SkillDef {
  if (skill.momentum === null) return skill;
  const step: MomentumStep = momentumStep(skill.momentum, momentumOf(actor, skill));
  return widenedSkill(skill, step.reach);
}

export function channelInterval(actor: Actor, skill: SkillDef, interval: number): number {
  const speed: number = actor.kind === 'player' && skill.scalesWithAttackSpeed ? effectiveAttackSpeed(actor.stats) : 1;
  const turn: number = skill.momentum === null ? 1 : momentumStep(skill.momentum, momentumOf(actor, skill)).turn;
  return interval / (speed * turn);
}

export function turnRate(actor: Actor, action: ActionState): number {
  const press: PressDef | null = action.skill.press;
  if (press?.type !== 'channel' || !glidesWith(press) || action.phase === 'recovery') return 0;
  const full: number = MOMENTUM.fullTurn / channelInterval(actor, action.skill, press.interval);
  if (action.phase === 'channel' || action.windup <= 0) return full;
  return full * Math.min(1, Math.max(0, 1 - action.timeLeft / action.windup));
}

function resolveImpact(world: World, actor: Actor, action: ActionState, skill: SkillDef): void {
  const hits: number = resolve(world, { actor, offence: offenceOf(actor), skill: spendMomentum(actor, spunSkill(actor, skill)), origin: actor.pos, direction: action.direction, target: action.target, echo: false }, teamOf(actor));
  flareAreas(world, offenceOf(actor), skill, actor.pos);
  feedMomentum(world, actor, skill, hits);
}

export function stepEchoes(world: World, dt: number): void {
  const due: EchoState[] = [];
  world.echoes = world.echoes.filter((echo: EchoState): boolean => {
    echo.timeLeft -= dt;
    if (echo.timeLeft > 0) return true;
    due.push(echo);
    return false;
  });
  for (const echo of due) {
    const offence: Offence = { sourceId: echo.ownerId, team: echo.team, faction: echo.faction, damageMin: echo.damageMin, damageMax: echo.damageMax, damagePercent: echo.damagePercent, critChance: echo.critChance, critMultiplier: echo.critMultiplier, from: { x: echo.origin.x, z: echo.origin.z } };
    resolve(world, { actor: null, offence, skill: echo.skill, origin: echo.origin, direction: echo.direction, target: echo.target, echo: true }, echo.team);
  }
}

function landsAt(world: World, actor: Actor, target: Vec2 | null): target is Vec2 {
  return target !== null && isWalkable(gridFor(world, actor), target.x, target.z) && canReach(world, actor.pos, target);
}

function fly(world: World, actor: Actor, action: ActionState, step: number): void {
  const target: Vec2 | null = action.target;
  if (!landsAt(world, actor, target)) {
    moveWithCollision(gridFor(world, actor), actor.pos, action.direction.x * step, action.direction.z * step);
    return;
  }
  const share: number = Math.min(1, step / action.travelLeft);
  actor.pos.x += (target.x - actor.pos.x) * share;
  actor.pos.z += (target.z - actor.pos.z) * share;
}

function land(world: World, actor: Actor, action: ActionState): void {
  const target: Vec2 | null = action.target;
  if (!landsAt(world, actor, target)) return;
  actor.pos.x = target.x;
  actor.pos.z = target.z;
  actor.motion = 'lunge';
  action.travelLeft = 0;
}

function toRecovery(actor: Actor, action: ActionState): void {
  settleTurn(actor, action);
  action.phase = 'recovery';
  action.timeLeft = Math.max(0, action.timeLeft) + action.recovery;
}

function stepChannel(world: World, actor: Actor, action: ActionState): void {
  const hold: PressDef | null = action.skill.press;
  if (hold?.type !== 'channel' || !isHeld(actor, action) || action.elapsed >= hold.max) {
    toRecovery(actor, action);
    return;
  }
  while (action.timeLeft <= 0) {
    if (!payCost(actor, action.skill)) {
      world.events.push({ type: 'notice', reason: 'no_mana' });
      toRecovery(actor, action);
      return;
    }
    action.timeLeft += channelInterval(actor, action.skill, hold.interval);
    resolveImpact(world, actor, action, action.skill);
    if (actor.kind === 'player' && firePowers(world, actor, { on: 'pulse', skill: action.skill, target: null, at: actor.pos })) refreshHero(world, actor);
  }
}

function finishWindup(world: World, actor: Actor, action: ActionState): void {
  actor.interrupts = 0;
  const from: ReadonlyVec2 = { x: actor.pos.x, z: actor.pos.z };
  if (action.travelSpeed > 0) land(world, actor, action);
  const hold: PressDef | null = action.skill.press;
  const skill: SkillDef = chargedSkill(action.skill, chargeOf(action));
  if (hold?.type === 'channel' && isHeld(actor, action)) {
    action.phase = 'channel';
    action.timeLeft = Math.max(0, action.timeLeft) + channelInterval(actor, action.skill, hold.interval);
    action.elapsed = 0;
    action.steeredAt = 0;
  } else {
    settleTurn(actor, action);
    action.phase = 'recovery';
    action.timeLeft += action.recovery;
  }
  resolveImpact(world, actor, action, skill);
  if (actor.kind === 'player' && firePowers(world, actor, { on: 'use', skill: action.skill, target: null, at: from })) refreshHero(world, actor);
}

export function stepPivot(world: World, actor: Actor, dt: number): void {
  const pivot: PivotState | null = actor.pivot;
  if (pivot === null) return;
  if (!actor.alive || actor.action !== null || actor.stagger > 0) {
    actor.pivot = null;
    return;
  }
  const direction: Vec2 = { x: pivot.at.x - actor.pos.x, z: pivot.at.z - actor.pos.z };
  turnInPlace(world, actor, direction, dt);
  if (needsPivot(actor, pivot.skill, direction)) return;
  actor.pivot = null;
  if (blockedReason(actor, pivot.skill) === null) startSkill(world, actor, pivot.skill, direction, pivot.slot);
}

export function stepAction(world: World, actor: Actor, dt: number): void {
  const action = actor.action;
  if (action === null) return;
  if (action.skill.press?.type === 'travel') {
    action.elapsed += dt;
    action.timeLeft -= dt;
    if (action.timeLeft <= 0 || !isHeld(actor, action)) actor.action = null;
    return;
  }
  const passing: boolean = passesThrough(actor);
  stepDash(gridFor(world, actor), actor, action, dt);
  action.timeLeft -= dt;
  action.elapsed += dt;
  action.turned = (action.turned + turnRate(actor, action) * dt) % MOMENTUM.fullTurn;
  if (action.phase === 'windup' && action.travelLeft > 0 && action.timeLeft < action.travelLeft / action.travelSpeed + dt) {
    const step: number = Math.min(action.travelLeft, action.travelSpeed * dt);
    fly(world, actor, action, step);
    actor.motion = 'lunge';
    action.travelLeft -= step;
  }
  if (action.phase === 'windup' && action.timeLeft <= 0) {
    if (stillCharging(actor, action)) action.timeLeft = 0;
    else finishWindup(world, actor, action);
  }
  if (actor.action === action && action.phase === 'channel') stepChannel(world, actor, action);
  if (actor.action === action && action.phase === 'recovery' && action.timeLeft <= 0) actor.action = null;
  if (passing && !passesThrough(actor)) settleClear(world, actor, action.direction);
}

function settleClear(world: World, actor: Actor, heading: ReadonlyVec2): void {
  const crowd: Actor[] = [world.player, ...world.monsters].filter((other: Actor): boolean => other !== actor && other.alive);
  const spot: Vec2 | null = clearSpot(gridFor(world, actor), actor.pos, heading, actor.radius, crowd);
  if (spot === null) return;
  actor.pos.x = spot.x;
  actor.pos.z = spot.z;
}

export function steerAction(world: World, actor: Actor, aim: ReadonlyVec2): void {
  const action: ActionState | null = actor.action;
  if (action === null || action.skill.press === null || action.phase === 'recovery') return;
  const offset: Vec2 = { x: aim.x - actor.pos.x, z: aim.z - actor.pos.z };
  const wanted: number = facingOf(normalize(offset, action.direction));
  const turned: number = turnToward(facingOf(action.direction), wanted, turnRateOf(world, actor) * Math.max(0, action.elapsed - action.steeredAt));
  action.steeredAt = action.elapsed;
  const toward: Vec2 = directionOf(turned);
  action.direction = toward;
  actor.facing = turned;
  if (glidesWith(action.skill.press)) action.goal = { x: aim.x, z: aim.z };
  aimChannel(world, actor, aim);
  if (action.target === null || action.skill.leap !== null) return;
  const planned: number = reachOf(action.skill, null, Math.hypot(offset.x, offset.z));
  const reach: number = walksTo(action.skill) ? clearReach(world, actor, toward, planned) : planned;
  action.target = { x: actor.pos.x + toward.x * reach, z: actor.pos.z + toward.z * reach };
}

function stepProjectile(world: World, projectile: ProjectileState, dt: number): boolean {
  const delivery = projectile.skill.delivery;
  if (delivery.type !== 'projectile') return false;
  let travel: number = Math.min(delivery.speed * dt * timeScaleAt(world, projectile.team, projectile.pos, delivery.radius), projectile.distanceLeft);
  while (travel > 0) {
    const step: number = Math.min(travel, SKILLS.projectileStep);
    const was: Vec2 = { x: projectile.pos.x, z: projectile.pos.z };
    travel -= step;
    projectile.pos.x += projectile.direction.x * step;
    projectile.pos.z += projectile.direction.z * step;
    projectile.distanceLeft -= step;
    if (isSolid(world.grid, projectile.pos.x, projectile.pos.z) || !sameFloor(world, was, projectile.pos)) {
      world.events.push({ type: 'projectile_end', id: projectile.id, pos: { ...projectile.pos }, hit: true, skill: projectile.skill });
      return false;
    }
    const near: TargetFilter = (target: Actor): boolean => !projectile.hitIds.includes(target.id) && !(Math.hypot(target.pos.x - projectile.pos.x, target.pos.z - projectile.pos.z) > delivery.radius + target.radius);
    for (const target of targetsWhere(world, { sourceId: projectile.ownerId, faction: projectile.faction, from: projectile.from }, near)) {
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

function launchDue(world: World, dt: number): void {
  const due: QueuedShot[] = [];
  world.shots = world.shots.filter((shot: QueuedShot): boolean => {
    shot.timeLeft -= dt;
    if (shot.timeLeft > 0) return true;
    due.push(shot);
    return false;
  });
  for (const shot of due) {
    launch(world, shot.projectile);
    if (!stepProjectile(world, shot.projectile, Math.min(dt, -shot.timeLeft))) world.projectiles = world.projectiles.filter((projectile: ProjectileState): boolean => projectile !== shot.projectile);
  }
}

export function stepProjectiles(world: World, dt: number): void {
  world.projectiles = world.projectiles.filter((projectile: ProjectileState): boolean => stepProjectile(world, projectile, dt));
  launchDue(world, dt);
}

export function clearProjectiles(world: World): void {
  for (const projectile of world.projectiles) world.events.push({ type: 'projectile_end', id: projectile.id, pos: { ...projectile.pos }, hit: false, skill: projectile.skill });
  world.projectiles = [];
  world.shots = [];
}
