import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import type { Offence } from './combat.ts';
import { applyHit, offenceOf, targetsOf } from './combat.ts';
import type { HazardState, MonsterState, World, WorldEvent } from './types.ts';

export function placeHazard(world: World, offence: Offence, skill: SkillDef, at: ReadonlyVec2): HazardState | null {
  const delivery = skill.delivery;
  if (delivery.type !== 'mark') return null;
  const hazard: HazardState = {
    id: world.nextId,
    ownerId: offence.sourceId,
    team: offence.team,
    skill,
    pos: { x: at.x, z: at.z },
    radius: delivery.radius,
    delay: delivery.delay,
    damageMin: offence.damageMin,
    damageMax: offence.damageMax,
    damagePercent: offence.damagePercent,
    critChance: offence.critChance,
    critMultiplier: offence.critMultiplier,
    timeLeft: delivery.delay,
  };
  world.nextId += 1;
  world.hazards.push(hazard);
  world.events.push({ type: 'hazard', hazard, burst: false, hits: 0 });
  return hazard;
}

function burst(world: World, hazard: HazardState): void {
  let hits: number = 0;
  for (const target of targetsOf(world, hazard.team)) {
    const offset: Vec2 = { x: target.pos.x - hazard.pos.x, z: target.pos.z - hazard.pos.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    if (gap > hazard.radius + target.radius) continue;
    const away: Vec2 = gap > 0 ? { x: offset.x / gap, z: offset.z / gap } : { x: 0, z: 1 };
    applyHit(world, { sourceId: hazard.ownerId, ...hazard }, target, hazard.skill, away);
    hits += 1;
  }
  world.events.push({ type: 'hazard', hazard, burst: true, hits });
}

function deathBursts(world: World, events: readonly WorldEvent[]): void {
  for (const event of events) {
    if (event.type !== 'death' || event.team !== 'monster') continue;
    const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
    const skillId: string | null = monster?.def.deathSkill ?? null;
    const skill: SkillDef | undefined = skillId === null ? undefined : world.content.skills.get(skillId);
    if (monster !== undefined && skill !== undefined) placeHazard(world, offenceOf(monster), skill, monster.pos);
  }
}

export function stepHazards(world: World, dt: number): void {
  deathBursts(world, [...world.events]);
  const due: HazardState[] = [];
  world.hazards = world.hazards.filter((hazard: HazardState): boolean => {
    hazard.timeLeft -= dt;
    if (hazard.timeLeft > 0) return true;
    due.push(hazard);
    return false;
  });
  for (const hazard of due) burst(world, hazard);
}

export function clearHazards(world: World): void {
  world.hazards = [];
}
