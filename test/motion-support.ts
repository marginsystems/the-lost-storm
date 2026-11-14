import type { ZoneDef, ZoneProp } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { distance } from '../sim/math.ts';
import type { ActorState } from '../sim/world/types.ts';

export const MOTION_DT: number = 1 / 60;

const DT: number = MOTION_DT;

const LIMITS = {
  reversalAngle: 2,
  reversalsAllowed: 1,
  visibleStep: 0.005,
  window: 0.5,
  vibrationNet: 0.1,
  flickerSteps: 6,
} as const;

export interface MotionSample {
  readonly pos: Vec2;
  readonly facing: number;
  readonly moving: boolean;
  readonly free: boolean;
}

type Sample = MotionSample;

export interface TestScene {
  readonly tiles: readonly string[];
  readonly props: readonly ZoneProp[];
  readonly start: Vec2;
}

export function sceneZone(base: ZoneDef, id: string, scene: TestScene): ZoneDef {
  return { ...base, id, tiles: scene.tiles, props: scene.props, packs: [], npcs: [], exits: [], checkpoints: [], waypoint: null, voices: [], surge: null, ranks: false, playerStart: { x: scene.start.x, z: scene.start.z } };
}

export function placedProp(prop: string, x: number, z: number): ZoneProp {
  return { prop, x, z, y: 0, rotationDegrees: 0, when: [] };
}

export function sampleOf(actor: ActorState, wasActing: boolean): MotionSample {
  const free: boolean = actor.alive && actor.action === null && !wasActing && actor.stagger <= 0 && actor.knock.x === 0 && actor.knock.z === 0;
  return { pos: { x: actor.pos.x, z: actor.pos.z }, facing: actor.facing, moving: actor.moving, free };
}

function angleBetween(a: number, b: number): number {
  let delta: number = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

function headingOf(from: Vec2, to: Vec2): number | null {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  return Math.hypot(dx, dz) < LIMITS.visibleStep ? null : Math.atan2(dx, dz);
}

export function worstTurnRate(samples: readonly Sample[]): number {
  let worst: number = 0;
  for (let index: number = 1; index < samples.length; index += 1) {
    const before: Sample | undefined = samples[index - 1];
    const after: Sample | undefined = samples[index];
    if (before === undefined || after === undefined || !before.free || !after.free) continue;
    worst = Math.max(worst, angleBetween(before.facing, after.facing) / DT);
  }
  return worst;
}

export function reversals(samples: readonly Sample[]): number {
  let count: number = 0;
  let lastHeading: number | null = null;
  for (let index: number = 1; index < samples.length; index += 1) {
    const before: Sample | undefined = samples[index - 1];
    const after: Sample | undefined = samples[index];
    if (before === undefined || after === undefined || !before.free || !after.free) {
      lastHeading = null;
      continue;
    }
    const heading: number | null = headingOf(before.pos, after.pos);
    if (heading === null) {
      lastHeading = null;
      continue;
    }
    if (lastHeading !== null && angleBetween(lastHeading, heading) > LIMITS.reversalAngle) count += 1;
    lastHeading = heading;
  }
  return count;
}

export function vibratingWindows(samples: readonly Sample[]): number {
  const span: number = Math.round(LIMITS.window / DT);
  let count: number = 0;
  for (let start: number = 0; start + span < samples.length; start += span) {
    const window: Sample[] = samples.slice(start, start + span + 1);
    if (!window.every((entry: Sample): boolean => entry.free && entry.moving)) continue;
    const first: Sample | undefined = window[0];
    const last: Sample | undefined = window.at(-1);
    if (first !== undefined && last !== undefined && distance(first.pos, last.pos) < LIMITS.vibrationNet) count += 1;
  }
  return count;
}

export function flickers(samples: readonly Sample[]): number {
  let count: number = 0;
  let runLength: number = 0;
  let state: boolean | null = null;
  let changes: number = 0;
  for (const entry of samples) {
    if (!entry.free) {
      state = null;
      runLength = 0;
      changes = 0;
      continue;
    }
    if (entry.moving === state) {
      runLength += 1;
      continue;
    }
    if (state !== null && changes > 0 && runLength < LIMITS.flickerSteps) count += 1;
    if (state !== null) changes += 1;
    state = entry.moving;
    runLength = 1;
  }
  return count;
}

export function motionProblems(label: string, samples: readonly MotionSample[], turnLimit: number): string[] {
  const problems: string[] = [];
  const turn: number = worstTurnRate(samples);
  if (turn > turnLimit) problems.push(`${label} turned at ${turn.toFixed(1)} rad/s`);
  const reversed: number = reversals(samples);
  if (reversed > LIMITS.reversalsAllowed) problems.push(`${label} reversed direction ${reversed} times`);
  const vibrating: number = vibratingWindows(samples);
  if (vibrating > 0) problems.push(`${label} ran in place for ${vibrating} windows`);
  const flicker: number = flickers(samples);
  if (flicker > 0) problems.push(`${label} flickered between running and standing ${flicker} times`);
  return problems;
}
