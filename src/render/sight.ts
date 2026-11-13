import type { Camera } from 'three';
import { Frustum, Matrix4, Sphere, Vector3 } from 'three';

export const SIGHT = {
  margin: 3,
} as const;

export interface Sight {
  refresh(): void;
  sees(x: number, y: number, z: number, radius: number): boolean;
}

export const SEES_ALL: Sight = {
  refresh: (): undefined => undefined,
  sees: (): boolean => true,
};

export function cameraSight(camera: Camera, margin: number = SIGHT.margin): Sight {
  const frustum: Frustum = new Frustum();
  const view: Matrix4 = new Matrix4();
  const sphere: Sphere = new Sphere(new Vector3(), 0);
  return {
    refresh(): void {
      camera.updateMatrixWorld();
      view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(view);
    },
    sees(x: number, y: number, z: number, radius: number): boolean {
      sphere.center.set(x, y, z);
      sphere.radius = radius + margin;
      return frustum.intersectsSphere(sphere);
    },
  };
}
