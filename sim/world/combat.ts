import { PLAYER_SIDE } from '../content/combat-types.ts';
import { attacksHeld } from './glitch-hold.ts';
import type { SkillDef } from '../content/types.ts';
import { rollDrop } from './loot.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, directionOf, dot } from '../math.ts';
import { damageTakenScale, resolveSkill } from '../stats.ts';
import { grantXp, killXp, refreshPlayer } from './character.ts';
import { firePowers } from '../powers.ts';
import { isDashing, isInvulnerable } from './dash.ts';
import { knockTime, readablePush } from './movement.ts';
import { closeDialogue } from './dialogue.ts';
import { mayStrike, provoke, regardOf } from './factions.ts';
import { gainFlaskCharges } from './flask-charges.ts';
import { dropOnGround } from './ground.ts';
import { steadiness } from './poise.ts';
import type { Actor, BrandState, GuardOutcome, ItemInstance, MonsterState, Offence, Team, World } from './types.ts';

export const COMBAT = {
  guardedKnockback: 0.2,
} as const;

export type { Offence } from './types.ts';

export function teamOf(actor: Actor): Team {
  return actor.kind;
}

export function offenceOf(actor: Actor): Offence {
  if (actor.kind === 'player') {
    return {
      sourceId: actor.id,
      team: 'player',
      faction: null,
      damageMin: actor.stats.damageMin,
      damageMax: actor.stats.damageMax,
      damagePercent: actor.stats.damagePercent,
      critChance: actor.stats.critChance,
      critMultiplier: actor.stats.critMultiplier,
    };
  }
  return { sourceId: actor.id, team: 'monster', faction: actor.def.faction, damageMin: actor.damageMin, damageMax: actor.damageMax, damagePercent: 0, critChance: 0, critMultiplier: 1 };
}

export function targetsOf(world: World, offence: Pick<Offence, 'sourceId' | 'faction'>): Actor[] {
  const actors: Actor[] = [world.player, ...world.monsters];
  return actors.filter((actor: Actor): boolean => !isInvulnerable(actor) && mayStrike(world, offence, actor));
}

export function setTempo(actor: Actor, scale: number, time: number): void {
  if (scale < actor.tempo || actor.tempoTime <= 0) {
    actor.tempo = scale;
    actor.tempoTime = time;
    return;
  }
  if (scale === actor.tempo) actor.tempoTime = Math.max(actor.tempoTime, time);
}

export function findActor(world: World, id: number): Actor | null {
  if (world.player.id === id) return world.player;
  return world.monsters.find((monster: MonsterState): boolean => monster.id === id) ?? null;
}

export function aggroPack(world: World, monster: MonsterState): void {
  for (const other of world.monsters) {
    if (other.packId !== monster.packId || other.aggro || !other.alive) continue;
    other.aggro = true;
    world.events.push({ type: 'aggro', monsterId: other.id });
  }
}

function rollLoot(world: World, monster: MonsterState): void {
  if (monster.revived) return;
  const loot = monster.def.loot;
  if (world.rng.chance(loot.goldChance)) {
    const scale: number = (1 + world.content.world.scaling.xpPerLevel * (monster.level - 1)) * (1 + world.player.stats.goldFind);
    dropOnGround(world, monster.pos, { kind: 'gold', amount: Math.max(1, Math.round(world.rng.int(loot.goldMin, loot.goldMax) * scale)) });
  }
  if (world.rng.chance(loot.itemChance)) {
    const item: ItemInstance | null = rollDrop(world, Math.max(monster.level, world.player.level), null);
    if (item === null) return;
    dropOnGround(world, monster.pos, { kind: 'item', item });
  }
}

export function kill(world: World, target: Actor, direction: ReadonlyVec2): void {
  target.alive = false;
  target.life = 0;
  target.action = null;
  target.moving = false;
  target.deadTime = 0;
  world.events.push({ type: 'death', actorId: target.id, team: teamOf(target), pos: { x: target.pos.x, z: target.pos.z }, direction: { x: direction.x, z: direction.z } });
  if (target.kind === 'player') {
    closeDialogue(world, false);
    target.intent = { type: 'idle' };
    target.path = [];
    target.queued = null;
    return;
  }
  if (regardOf(world.content, PLAYER_SIDE, target.def.faction) !== 'hostile') return;
  world.player.kills += 1;
  gainFlaskCharges(world.player);
  rollLoot(world, target);
  grantXp(world, killXp(world, target.def.xp, target.level));
}

export function guardOutcome(target: Actor, skill: SkillDef, direction: ReadonlyVec2): GuardOutcome {
  if (target.kind !== 'monster' || target.def.guard === null || target.stagger > 0 || target.action?.phase === 'recovery') return 'open';
  const front: number = dot(directionOf(target.facing), { x: -direction.x, z: -direction.z });
  if (front < Math.cos((target.def.guard.arcDegrees / 2) * DEGREES_TO_RADIANS)) return 'open';
  return skill.stagger >= target.def.guard.breakStagger ? 'broken' : 'blocked';
}

function staggerOf(target: MonsterState, skill: SkillDef, guard: GuardOutcome): number {
  if (target.def.boss !== null) return 0;
  switch (guard) {
    case 'open':
      return skill.stagger * target.def.poise.stagger;
    case 'blocked':
      return 0;
    case 'broken':
      return Math.max(skill.stagger, target.def.guard?.breakTime ?? 0);
  }
  return 0;
}

