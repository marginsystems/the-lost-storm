import type { VoidShore, ZoneEncounter, ZoneVoid, ZoneWake } from '../content/story-types.ts';
import type { ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { allHold } from './conditions.ts';
import { moveExit } from './exits.ts';
import type { Command, WakeBeat, WakeState, World } from './types.ts';

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
  world.wake = rules === null || rules.wake === null || arrival === 'return' ? null : { elapsed: 0, rate: 1, plan: rules.wake };
  if (rules === null) return;
  world.player.queued = null;
  world.player.held = [];
  world.trail = { x: world.player.pos.x, z: world.player.pos.z };
  world.heading = { x: Math.sin(world.player.facing), z: Math.cos(world.player.facing) };
  world.encounters = [];
  world.shore = null;
  world.shoreBlocks = null;
  for (const [key, value] of Object.entries(rules.sets)) world.flags[key] ??= value;
  if (arrival === 'return') returnToShore(world, rules);
}

export type WakePhase = 'still' | 'stir' | 'rise' | 'settle';

export interface WakeStage {
  readonly phase: WakePhase;
  readonly stir: number;
  readonly rise: number;
  readonly front: number;
  readonly settle: number;
  readonly through: number;
}

export const WAKE_BEATS: readonly WakeBeat[] = ['stir', 'front', 'standing'];

function share(elapsed: number, start: number, length: number): number {
  return Math.min(1, Math.max(0, (elapsed - start) / length));
}

export function wakeLength(plan: ZoneWake): number {
  return plan.still + plan.stir + plan.rise + plan.settle;
}

export function beatAt(plan: ZoneWake, beat: WakeBeat): number {
  const riseAt: number = plan.still + plan.stir;
  const times: Readonly<Record<WakeBeat, number>> = { stir: plan.still, front: riseAt + plan.rise * plan.front, standing: riseAt + plan.rise };
  return times[beat];
}

export function wakeStage(plan: ZoneWake, elapsed: number): WakeStage {
  const riseAt: number = plan.still + plan.stir;
  const settleAt: number = riseAt + plan.rise;
  const frontAt: number = beatAt(plan, 'front');
  const phase: WakePhase = elapsed < plan.still ? 'still' : elapsed < riseAt ? 'stir' : elapsed < settleAt ? 'rise' : 'settle';
  return {
    phase,
    stir: share(elapsed, plan.still, plan.stir),
    rise: share(elapsed, riseAt, plan.rise),
    front: share(elapsed, frontAt, settleAt + plan.settle - frontAt),
    settle: share(elapsed, settleAt, plan.settle),
    through: share(elapsed, 0, wakeLength(plan)),
  };
}

export function beatsBetween(plan: ZoneWake, before: number, after: number): WakeBeat[] {
  return WAKE_BEATS.filter((beat: WakeBeat): boolean => {
    const at: number = beatAt(plan, beat);
    return at > before && at <= after;
  });
}

export function wakeProgress(wake: WakeState): number {
  return wakeStage(wake.plan, wake.elapsed).rise;
}

export function stepWake(world: World, dt: number): void {
  const wake: WakeState | null = world.wake;
  if (wake === null) return;
  const before: number = wake.elapsed;
  wake.elapsed += dt * wake.rate;
  for (const beat of beatsBetween(wake.plan, before, wake.elapsed)) world.events.push({ type: 'wake', beat });
  if (wake.elapsed >= wakeLength(wake.plan)) world.wake = null;
}

const NUDGES: ReadonlySet<Command['type']> = new Set<Command['type']>(['move', 'steer', 'strike', 'slot', 'skill', 'pickup', 'flask', 'use', 'talk']);

export function hurryWake(world: World, command: Command): void {
  const wake: WakeState | null = world.wake;
  if (wake === null || wake.rate > 1 || wake.elapsed < wake.plan.still || !NUDGES.has(command.type)) return;
  wake.rate = Math.max(1, (wakeLength(wake.plan) - wake.elapsed) / wake.plan.hurry);
}

export function acceptsCommand(world: World, command: Command): boolean {
  if (command.type === 'hold' && !command.down) return true;
  if (command.type === 'overlay') return true;
  if (world.wake !== null) return false;
  return !(world.zone.kind === 'void' && command.type === 'skill');
}
