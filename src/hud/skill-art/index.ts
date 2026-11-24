import { CORE_ART } from './core.ts';
import { HEARTH_ART } from './hearth.ts';
import { artInstance } from './instance.ts';
import { SHADOW_ART } from './shadow.ts';
import { STORM_ART } from './storm.ts';
import { TIDE_ART } from './tide.ts';

export const SKILL_ART: ReadonlyMap<string, string> = new Map<string, string>([...CORE_ART, ...STORM_ART, ...TIDE_ART, ...HEARTH_ART, ...SHADOW_ART]);

export function skillArt(id: string): string | null {
  const art: string | undefined = SKILL_ART.get(id);
  return art === undefined ? null : artInstance(art);
}