function knockBack(target: Actor, push: ReadonlyVec2): void {
  if (target.action !== null && !isDashing(target)) return;
  const knock: ReadonlyVec2 = { x: target.knock.x + push.x, z: target.knock.z + push.z };
  if (!readablePush(knock) && knockTime(target) <= 0) return;
  target.knock.x = knock.x;
  target.knock.z = knock.z;
}

export function applyHit(world: World, offence: Offence, target: Actor, skill: SkillDef, direction: ReadonlyVec2): boolean {
  if (!target.alive || (target.kind === 'player' && (target.invulnerable > 0 || attacksHeld(world)))) return false;
  const guard: GuardOutcome = guardOutcome(target, skill, direction);
  const guarded: number = guard === 'blocked' && target.kind === 'monster' ? (target.def.guard?.damageTaken ?? 1) : 1;
  const weapon: number = world.rng.range(offence.damageMin, offence.damageMax) * (1 + offence.damagePercent) * skill.damage.weaponPercent;
  const flat: number = world.rng.range(skill.damage.flatMin, skill.damage.flatMax);
  const crit: boolean = world.rng.chance(offence.critChance);
  const mitigation: number = target.kind === 'player' ? damageTakenScale(target.stats, skill.damage.type, world.content.player.resistance, world.zone.stormTier) : 1;
  const amount: number = Math.max(1, Math.round((weapon + flat) * (crit ? offence.critMultiplier : 1) * mitigation * guarded));
  target.life -= amount;
  const poise: number = steadiness(target) * (guard === 'blocked' ? COMBAT.guardedKnockback : 1);
  if (skill.root > 0 && target.kind === 'player' && target.rootGrace <= 0) {
    target.root = Math.max(target.root, skill.root);
    target.rootGrace = target.root + world.content.player.rootGrace;
  }
  if (skill.hold > 0) setTempo(target, 0, skill.hold);
  if (target.kind === 'monster') {
    provoke(world, target, offence.sourceId, offence.faction ?? PLAYER_SIDE);
    const stagger: number = staggerOf(target, skill, guard);
    if (stagger > 0) {
      target.stagger = Math.max(target.stagger, stagger);
      if (target.action?.phase === 'windup') {
        target.action = null;
        world.events.push({ type: 'skill_interrupt', actorId: target.id });
      }
    }
    if (guard !== 'open') world.events.push({ type: 'guarded', monsterId: target.id, broken: guard === 'broken', pos: { x: target.pos.x, z: target.pos.z }, direction: { x: direction.x, z: direction.z } });
    if (!target.aggro) {
      target.aggro = true;
      world.events.push({ type: 'aggro', monsterId: target.id });
    }
    aggroPack(world, target);
  }
  knockBack(target, { x: direction.x * skill.knockback * poise, z: direction.z * skill.knockback * poise });
  const killed: boolean = target.life <= 0;
  world.events.push({
    type: 'damage',
    targetId: target.id,
    sourceId: offence.sourceId,
    targetTeam: teamOf(target),
    amount,
    crit,
    killed,
    pos: { x: target.pos.x, z: target.pos.z },
    direction: { x: direction.x, z: direction.z },
    skill,
  });
  if (killed) kill(world, target, direction);
  if (offence.sourceId === world.player.id && target.kind === 'monster') powersOnHit(world, target, skill, killed);
  brandStrike(world, offence, target, skill);
  return true;
}

function powersOnHit(world: World, target: Actor, skill: SkillDef, killed: boolean): void {
  const at: ReadonlyVec2 = { x: target.pos.x, z: target.pos.z };
  const hit: boolean = firePowers(world, { on: 'hit', skill, target, at });
  const slain: boolean = killed && firePowers(world, { on: 'kill', skill, target, at });
  if (hit || slain) refreshPlayer(world);
}

function burstBrand(world: World, target: Actor, brand: BrandState): void {
  const delivery = brand.burst.delivery;
  if (delivery.type !== 'nova') return;
  const at: ReadonlyVec2 = { x: target.pos.x, z: target.pos.z };
  world.events.push({ type: 'brand', targetId: target.id, skill: brand.burst, pos: { x: at.x, z: at.z }, burst: true });
  for (const other of targetsOf(world, brand.offence)) {
    const offset: ReadonlyVec2 = { x: other.pos.x - at.x, z: other.pos.z - at.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    if (gap > delivery.radius + other.radius) continue;
    applyHit(world, brand.offence, other, brand.burst, gap > 0 ? { x: offset.x / gap, z: offset.z / gap } : { x: 0, z: 1 });
  }
}

function brandStrike(world: World, offence: Offence, target: Actor, skill: SkillDef): void {
  const held: BrandState | null = target.brand;
  if (held !== null && held.source !== skill.id) {
    target.brand = null;
    burstBrand(world, target, held);
  }
  if (skill.brand === null || !target.alive) return;
  const burst: SkillDef | undefined = world.content.skills.get(skill.brand.burst);
  if (burst === undefined) return;
  target.brand = { source: skill.id, burst: offence.team === 'player' ? resolveSkill(world.content, burst, world.player.allocated) : burst, offence, timeLeft: skill.brand.duration };
  world.events.push({ type: 'brand', targetId: target.id, skill, pos: { x: target.pos.x, z: target.pos.z }, burst: false });
}
