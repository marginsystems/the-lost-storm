import type { VoidShore, ZoneVoid } from '../content/story-types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { allHold } from './conditions.ts';
import { stepEncounters } from './encounters.ts';
import { moveExit } from './exits.ts';
import { EXPLORE, shiftExplored } from './exploration.ts';
import { shiftMoments } from './moments.ts';
import { lowerShore, raiseShore } from './shore-props.ts';
import type { Command, Intent, PlayerState, World } from './types.ts';
import { stepWake } from './wake.ts';

function moved(point: Vec2, by: Vec2): Vec2 {
  return { x: point.x + by.x, z: point.z + by.z };
}

function shiftedIntent(intent: Intent, by: Vec2): Intent {
  return intent.type === 'move' ? { type: 'move', dest: moved(intent.dest, by) } : intent;
}

function shiftedQueue(queued: Command | null, by: Vec2): Command | null {
  return queued !== null && (queued.type === 'move' || queued.type === 'walk') ? { ...queued, dest: moved(queued.dest, by) } : queued;
}

export function shiftWorld(world: World, by: Vec2): void {
  const player: PlayerState = world.player;
  player.pos = moved(player.pos, by);
  player.path = player.path.map((point: Vec2): Vec2 => moved(point, by));
  player.intent = shiftedIntent(player.intent, by);
  player.queued = shiftedQueue(player.queued, by);
  for (const ground of world.ground) {
    ground.pos = moved(ground.pos, by);
    ground.from = moved(ground.from, by);
  }
  for (const state of world.encounters) if (state.pos !== null) state.pos = moved(state.pos, by);
  lowerShore(world);
  if (world.shore !== null) world.shore = { at: moved(world.shore.at, by), facing: world.shore.facing };
  for (const exit of world.zone.exits) moveExit(world, exit.id, moved(exit, by));
  shiftMoments(world, by);
  shiftExplored(world, by);
  world.trail = moved(world.trail, by);
  world.shift = moved(world.shift, by);
  raiseShore(world);
}

function placeShore(world: World, rules: ZoneVoid): void {
  const shore: VoidShore | null = rules.shore;
  if (shore === null || world.shore !== null || world.wake !== null || !allHold(world, shore.when)) return;
  const facing: Vec2 = { x: world.heading.x, z: world.heading.z };
  world.shore = { at: { x: world.player.pos.x + facing.x * shore.ahead, z: world.player.pos.z + facing.z * shore.ahead }, facing };
}

function steer(world: World, rules: ZoneVoid, dt: number): number {
  const pos: Vec2 = world.player.pos;
  const travelled: number = distance(pos, world.trail);
  if (travelled > 0) {
    const blend: number = 1 - Math.exp(-rules.heading * dt);
    const x: number = world.heading.x + ((pos.x - world.trail.x) / travelled - world.heading.x) * blend;
    const z: number = world.heading.z + ((pos.z - world.trail.z) / travelled - world.heading.z) * blend;
    const size: number = Math.hypot(x, z);
    if (size > 0) world.heading = { x: x / size, z: z / size };
  }
  world.trail = { x: pos.x, z: pos.z };
  return travelled;
}

export function stepVoid(world: World, dt: number): void {
  stepWake(world, dt);
  const rules: ZoneVoid | null = world.zone.void;
  if (rules === null) return;
  const zone: string = world.zone.id;
  stepEncounters(world, rules, steer(world, rules, dt), dt);
  placeShore(world, rules);
  raiseShore(world);
  if (world.zone.id !== zone) return;
  const home: Vec2 = world.zone.playerStart;
  const offX: number = world.player.pos.x - home.x;
  const offZ: number = world.player.pos.z - home.z;
  const reach: number = rules.span / 2;
  if (Math.abs(offX) > reach || Math.abs(offZ) > reach) shiftWorld(world, { x: -Math.round(offX / EXPLORE.cellSize) * EXPLORE.cellSize, z: -Math.round(offZ / EXPLORE.cellSize) * EXPLORE.cellSize });
}
