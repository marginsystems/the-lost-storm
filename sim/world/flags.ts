import type { StoryFlags } from '../content/story-types.ts';
import type { ActDef } from '../content/types.ts';
import { allHold } from './conditions.ts';
import type { World, WorldEvent } from './types.ts';

export function endedActs(world: World): Set<string> {
  return new Set<string>(world.content.world.acts.filter((act: ActDef): boolean => act.end !== null && allHold(world, act.end.when)).map((act: ActDef): string => act.id));
}

export function reportEndedActs(world: World, before: ReadonlySet<string>): void {
  for (const act of endedActs(world)) {
    if (before.has(act) || world.events.some((event: WorldEvent): boolean => event.type === 'act_ended' && event.act === act)) continue;
    world.events.push({ type: 'act_ended', act });
  }
}

export function writeFlags(world: World, sets: StoryFlags): boolean {
  const keys: string[] = Object.keys(sets).filter((key: string): boolean => sets[key] !== undefined && world.flags[key] !== sets[key]);
  if (keys.length === 0) return false;
  const before: Set<string> = endedActs(world);
  for (const key of keys) {
    const value: string | undefined = sets[key];
    if (value !== undefined) world.flags[key] = value;
  }
  reportEndedActs(world, before);
  return true;
}
