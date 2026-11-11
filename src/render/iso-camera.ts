import type { PerspectiveCamera, Vector2 } from 'three';
import { Plane, Raycaster, Vector3 } from 'three';

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
} as const;

export interface IsoCamera {
  update(dt: number, targetX: number, targetZ: number): void;
  snap(targetX: number, targetZ: number): void;
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
  const yaw: number = (CAMERA.yawDegrees * Math.PI) / 180;
  const pitch: number = (CAMERA.pitchDegrees * Math.PI) / 180;
  const offset: Vector3 = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right: Vector3 = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
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
  let time: number = 0;
  camera.fov = CAMERA.fov;
  camera.updateProjectionMatrix();

  const place = (): void => {
    const shake: number = trauma * trauma;
    const shakeX: number = noise(time * CAMERA.shakeFrequency, 1) * shake * CAMERA.shakeDistance;
    const shakeY: number = noise(time * CAMERA.shakeFrequency, 2) * shake * CAMERA.shakeDistance;
    const lookX: number = focus.x + punchOffset.x + right.x * shakeX;
    const lookY: number = CAMERA.lookHeight + shakeY;
    const lookZ: number = focus.z + punchOffset.z + right.z * shakeX;
    camera.position.set(lookX + offset.x * distance, lookY + offset.y * distance, lookZ + offset.z * distance);
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
      distance += (wantedDistance - distance) * (1 - Math.exp(-CAMERA.zoomRate * dt));
      trauma = Math.max(0, trauma - CAMERA.traumaDecay * dt);
      punchOffset.multiplyScalar(Math.exp(-CAMERA.punchDecay * dt));
      place();
    },
    snap(targetX: number, targetZ: number): void {
      focus.set(targetX, 0, targetZ);
      place();
    },
    zoomBy(wheelDelta: number): void {
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
      out.set((projected.x * 0.5 + 0.5) * canvas.clientWidth, (-projected.y * 0.5 + 0.5) * canvas.clientHeight);
      return projected.z > -1 && projected.z < 1;
    },
  };
}
