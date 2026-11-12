import type { World } from './types.ts';

export function attacksHeld(world: World): boolean {
  return world.time < world.glitch.holdUntil;
}
