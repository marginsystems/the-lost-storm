import type { PropDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Blocker, NavGrid } from '../nav/grid.ts';
import { isWalkable, liftStamp, nearestWalkable, propBlocker, stampBlockers } from '../nav/grid.ts';
import { gridFor } from './movement.ts';
import type { Actor, MomentState, World } from './types.ts';

export const MOMENT_GROUND = {
  shoveReach: 6,
} as const;

export function momentBlockers(world: World, moment: MomentState): Blocker[] {
  const list: Blocker[] = [];
  for (const placed of moment.def.props) {
    const def: PropDef | undefined = world.content.props.get(placed.prop);
    const blocker: Blocker | null = def === undefined ? null : propBlocker(def, moment.pos.x + placed.x, moment.pos.z + placed.z, placed.rotationDegrees);
    if (blocker !== null) list.push(blocker);
  }
  return list;
}

export function standClear(world: World, actor: Actor): void {
  const grid: NavGrid = gridFor(world, actor);
  if (isWalkable(grid, actor.pos.x, actor.pos.z)) return;
  const free: Vec2 | null = nearestWalkable(grid, actor.pos, MOMENT_GROUND.shoveReach);
  if (free === null) return;
  actor.pos.x = free.x;
  actor.pos.z = free.z;
}

export function raiseProps(world: World, moment: MomentState): void {
  if (moment.blocks !== null) return;
  const blockers: Blocker[] = momentBlockers(world, moment);
  if (blockers.length === 0) return;
  moment.blocks = stampBlockers(world.grid, blockers, world.content.player.radius);
  standClear(world, world.player);
  for (const monster of world.monsters) if (monster.alive) standClear(world, monster);
}

export function lowerProps(world: World, moment: MomentState): void {
  if (moment.blocks === null) return;
  liftStamp(world.grid, moment.blocks);
  moment.blocks = null;
}
