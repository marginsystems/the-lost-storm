import type { SkillFlare } from '../content/combat-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { leftBehind } from '../powers.ts';
import type { AreaState, Offence, World } from './types.ts';

export const FLARE = {
  ripple: 0.025,
  first: 0.02,
} as const;

function middleOf(area: AreaState): Vec2 {
  return { x: area.pos.x + (area.toward.x * area.reach) / 2, z: area.pos.z + (area.toward.z * area.reach) / 2 };
}

export function flareAreas(world: World, offence: Offence, skill: SkillDef, from: Vec2): number {
  const flare: SkillFlare | null = skill.flare;
  if (flare === null) return 0;
  const left: SkillDef | undefined = world.content.skills.get(flare.burst);
  if (left === undefined) return 0;
  const burst: SkillDef = leftBehind(world, offence.sourceId, skill, left);
  const lit: AreaState[] = world.areas.filter((area: AreaState): boolean => area.ownerId === offence.sourceId && area.skill.id === flare.areas && area.timeLeft > 0);
  for (const area of lit) {
    const at: Vec2 = middleOf(area);
    world.echoes.push({ ownerId: offence.sourceId, ...offence, skill: burst, origin: at, direction: { x: area.toward.x, z: area.toward.z }, target: null, timeLeft: FLARE.first + distance(from, at) * FLARE.ripple });
  }
  return lit.length;
}
