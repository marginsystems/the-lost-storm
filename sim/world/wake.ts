import type { VoidShore, ZoneEncounter, ZoneVoid } from '../content/story-types.ts';
import type { ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { allHold } from './conditions.ts';
import { moveExit } from './exits.ts';
import type { Command, WakeState, World } from './types.ts';

export type VoidArrival = 'first' | 'return';

const RETURN = {
  exitGap: 2,
  inland: 16,
} as const;

function exitBehind(world: World, met: ZoneEncounter, back: Vec2): void {
  if (met.find.type !== 'exit' || !allHold(world, met.when)) return;
  const exitId: string = met.find.exit;
  const exit: ZoneExit | undefined = world.zone.exits.find((entry: ZoneExit): boolean => entry.id === exitId);
  if (exit === undefined) return;
  const away: number = exit.radius + RETURN.exitGap;
  const pos: Vec2 = { x: world.player.pos.x + back.x * away, z: world.player.pos.z + back.z * away };
  moveExit(world, exitId, pos);
  world.encounters.push({ id: met.id, walked: 0, moving: 0, pos, off: 0, groundId: null });
}

function returnToShore(world: World, rules: ZoneVoid): void {
  const shore: VoidShore | null = rules.shore;
  if (shore === null || !allHold(world, shore.when)) return;
  const back: Vec2 = { x: -world.heading.x, z: -world.heading.z };
  const inland: number = shore.thin + RETURN.inland;
  world.shore = { at: { x: world.player.pos.x - back.x * inland, z: world.player.pos.z - back.z * inland }, facing: back };
  for (const met of rules.encounters) exitBehind(world, met, back);
}

export function beginVoid(world: World, arrival: VoidArrival): void {
  const rules: ZoneVoid | null = world.zone.void;
  world.wake = rules === null || rules.wake === null || arrival === 'return' ? null : { elapsed: 0, lie: rules.wake.lie, rise: rules.wake.rise };
  if (rules === null) return;
  world.player.queued = null;
  world.player.held = [];
  world.trail = { x: world.player.pos.x, z: world.player.pos.z };
  world.heading = { x: Math.sin(world.player.facing), z: Math.cos(world.player.facing) };
  world.encounters = [];
  world.shore = null;
  for (const [key, value] of Object.entries(rules.sets)) world.flags[key] ??= value;
  if (arrival === 'return') returnToShore(world, rules);
}

export function wakeProgress(wake: WakeState): number {
  return Math.min(1, Math.max(0, (wake.elapsed - wake.lie) / wake.rise));
}

export function acceptsCommand(world: World, command: Command): boolean {
  if (command.type === 'hold' && !command.down) return true;
  if (command.type === 'overlay') return true;
  if (world.wake !== null) return false;
  return !(world.zone.kind === 'void' && command.type === 'skill');
}
