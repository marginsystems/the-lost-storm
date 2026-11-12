import type { WorldEvent } from '../sim/world/types.ts';

export const SAVE_EVENTS: ReadonlySet<WorldEvent['type']> = new Set<WorldEvent['type']>([
  'character_changed',
  'level_up',
  'pickup',
  'surge',
  'xp',
  'zone_changed',
  'player_respawn',
  'checkpoint',
  'dialogue_closed',
  'quest_started',
  'quest_advanced',
  'quest_completed',
  'waypoint_unlocked',
  'bark',
  'explored',
]);

export function changesSave(events: readonly WorldEvent[]): boolean {
  return events.some((event: WorldEvent): boolean => SAVE_EVENTS.has(event.type));
}
