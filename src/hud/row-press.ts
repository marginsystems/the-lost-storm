import type { Command, World } from '../../sim/world/types.ts';

export function rowPress(world: Pick<World, 'dialogue'>): Command | null {
  return world.dialogue === null ? null : { type: 'advance' };
}
