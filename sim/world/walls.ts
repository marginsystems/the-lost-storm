import type { AreaDelivery } from '../content/shape-types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { areaOf } from './areas.ts';
import type { Actor, ActorState, AreaState, World } from './types.ts';

interface Wall {
  readonly area: AreaState;
  readonly delivery: AreaDelivery;
}

function sideOf(area: AreaState, pos: ReadonlyVec2): number {
  return (pos.x - area.pos.x) * area.toward.z - (pos.z - area.pos.z) * area.toward.x;
}

function alongOf(area: AreaState, pos: ReadonlyVec2): number {
  return (pos.x - area.pos.x) * area.toward.x + (pos.z - area.pos.z) * area.toward.z;
}

export function crossesWall(area: AreaState, from: ReadonlyVec2, to: ReadonlyVec2, radius: number): boolean {
  const before: number = sideOf(area, from);
  const after: number = sideOf(area, to);
  if (before === 0 || Math.sign(before) === Math.sign(after)) return false;
  const share: number = before / (before - after);
  const at: Vec2 = { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share };
  const along: number = alongOf(area, at);
  return along >= -radius && along <= area.reach + radius;
}

function wallsOf(world: World): Wall[] {
  return world.areas.flatMap((area: AreaState): Wall[] => {
    const delivery: AreaDelivery | null = areaOf(area.skill);
    return delivery !== null && delivery.blocks && area.reach > 0 && area.timeLeft > 0 ? [{ area, delivery }] : [];
  });
}

export function holdBehindWalls(world: World, starts: ReadonlyMap<ActorState, Vec2>): void {
  const walls: Wall[] = wallsOf(world);
  if (walls.length === 0) return;
  const actors: readonly Actor[] = [...world.heroes, ...world.monsters];
  for (const actor of actors) {
    const from: Vec2 | undefined = starts.get(actor);
    if (from === undefined || !actor.alive) continue;
    const held: boolean = walls.some((wall: Wall): boolean => wall.area.offence.team !== actor.kind && crossesWall(wall.area, from, actor.pos, actor.radius));
    if (!held) continue;
    actor.pos.x = from.x;
    actor.pos.z = from.z;
    actor.knock.x = 0;
    actor.knock.z = 0;
  }
}
