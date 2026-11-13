import type { MomentChest, MomentDef } from '../content/moment-types.ts';
import type { PropDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Blocker, NavGrid } from '../nav/grid.ts';
import { blockerGap, isWalkable, liftStamp, nearestWalkable, propBlocker, propBlockers, stampBlockers } from '../nav/grid.ts';
import { allHold } from './conditions.ts';
import { gridFor } from './movement.ts';
import type { Actor, MomentState, World } from './types.ts';

export const MOMENT_GROUND = {
  shoveReach: 6,
  tallProp: 1.5,
  sightMargin: 1,
  sightFrom: 1,
  sightStep: 0.1,
} as const;

function propExtent(def: PropDef): number {
  const points: number = Math.max(0, ...def.footprints.flat().map((point): number => Math.hypot(point.x, point.z)));
  return Math.max(points, def.blockLength / 2 + def.blockRadius);
}

export function momentFootprint(world: World, def: MomentDef): number {
  let reach: number = def.radius;
  for (const placed of def.props) {
    const prop: PropDef | undefined = world.content.props.get(placed.prop);
    if (prop !== undefined) reach = Math.max(reach, Math.hypot(placed.x, placed.z) + propExtent(prop));
  }
  return reach;
}

export function tallBlockers(world: World): Blocker[] {
  const list: Blocker[] = [];
  for (const placed of world.zone.props) {
    const def: PropDef | undefined = world.content.props.get(placed.prop);
    if (def === undefined || def.height < MOMENT_GROUND.tallProp || !allHold(world, placed.when)) continue;
    list.push(...propBlockers(def, placed.x + world.shift.x, placed.z + world.shift.z, placed.rotationDegrees));
  }
  return list;
}

export function clearOfTallProps(world: World, def: MomentDef, pos: Vec2): boolean {
  const reach: number = momentFootprint(world, def);
  return tallBlockers(world).every((blocker: Blocker): boolean => blockerGap(blocker, pos.x, pos.z) >= reach);
}

export function inSight(world: World, from: Vec2, to: Vec2): boolean {
  const span: number = Math.hypot(to.x - from.x, to.z - from.z);
  const tall: Blocker[] = tallBlockers(world);
  for (let along: number = MOMENT_GROUND.sightFrom; along < span + MOMENT_GROUND.sightStep; along += MOMENT_GROUND.sightStep) {
    const share: number = Math.min(1, along / span);
    const x: number = from.x + (to.x - from.x) * share;
    const z: number = from.z + (to.z - from.z) * share;
    if (tall.some((blocker: Blocker): boolean => blockerGap(blocker, x, z) < MOMENT_GROUND.sightMargin)) return false;
  }
  return true;
}

export function momentBlockers(world: World, moment: MomentState): Blocker[] {
  const list: Blocker[] = [];
  for (const placed of moment.def.props) {
    if (!placed.blocks) continue;
    const def: PropDef | undefined = world.content.props.get(placed.prop);
    const blocker: Blocker | null = def === undefined ? null : propBlocker(def, moment.pos.x + placed.x, moment.pos.z + placed.z, placed.rotationDegrees);
    if (blocker !== null) list.push(blocker);
  }
  const chest: MomentChest | null = moment.def.chest;
  const box: PropDef | undefined = world.content.props.get(world.content.moments.chest.prop);
  if (moment.chest !== 'none' && chest !== null && box !== undefined) list.push(...propBlockers(box, moment.pos.x + chest.x, moment.pos.z + chest.z, chest.rotationDegrees));
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
