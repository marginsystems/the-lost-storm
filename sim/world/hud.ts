import type { HudPart, ZoneHud } from '../content/story-types.ts';
import { allHold } from './conditions.ts';
import type { World } from './types.ts';

export function hiddenHudParts(world: World): readonly HudPart[] {
  const rule: ZoneHud | null = world.zone.hud;
  if (rule === null || (rule.until.length > 0 && allHold(world, rule.until))) return [];
  return rule.hide;
}
