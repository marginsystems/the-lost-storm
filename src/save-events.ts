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
  'flags_changed',
  'waypoint_unlocked',
  'bark',
  'scene_lead',
  'scene_ward',
  'explored',
  'flask_used',
  'flasks_refilled',
  'glitch_start',
  'path_marked',
]);

export function changesSave(events: readonly WorldEvent[]): boolean {
  return events.some((event: WorldEvent): boolean => SAVE_EVENTS.has(event.type));
}

export const URGENT_EVENTS: ReadonlySet<WorldEvent['type']> = new Set<WorldEvent['type']>([
  'level_up',
  'boss_defeated',
  'quest_started',
  'quest_advanced',
  'quest_completed',
  'act_ended',
  'zone_changed',
  'character_changed',
]);

export function urgentEvents(events: readonly WorldEvent[]): boolean {
  return events.some((event: WorldEvent): boolean => URGENT_EVENTS.has(event.type) || (event.type === 'death' && event.team === 'player'));
}
