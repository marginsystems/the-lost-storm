import type { SkillDef } from '../content/types.ts';
import { generateItem } from '../items.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { armourReduction } from '../stats.ts';
import { grantXp } from './character.ts';
import { closeDialogue } from './dialogue.ts';
import { dropOnGround } from './ground.ts';
import type { Actor, ItemInstance, MonsterState, Team, World } from './types.ts';

export interface Offence {
  readonly sourceId: number;
  readonly team: Team;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damagePercent: number;
  readonly critChance: number;
  readonly critMultiplier: number;
}

export function teamOf(actor: Actor): Team {
  return actor.kind;
}

export function offenceOf(actor: Actor): Offence {
  if (actor.kind === 'player') {
    return {
      sourceId: actor.id,
      team: 'player',
      damageMin: actor.stats.damageMin,
      damageMax: actor.stats.damageMax,
      damagePercent: actor.stats.damagePercent,
      critChance: actor.stats.critChance,
      critMultiplier: actor.stats.critMultiplier,
    };
  }
  return { sourceId: actor.id, team: 'monster', damageMin: actor.damageMin, damageMax: actor.damageMax, damagePercent: 0, critChance: 0, critMultiplier: 1 };
}

export function targetsOf(world: World, team: Team): Actor[] {
  if (team === 'monster') return world.player.alive ? [world.player] : [];
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive);
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
  const loot = monster.def.loot;
  if (world.rng.chance(loot.goldChance)) {
    const scale: number = (1 + world.content.world.scaling.xpPerLevel * (monster.level - 1)) * (1 + world.player.stats.goldFind);
    dropOnGround(world, monster.pos, { kind: 'gold', amount: Math.max(1, Math.round(world.rng.int(loot.goldMin, loot.goldMax) * scale)) });
  }
  if (world.rng.chance(loot.itemChance)) {
    const item: ItemInstance | null = generateItem(world.content, world.rng, world.nextItemUid, Math.max(monster.level, world.player.level), null, null);
    if (item === null) return;
    world.nextItemUid += 1;
    dropOnGround(world, monster.pos, { kind: 'item', item });
  }
}

function kill(world: World, target: Actor, direction: ReadonlyVec2): void {
  target.alive = false;
  target.life = 0;
  target.action = null;
  target.moving = false;
  target.deadTime = 0;
  world.events.push({ type: 'death', actorId: target.id, team: teamOf(target), pos: { x: target.pos.x, z: target.pos.z }, direction: { x: direction.x, z: direction.z } });
  if (target.kind === 'player') {
    closeDialogue(world, false);
    target.respawnTimer = world.content.player.respawnDelay;
    target.intent = { type: 'idle' };
    target.path = [];
    target.queued = null;
    return;
  }
  world.player.kills += 1;
  rollLoot(world, target);
  grantXp(world, Math.round(target.def.xp * (1 + world.content.world.scaling.xpPerLevel * (target.level - 1))));
}

export function applyHit(world: World, offence: Offence, target: Actor, skill: SkillDef, direction: ReadonlyVec2): void {
  if (!target.alive) return;
  const weapon: number = world.rng.range(offence.damageMin, offence.damageMax) * (1 + offence.damagePercent) * skill.damage.weaponPercent;
  const flat: number = world.rng.range(skill.damage.flatMin, skill.damage.flatMax);
  const crit: boolean = world.rng.chance(offence.critChance);
  const mitigation: number = target.kind === 'player' ? 1 - armourReduction(target.stats.armour) : 1;
  const amount: number = Math.max(1, Math.round((weapon + flat) * (crit ? offence.critMultiplier : 1) * mitigation));
  target.life -= amount;
  target.knock.x += direction.x * skill.knockback;
  target.knock.z += direction.z * skill.knockback;
  if (target.kind === 'monster') {
    if (skill.stagger > 0) {
      target.stagger = Math.max(target.stagger, skill.stagger);
      if (target.action?.phase === 'windup') {
        target.action = null;
        world.events.push({ type: 'skill_interrupt', actorId: target.id });
      }
    }
    if (!target.aggro) {
      target.aggro = true;
      world.events.push({ type: 'aggro', monsterId: target.id });
    }
    aggroPack(world, target);
  }
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
}
