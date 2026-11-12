import type { ZoneHud } from '../content/story-types.ts';
import type { HudPart, HudReveal } from '../content/types.ts';
import { HUD_PARTS } from '../content/types.ts';
import { allHold } from './conditions.ts';
import { inMist } from './glitch.ts';
import type { HudShown, World } from './types.ts';

export function hudHidden(world: World): boolean {
  if (inMist(world)) return true;
  const rule: ZoneHud | null = world.zone.hud;
  return rule !== null && !(rule.until.length > 0 && allHold(world, rule.until));
}

export function heldParts(world: World): readonly HudPart[] {
  const shown: HudShown = world.hud;
  if (shown.kind === 'all') return [];
  const rules: readonly HudReveal[] = world.content.world.hudReveal;
  return HUD_PARTS.filter((part: HudPart): boolean => !shown.parts.includes(part) && rules.some((reveal: HudReveal): boolean => reveal.part === part));
}

export function revealHud(world: World): void {
  const shown: HudShown = world.hud;
  if (shown.kind === 'all') return;
  for (const reveal of world.content.world.hudReveal) if (!shown.parts.includes(reveal.part) && allHold(world, reveal.when)) shown.parts.push(reveal.part);
}
