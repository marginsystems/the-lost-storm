import type { ReadonlyVec2, Vec2 } from '../../sim/math.ts';
import type { EchoPoint } from '../backend/traces-api.ts';

export const MIST = {
  firstAfter: 6,
  every: 14,
  aheadNear: 18,
  aheadFar: 30,
  side: 8,
  behind: 30,
  shown: 3,
  replay: 0.55,
  hold: 2.4,
  fadeIn: 1.6,
  fadeOut: 1.6,
} as const;

export type Chance = () => number;

export interface Anchor {
  x: number;
  z: number;
}

export interface MistClock {
  tick(dt: number, shown: number, player: ReadonlyVec2, heading: ReadonlyVec2): Anchor | null;
}

export interface ReplayPose {
  readonly pos: Vec2;
  readonly facing: number;
  readonly moving: boolean;
  readonly speed: number;
  readonly fade: number;
}

export function anchorAhead(player: ReadonlyVec2, heading: ReadonlyVec2, chance: Chance): Anchor {
  const size: number = Math.hypot(heading.x, heading.z);
  const forward: Vec2 = size > 0 ? { x: heading.x / size, z: heading.z / size } : { x: 0, z: 1 };
  const ahead: number = MIST.aheadNear + (MIST.aheadFar - MIST.aheadNear) * chance();
  const side: number = (chance() * 2 - 1) * MIST.side;
  return { x: player.x + forward.x * ahead - forward.z * side, z: player.z + forward.z * ahead + forward.x * side };
}

export function createMistClock(chance: Chance): MistClock {
  let wait: number = MIST.firstAfter;
  return {
    tick(dt: number, shown: number, player: ReadonlyVec2, heading: ReadonlyVec2): Anchor | null {
      wait -= dt;
      if (wait > 0 || shown >= MIST.shown) return null;
      wait = MIST.every;
      return anchorAhead(player, heading, chance);
    },
  };
}

export function leftBehind(anchor: Anchor, player: ReadonlyVec2): boolean {
  return Math.hypot(anchor.x - player.x, anchor.z - player.z) > MIST.behind;
}

export function shiftAnchor(anchor: Anchor, by: ReadonlyVec2): void {
  anchor.x += by.x;
  anchor.z += by.z;
}

export function replayLength(points: readonly EchoPoint[], stepSeconds: number): number {
  return (Math.max(1, points.length - 1) * stepSeconds) / MIST.replay;
}

export function replayAt(points: readonly EchoPoint[], stepSeconds: number, anchor: Anchor, time: number): ReplayPose | null {
  const first: EchoPoint | undefined = points[0];
  if (first === undefined) return null;
  const walk: number = replayLength(points, stepSeconds);
  const cycle: number = walk + MIST.hold;
  const local: number = ((time % cycle) + cycle) % cycle;
  const along: number = Math.min(local, walk) * MIST.replay / stepSeconds;
  const index: number = Math.min(points.length - 1, Math.floor(along));
  const from: EchoPoint = points[index] ?? first;
  const to: EchoPoint = points[Math.min(points.length - 1, index + 1)] ?? from;
  const blend: number = Math.min(1, along - index);
  const x: number = from[0] + (to[0] - from[0]) * blend - first[0] + anchor.x;
  const z: number = from[1] + (to[1] - from[1]) * blend - first[1] + anchor.z;
  const stride: number = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const moving: boolean = local < walk && stride > 0.05;
  const fadeIn: number = Math.min(1, local / MIST.fadeIn);
  const fadeOut: number = Math.min(1, (cycle - local) / MIST.fadeOut);
  return { pos: { x, z }, facing: from[2], moving, speed: moving ? (stride / stepSeconds) * MIST.replay : 0, fade: Math.max(0, Math.min(fadeIn, fadeOut)) };
}
