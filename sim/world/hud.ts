import type { HudPart, ZoneHud } from '../content/story-types.ts';
import { HUD_PARTS } from '../content/story-types.ts';
import { inMist } from './glitch.ts';
import { allHold } from './conditions.ts';
import type { World } from './types.ts';

export function hiddenHudParts(world: World): readonly HudPart[] {
  if (inMist(world)) return HUD_PARTS;
  const rule: ZoneHud | null = world.zone.hud;
  if (rule === null || (rule.until.length > 0 && allHold(world, rule.until))) return [];
  return rule.hide;
}
