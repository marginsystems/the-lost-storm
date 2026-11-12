import type { VoidShore } from '../content/story-types.ts';
import type { ShoreState, World } from './types.ts';

export function shoreDepth(world: World): number {
  const shore: ShoreState | null = world.shore;
  const rules: VoidShore | null = world.zone.void?.shore ?? null;
  if (shore === null || rules === null) return 0;
  const into: number = (world.player.pos.x - shore.at.x) * shore.facing.x + (world.player.pos.z - shore.at.z) * shore.facing.z;
  return Math.min(1, Math.max(0, into / rules.thin));
}
