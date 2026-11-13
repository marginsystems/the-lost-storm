import type { ChestRules, MomentChest } from '../content/moment-types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { dropOnGround } from './ground.ts';
import type { MomentState, World } from './types.ts';

export function goldScale(world: World, moment: MomentState): number {
  return (1 + world.content.world.scaling.xpPerLevel * (moment.level - 1)) * (1 + world.player.stats.goldFind);
}

export function chestSpot(moment: MomentState): Vec2 | null {
  const chest: MomentChest | null = moment.def.chest;
  return chest === null ? null : { x: moment.pos.x + chest.x, z: moment.pos.z + chest.z };
}

function closedChest(moment: MomentState): boolean {
  return moment.phase === 'awake' && moment.chest === 'closed';
}

export function chestOf(world: World, momentId: number): MomentState | null {
  return world.moments.find((moment: MomentState): boolean => moment.id === momentId && closedChest(moment)) ?? null;
}

export function chestNear(world: World, point: Vec2): MomentState | null {
  const rules: ChestRules = world.content.moments.chest;
  const pick: number = (world.content.props.get(rules.prop)?.blockRadius ?? 0) + world.content.player.radius;
  return world.moments.find((moment: MomentState): boolean => {
    const spot: Vec2 | null = chestSpot(moment);
    return closedChest(moment) && spot !== null && distance(point, spot) <= pick;
  }) ?? null;
}

export function chestReach(world: World): number {
  const rules: ChestRules = world.content.moments.chest;
  return rules.reach + (world.content.props.get(rules.prop)?.blockRadius ?? 0);
}

export function openChest(world: World, moment: MomentState): void {
  const chest: MomentChest | null = moment.def.chest;
  const spot: Vec2 | null = chestSpot(moment);
  if (!closedChest(moment) || chest === null || spot === null) return;
  const gold: number = Math.round(world.rng.int(chest.goldMin, chest.goldMax) * goldScale(world, moment));
  moment.chest = 'opening';
  moment.timeLeft = world.content.moments.chest.open;
  if (gold > 0) dropOnGround(world, spot, { kind: 'gold', amount: gold });
  world.events.push({ type: 'chest_opened', moment, pos: spot, gold });
}
