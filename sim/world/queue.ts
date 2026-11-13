import { directionOf } from '../math.ts';
import type { Vec2 } from '../math.ts';
import type { MonsterState, World } from './types.ts';

export const QUEUE = {
  squarely: 0.7,
} as const;

export function roomAhead(world: World, monster: MonsterState, heading: number): number {
  const dir: Vec2 = directionOf(heading);
  let room: number = Number.POSITIVE_INFINITY;
  for (const other of world.monsters) {
    if (other === monster || !other.alive) continue;
    const dx: number = other.pos.x - monster.pos.x;
    const dz: number = other.pos.z - monster.pos.z;
    const along: number = dx * dir.x + dz * dir.z;
    if (along <= 0) continue;
    const contact: number = monster.radius + other.radius;
    const side: number = Math.abs(dx * dir.z - dz * dir.x);
    if (side >= contact * QUEUE.squarely) continue;
    room = Math.min(room, Math.max(0, along - Math.sqrt(contact * contact - side * side)));
  }
  return room;
}
