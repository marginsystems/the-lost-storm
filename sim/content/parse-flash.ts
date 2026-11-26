import type { Fields } from './read.ts';
import { ContentError, fields, nonNegative, numeric, positive, text } from './read.ts';
import { conditions } from './parse-conditions.ts';
import { storyFlags } from './parse-story.ts';
import type { Condition } from './condition-types.ts';
import type { FlashThreshold, StoryFlags, ZoneFlash } from './story-types.ts';
import type { ZoneDef } from './zone-types.ts';

function threshold(value: unknown, where: string): FlashThreshold | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where), radius: positive(source, 'radius', where) };
}

function playsOnce(when: readonly Condition[], sets: StoryFlags): boolean {
  return when.some((condition: Condition): boolean => condition.type === 'flag' && condition.not && condition.is === null && sets[condition.flag] !== undefined);
}

export function zoneFlash(value: unknown, where: string): ZoneFlash | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const when: Condition[] = conditions(source, 'when', where);
  const sets: StoryFlags = storyFlags(source['sets'], `${where}.sets`);
  const seconds: number = positive(source, 'seconds', where);
  const seam: number = positive(source, 'seam', where);
  if (seam >= seconds) throw new ContentError(`${where}.seam`, 'the seam must start before the flash runs out');
  if (!playsOnce(when, sets)) throw new ContentError(`${where}.when`, 'a flash plays once: it must wait on a flag it sets');
  return {
    from: text(source, 'from', where),
    when,
    calm: nonNegative(source, 'calm', where),
    seconds,
    seam,
    threshold: threshold(source['threshold'], `${where}.threshold`),
    into: text(source, 'into', where),
    sets,
  };
}

export function flashProblems(at: string, zone: ZoneDef, zones: ReadonlyMap<string, ZoneDef>): string[] {
  const flash: ZoneFlash | null = zone.flash;
  if (flash === null) return [];
  const problems: string[] = [];
  if (!zones.has(flash.from) || flash.from === zone.id) problems.push(`${at} flash starts from ${flash.from}, which is not another zone`);
  if (!zones.has(flash.into) || flash.into === zone.id) problems.push(`${at} flash tears into ${flash.into}, which is not another zone`);
  else if (zones.get(flash.into)?.flash !== null) problems.push(`${at} flash tears into ${flash.into}, which is a flash itself`);
  return problems;
}
