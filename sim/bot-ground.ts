import type { SkillDef, SurfaceHeat } from './content/types.ts';
import type { ReadonlyVec2 } from './math.ts';
import { distance } from './math.ts';
import { damageTakenScale, expectedHit, skillCycle } from './stats.ts';
import { areaOf, stokedOffence } from './world/areas.ts';
import { burnTicks } from './world/combat.ts';
import { heatAt } from './world/heat.ts';
import type { AreaState, MonsterState, Offence, World } from './world/types.ts';

export const FINISH = {
  swings: 2,
  burnShare: 0.08,
  lifeFloor: 0.35,
  meleeReach: 4,
} as const;

function hurtsToStand(skill: SkillDef): boolean {
  return skill.damage.weaponPercent > 0 || skill.damage.flatMax > 0 || skill.burn !== null;
}

function burningUnder(world: World, area: AreaState, pos: ReadonlyVec2): boolean {
  const delivery = areaOf(area.skill);
  return delivery !== null && area.offence.team === 'monster' && hurtsToStand(area.skill) && distance(pos, area.pos) <= delivery.radius + world.player.radius;
}

export function hotGround(world: World, pos: ReadonlyVec2): boolean {
  if (heatAt(world, pos.x, pos.z) !== null) return true;
  return world.areas.some((area: AreaState): boolean => burningUnder(world, area, pos));
}

function heatBurn(world: World, pos: ReadonlyVec2, seconds: number): number {
  const heat: SurfaceHeat | null = heatAt(world, pos.x, pos.z);
  if (heat === null) return 0;
  const skill: SkillDef | undefined = world.content.skills.get(heat.skill);
  if (skill === undefined || skill.burn === null) return 0;
  const perTick: number = world.player.maxLife * heat.lifeShare * skill.burn.share;
  return perTick * (seconds / skill.burn.tick + burnTicks(skill));
}

function hitOf(world: World, offence: Offence, skill: SkillDef): number {
  const weapon: number = ((offence.damageMin + offence.damageMax) / 2) * (1 + offence.damagePercent) * skill.damage.weaponPercent;
  const flat: number = (skill.damage.flatMin + skill.damage.flatMax) / 2;
  const crit: number = 1 + Math.min(1, offence.critChance) * (offence.critMultiplier - 1);
  return (weapon + flat) * crit * damageTakenScale(world.player.stats, skill.damage.type, world.content.player.resistance, world.zone.stormTier);
}

function areaBurn(world: World, area: AreaState, pos: ReadonlyVec2, seconds: number): number {
  const delivery = areaOf(area.skill);
  if (delivery === null || delivery.pulse <= 0 || !burningUnder(world, area, pos)) return 0;
  const window: number = Math.min(seconds, area.timeLeft);
  if (area.pulseLeft > window) return 0;
  const pulses: number = 1 + Math.floor((window - area.pulseLeft) / delivery.pulse);
  const hit: number = hitOf(world, stokedOffence(area, delivery), area.skill);
  const burn: number = area.skill.burn === null ? 0 : hit * area.skill.burn.share * burnTicks(area.skill);
  return pulses * (hit + burn);
}

export function standingBurn(world: World, pos: ReadonlyVec2, seconds: number): number {
  return heatBurn(world, pos, seconds) + world.areas.reduce((sum: number, area: AreaState): number => sum + areaBurn(world, area, pos, seconds), 0);
}

export function worthTheBurn(world: World, target: MonsterState, swing: SkillDef, reach: number): boolean {
  const player = world.player;
  if (!target.alive || reach > FINISH.meleeReach || player.life < player.maxLife * FINISH.lifeFloor) return false;
  if (distance(player.pos, target.pos) - target.radius > reach) return false;
  const hit: number = expectedHit(player.stats, swing);
  if (hit <= 0) return false;
  const swings: number = Math.ceil(target.life / hit);
  if (swings > FINISH.swings) return false;
  return standingBurn(world, player.pos, swings * skillCycle(player.stats, swing)) <= player.life * FINISH.burnShare;
}
