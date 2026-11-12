import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { EchoPoint } from '../backend/traces-api.ts';

export const RECORDER = {
  stepSeconds: 0.25,
  points: 24,
  minTravel: 6,
  restSeconds: 90,
  positionScale: 10,
  facingScale: 100,
} as const;

export interface EchoTake {
  readonly zone: string;
  readonly points: readonly EchoPoint[];
}

export interface RecorderFrame {
  readonly zone: string;
  readonly pos: ReadonlyVec2;
  readonly facing: number;
  readonly shift: ReadonlyVec2;
}

export interface EchoRecorder {
  step(dt: number, frame: RecorderFrame): EchoTake | null;
}

interface Take {
  readonly zone: string;
  readonly shift: ReadonlyVec2;
  readonly points: EchoPoint[];
  clock: number;
}

function rounded(value: number, scale: number): number {
  return Math.round(value * scale) / scale;
}

function wrapped(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function travel(points: readonly EchoPoint[]): number {
  let total: number = 0;
  for (let index: number = 1; index < points.length; index += 1) {
    const from: EchoPoint | undefined = points[index - 1];
    const to: EchoPoint | undefined = points[index];
    if (from !== undefined && to !== undefined) total += Math.hypot(to[0] - from[0], to[1] - from[1]);
  }
  return total;
}

export function createEchoRecorder(): EchoRecorder {
  let take: Take | null = null;
  let rest: number = 0;

  const point = (frame: RecorderFrame, started: Take): EchoPoint => [
    rounded(frame.pos.x - (frame.shift.x - started.shift.x), RECORDER.positionScale),
    rounded(frame.pos.z - (frame.shift.z - started.shift.z), RECORDER.positionScale),
    rounded(wrapped(frame.facing), RECORDER.facingScale),
  ];

  return {
    step(dt: number, frame: RecorderFrame): EchoTake | null {
      if (rest > 0) {
        rest -= dt;
        return null;
      }
      if (take === null || take.zone !== frame.zone) {
        take = { zone: frame.zone, shift: { x: frame.shift.x, z: frame.shift.z }, points: [], clock: 0 };
        take.points.push(point(frame, take));
        return null;
      }
      take.clock += dt;
      while (take.clock >= RECORDER.stepSeconds && take.points.length < RECORDER.points) {
        take.clock -= RECORDER.stepSeconds;
        take.points.push(point(frame, take));
      }
      if (take.points.length < RECORDER.points) return null;
      const done: Take = take;
      take = null;
      if (travel(done.points) < RECORDER.minTravel) return null;
      rest = RECORDER.restSeconds;
      return { zone: done.zone, points: done.points };
    },
  };
}
