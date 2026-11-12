import type { PerspectiveCamera, Vector2 } from 'three';
import { Plane, Raycaster, Vector3 } from 'three';
import type { ElementSize } from './element-size.ts';
import { watchSize } from './element-size.ts';

export const CAMERA = {
  fov: 30,
  yawDegrees: 45,
  pitchDegrees: 50,
  distance: 28,
  minDistance: 9,
  maxDistance: 50,
  zoomStep: 0.0016,
  zoomRate: 9,
  followRate: 11,
  lookHeight: 1.1,
  traumaDecay: 1.9,
  shakeDistance: 0.85,
  shakeRoll: 0.018,
  shakeFrequency: 31,
  punchDecay: 14,
  settled: 0.05,
} as const;

export interface ShotPose {
  readonly distance: number;
  readonly pitchDegrees: number;
  readonly yawDegrees: number;
  readonly lookHeight: number;
  readonly fitWidth: number;
}

export interface CameraShot {
  readonly pose: ShotPose;
  readonly blend: number;
  readonly swayX: number;
  readonly swayY: number;
}

export interface IsoCamera {
  update(dt: number, targetX: number, targetZ: number): void;
  snap(targetX: number, targetZ: number): void;
  shift(byX: number, byZ: number): void;
  frame(shot: CameraShot | null): void;
  zoomBy(wheelDelta: number): void;
  addTrauma(amount: number): void;
  punch(dirX: number, dirZ: number, amount: number): void;
  groundPoint(pointer: Vector2): Vector3 | null;
  rayDistanceTo(pointer: Vector2, bottom: Vector3, height: number): number;
  project(x: number, y: number, z: number, out: Vector2): boolean;
}

function noise(time: number, seed: number): number {
  return Math.sin(time * 1.0 + seed * 12.9) * 0.5 + Math.sin(time * 2.3 + seed * 78.2) * 0.3 + Math.sin(time * 4.1 + seed * 37.7) * 0.2;
}

export function createIsoCamera(camera: PerspectiveCamera, canvas: HTMLCanvasElement): IsoCamera {
  const size: ElementSize = watchSize(canvas);
  const offset: Vector3 = new Vector3();
  const right: Vector3 = new Vector3();
  const focus: Vector3 = new Vector3();
  const punchOffset: Vector3 = new Vector3();
  const ground: Plane = new Plane(new Vector3(0, 1, 0), 0);
  const raycaster: Raycaster = new Raycaster();
  const hit: Vector3 = new Vector3();
  const projected: Vector3 = new Vector3();
  const segment: Vector3 = new Vector3();
  const onRay: Vector3 = new Vector3();
  const onSegment: Vector3 = new Vector3();
  let distance: number = CAMERA.distance;
  let wantedDistance: number = CAMERA.distance;
  let trauma: number = 0;
  let zoomRate: number = CAMERA.zoomRate;
  let time: number = 0;
  let shot: CameraShot | null = null;
  let lookHeight: number = CAMERA.lookHeight;
  let swayX: number = 0;
  let swayY: number = 0;

  const aim = (yawDegrees: number, pitchDegrees: number): void => {
    const yaw: number = (yawDegrees * Math.PI) / 180;
    const pitch: number = (pitchDegrees * Math.PI) / 180;
    offset.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  };

  const pose = (): number => {
    if (shot === null) {
      aim(CAMERA.yawDegrees, CAMERA.pitchDegrees);
      lookHeight = CAMERA.lookHeight;
      swayX = 0;
      swayY = 0;
      return distance;
    }
    const t: number = shot.blend;
    aim(shot.pose.yawDegrees + (CAMERA.yawDegrees - shot.pose.yawDegrees) * t, shot.pose.pitchDegrees + (CAMERA.pitchDegrees - shot.pose.pitchDegrees) * t);
    lookHeight = shot.pose.lookHeight + (CAMERA.lookHeight - shot.pose.lookHeight) * t;
    swayX = shot.swayX;
    swayY = shot.swayY;
    const halfWide: number = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const close: number = Math.max(shot.pose.distance, shot.pose.fitWidth / (2 * Math.tan(halfWide)));
    return Math.exp(Math.log(close) + (Math.log(wantedDistance) - Math.log(close)) * t);
  };
  camera.fov = CAMERA.fov;
  camera.updateProjectionMatrix();

  const place = (): void => {
    const reach: number = pose();
    const shake: number = trauma * trauma;
    const shakeX: number = noise(time * CAMERA.shakeFrequency, 1) * shake * CAMERA.shakeDistance + swayX;
    const shakeY: number = noise(time * CAMERA.shakeFrequency, 2) * shake * CAMERA.shakeDistance + swayY;
    const lookX: number = focus.x + punchOffset.x + right.x * shakeX;
    const lookY: number = lookHeight + shakeY;
    const lookZ: number = focus.z + punchOffset.z + right.z * shakeX;
    camera.position.set(lookX + offset.x * reach, lookY + offset.y * reach, lookZ + offset.z * reach);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookX, lookY, lookZ);
    camera.rotateZ(noise(time * CAMERA.shakeFrequency, 3) * shake * CAMERA.shakeRoll);
    camera.updateMatrixWorld();
  };

  return {
    update(dt: number, targetX: number, targetZ: number): void {
      time += dt;
      const follow: number = 1 - Math.exp(-CAMERA.followRate * dt);
      focus.x += (targetX - focus.x) * follow;
      focus.z += (targetZ - focus.z) * follow;
      distance += (wantedDistance - distance) * (1 - Math.exp(-zoomRate * dt));
      if (zoomRate > 0 && Math.abs(wantedDistance - distance) < CAMERA.settled) zoomRate = CAMERA.zoomRate;
      trauma = Math.max(0, trauma - CAMERA.traumaDecay * dt);
      punchOffset.multiplyScalar(Math.exp(-CAMERA.punchDecay * dt));
      place();
    },
    snap(targetX: number, targetZ: number): void {
      focus.set(targetX, 0, targetZ);
      place();
    },
    shift(byX: number, byZ: number): void {
      focus.x += byX;
      focus.z += byZ;
      place();
    },
    frame(next: CameraShot | null): void {
      if (next === null && shot !== null) distance = wantedDistance;
      shot = next;
      place();
    },
    zoomBy(wheelDelta: number): void {
      zoomRate = CAMERA.zoomRate;
      wantedDistance = Math.min(CAMERA.maxDistance, Math.max(CAMERA.minDistance, wantedDistance * (1 + wheelDelta * CAMERA.zoomStep)));
    },
    addTrauma(amount: number): void {
      trauma = Math.min(1, trauma + amount);
    },
    punch(dirX: number, dirZ: number, amount: number): void {
      punchOffset.x += dirX * amount;
      punchOffset.z += dirZ * amount;
    },
    groundPoint(pointer: Vector2): Vector3 | null {
      raycaster.setFromCamera(pointer, camera);
      return raycaster.ray.intersectPlane(ground, hit) === null ? null : hit;
    },
    rayDistanceTo(pointer: Vector2, bottom: Vector3, height: number): number {
      raycaster.setFromCamera(pointer, camera);
      segment.set(bottom.x, bottom.y + height, bottom.z);
      return Math.sqrt(raycaster.ray.distanceSqToSegment(bottom, segment, onRay, onSegment));
    },
    project(x: number, y: number, z: number, out: Vector2): boolean {
      projected.set(x, y, z).project(camera);
      out.set((projected.x * 0.5 + 0.5) * size.width, (-projected.y * 0.5 + 0.5) * size.height);
      return projected.z > -1 && projected.z < 1;
    },
  };
}
