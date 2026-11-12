import type { ZoneHud } from '../content/story-types.ts';
import { allHold } from './conditions.ts';
import type { World } from './types.ts';

export function hudHidden(world: World): boolean {
  const rule: ZoneHud | null = world.zone.hud;
  return rule !== null && !(rule.until.length > 0 && allHold(world, rule.until));
}
