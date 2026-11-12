import type { ZoneVoid } from '../content/story-types.ts';
import type { Command, WakeState, World } from './types.ts';

export function beginVoid(world: World): void {
  const rules: ZoneVoid | null = world.zone.void;
  world.wake = rules === null || rules.wake === null ? null : { elapsed: 0, lie: rules.wake.lie, rise: rules.wake.rise };
  if (rules === null) return;
  world.player.queued = null;
  world.trail = { x: world.player.pos.x, z: world.player.pos.z };
  world.heading = { x: Math.sin(world.player.facing), z: Math.cos(world.player.facing) };
  world.encounters = [];
  for (const [key, value] of Object.entries(rules.sets)) world.flags[key] ??= value;
}

export function wakeProgress(wake: WakeState): number {
  return Math.min(1, Math.max(0, (wake.elapsed - wake.lie) / wake.rise));
}

export function acceptsCommand(world: World, command: Command): boolean {
  if (world.wake !== null) return false;
  return !(world.zone.kind === 'void' && command.type === 'skill');
}
