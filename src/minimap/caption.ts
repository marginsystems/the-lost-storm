import type { World } from '../../sim/world/types.ts';
import { monsterLevel } from '../../sim/world/spawn.ts';

export function zoneLevelText(world: World): string | null {
  return world.zone.kind === 'wild' ? `Level ${monsterLevel(world)}` : null;
}
