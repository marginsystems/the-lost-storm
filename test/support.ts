import type { Content, ZoneDef } from '../sim/content/types.ts';
import { refreshPlayer } from '../sim/world/character.ts';
import { createWorld } from '../sim/world/create.ts';
import { setGlitchesEnabled } from '../sim/world/glitch.ts';
import type { World } from '../sim/world/types.ts';
import { enterZone } from '../sim/world/zones.ts';

export function must<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${label}`);
  return value;
}

export function zoneOf(content: Content, zoneId: string): ZoneDef {
  return must(content.zones.get(zoneId), `zone ${zoneId}`);
}

export function finishQuests(world: World): World {
  for (const quest of world.content.quests.values()) world.quests[quest.id] = quest.objectives.length;
  return world;
}

export function withoutGlitches(world: World): World {
  setGlitchesEnabled(world, false);
  return world;
}

export function worldIn(content: Content, zoneId: string, seed: number): World {
  const world: World = createWorld(content, { seed, save: null });
  enterZone(world, zoneOf(content, zoneId), { type: 'start' });
  world.events = [];
  return world;
}

export const CLASSIC_BAR: readonly (string | null)[] = ['cleave', 'thunderclap', 'storm_bolt', null, null, 'dodge_roll'];

export function armed(world: World): World {
  for (const skill of CLASSIC_BAR) if (skill !== null && !world.player.learned.includes(skill)) world.player.learned.push(skill);
  world.player.bar = [...CLASSIC_BAR];
  refreshPlayer(world);
  world.events = [];
  return world;
}
