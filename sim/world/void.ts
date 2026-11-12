import type { ZoneVoid } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Command, Intent, PlayerState, WakeState, World } from './types.ts';

export function beginVoid(world: World): void {
  const rules: ZoneVoid | null = world.zone.void;
  world.wake = rules === null || rules.wake === null ? null : { elapsed: 0, lie: rules.wake.lie, rise: rules.wake.rise };
}

export function wakeProgress(wake: WakeState): number {
  return Math.min(1, Math.max(0, (wake.elapsed - wake.lie) / wake.rise));
}

export function acceptsCommand(world: World, command: Command): boolean {
  if (world.wake !== null) return false;
  return !(world.zone.kind === 'void' && command.type === 'skill');
}

function moved(point: Vec2, by: Vec2): Vec2 {
  return { x: point.x + by.x, z: point.z + by.z };
}

function shiftedIntent(intent: Intent, by: Vec2): Intent {
  return intent.type === 'move' ? { type: 'move', dest: moved(intent.dest, by) } : intent;
}

function shiftedQueue(queued: Command | null, by: Vec2): Command | null {
  return queued !== null && queued.type === 'move' ? { ...queued, dest: moved(queued.dest, by) } : queued;
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
  world.shift = moved(world.shift, by);
}

export function stepVoid(world: World, dt: number): void {
  const wake: WakeState | null = world.wake;
  if (wake !== null) {
    wake.elapsed += dt;
    if (wake.elapsed >= wake.lie + wake.rise) world.wake = null;
  }
  const rules: ZoneVoid | null = world.zone.void;
  if (rules === null) return;
  const home: Vec2 = world.zone.playerStart;
  const offX: number = world.player.pos.x - home.x;
  const offZ: number = world.player.pos.z - home.z;
  const reach: number = rules.span / 2;
  if (Math.abs(offX) > reach || Math.abs(offZ) > reach) shiftWorld(world, { x: -offX, z: -offZ });
}
