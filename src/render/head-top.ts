import type { Object3D } from 'three';
import { Vector3 } from 'three';

export const HEAD_TOP = {
  minCrown: 0.04,
  maxCrown: 0.25,
  gap: 0.14,
  follow: 9,
  restDistance: 0.0005,
  restSpeed: 0.005,
} as const;

export interface HeadTop {
  readonly bone: Object3D | null;
  readonly crown: number;
}

export interface HeadFollow {
  rise: number;
  speed: number;
  started: boolean;
}

export type HeadReader = (dt: number) => number;

const spot: Vector3 = new Vector3();

export function measureHeadTop(root: Object3D, bone: Object3D | null, height: number): HeadTop {
  if (bone === null) return { bone: null, crown: 0 };
  root.updateMatrixWorld(true);
  const base: number = root.getWorldPosition(spot).y;
  const rest: number = bone.getWorldPosition(spot).y - base;
  return { bone, crown: Math.min(height * HEAD_TOP.maxCrown, Math.max(height * HEAD_TOP.minCrown, height - rest)) };
}

export function headRise(top: HeadTop, root: Object3D, height: number): number {
  if (top.bone === null) return height;
  const base: number = root.getWorldPosition(spot).y;
  return top.bone.getWorldPosition(spot).y + top.crown - base;
}

export function createHeadFollow(): HeadFollow {
  return { rise: 0, speed: 0, started: false };
}

export function followHead(follow: HeadFollow, rise: number, dt: number): number {
  if (!follow.started) {
    follow.rise = rise;
    follow.speed = 0;
    follow.started = true;
    return rise;
  }
  if (dt <= 0) return follow.rise;
  const omega: number = HEAD_TOP.follow;
  const offset: number = follow.rise - rise;
  const decay: number = Math.exp(-omega * dt);
  const slope: number = follow.speed + omega * offset;
  follow.rise = rise + (offset + slope * dt) * decay;
  follow.speed = (follow.speed - omega * slope * dt) * decay;
  if (Math.abs(follow.rise - rise) < HEAD_TOP.restDistance && Math.abs(follow.speed) < HEAD_TOP.restSpeed) {
    follow.rise = rise;
    follow.speed = 0;
  }
  return follow.rise;
}

export function headReader(root: Object3D, bone: Object3D | null, height: number): HeadReader {
  const top: HeadTop = measureHeadTop(root, bone, height);
  const follow: HeadFollow = createHeadFollow();
  return (dt: number): number => followHead(follow, headRise(top, root, height), dt);
}
