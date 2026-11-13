import type { ShoreProp, VoidShore } from '../content/story-types.ts';
import type { PropDef } from '../content/types.ts';
import type { Blocker } from '../nav/grid.ts';
import { liftStamp, propBlockers, stampBlockers } from '../nav/grid.ts';
import { standClear } from './moment-ground.ts';
import type { ShoreState, World } from './types.ts';

const DEGREES: number = 180 / Math.PI;

export function shorePlacements(world: World): ShoreProp[] {
  const shore: ShoreState | null = world.shore;
  const rules: VoidShore | null = world.zone.void?.shore ?? null;
  if (shore === null || rules === null) return [];
  const turn: number = Math.atan2(shore.facing.x, shore.facing.z) * DEGREES;
  return rules.props.map((placed: ShoreProp): ShoreProp => ({
    prop: placed.prop,
    x: shore.at.x + shore.facing.z * placed.x + shore.facing.x * placed.z,
    z: shore.at.z - shore.facing.x * placed.x + shore.facing.z * placed.z,
    rotationDegrees: placed.rotationDegrees + turn,
  }));
}

export function shoreBlockers(world: World): Blocker[] {
  return shorePlacements(world).flatMap((placed: ShoreProp): Blocker[] => {
    const def: PropDef | undefined = world.content.props.get(placed.prop);
    return def === undefined ? [] : propBlockers(def, placed.x, placed.z, placed.rotationDegrees);
  });
}

export function raiseShore(world: World): void {
  if (world.shore === null || world.shoreBlocks !== null) return;
  world.shoreBlocks = stampBlockers(world.grid, shoreBlockers(world), world.content.player.radius);
  standClear(world, world.player);
}

export function lowerShore(world: World): void {
  if (world.shoreBlocks === null) return;
  liftStamp(world.grid, world.shoreBlocks);
  world.shoreBlocks = null;
}
