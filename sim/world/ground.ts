import type { Vec2 } from '../math.ts';
import { nearestWalkable } from '../nav/grid.ts';
import type { GroundItem, World } from './types.ts';

const GROUND = {
  scatterMin: 0.9,
  scatterMax: 2.1,
  snapRadius: 4,
} as const;

export function dropOnGround(world: World, from: Vec2, content: GroundItem['content']): GroundItem {
  const angle: number = world.rng.range(0, Math.PI * 2);
  const reach: number = world.rng.range(GROUND.scatterMin, GROUND.scatterMax);
  const wanted: Vec2 = { x: from.x + Math.cos(angle) * reach, z: from.z + Math.sin(angle) * reach };
  const pos: Vec2 = nearestWalkable(world.grid, wanted, GROUND.snapRadius) ?? { x: from.x, z: from.z };
  const ground: GroundItem = { id: world.nextId, pos, from: { x: from.x, z: from.z }, content, age: 0 };
  world.nextId += 1;
  world.ground.push(ground);
  world.events.push({ type: 'drop', ground });
  return ground;
}

export function removeGround(world: World, groundId: number): void {
  world.ground = world.ground.filter((ground: GroundItem): boolean => ground.id !== groundId);
}
