import type { MonsterTrail } from '../content/combat-types.ts';
import type { SkillDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { placeArea } from './areas.ts';
import { offenceOf } from './combat.ts';
import type { AreaState, MonsterState, World } from './types.ts';

export function trailAreas(world: World, monster: MonsterState, skill: string): number {
  return world.areas.filter((area: AreaState): boolean => area.ownerId === monster.id && area.skill.id === skill && area.timeLeft > 0).length;
}

export function stepTrail(world: World, monster: MonsterState): void {
  const trail: MonsterTrail | null = monster.def.trail;
  if (trail === null || !monster.alive || !monster.aggro) {
    monster.trailFrom = { x: monster.pos.x, z: monster.pos.z };
    return;
  }
  if (distance(monster.pos, monster.trailFrom) < trail.every) return;
  monster.trailFrom = { x: monster.pos.x, z: monster.pos.z };
  const skill: SkillDef | undefined = world.content.skills.get(trail.skill);
  if (skill === undefined || trailAreas(world, monster, trail.skill) >= trail.limit) return;
  placeArea(world, offenceOf(monster), skill, monster.pos);
}
