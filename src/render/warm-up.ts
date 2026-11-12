import type { Camera, Object3D, Scene } from 'three';
import { Group } from 'three';
import type { Timers } from '../backend/backend.ts';

export const WARM_UP = {
  zoneWaitMs: 2500,
} as const;

export interface ShaderCompiler {
  compileAsync(target: Object3D, viewer: Camera): Promise<Object3D>;
}

export function warmUp(compiler: ShaderCompiler, scene: Scene, camera: Camera, standIns: readonly Object3D[]): Promise<void> {
  const holder: Group = new Group();
  for (const standIn of standIns) holder.add(standIn);
  scene.add(holder);
  let compiling: Promise<Object3D>;
  try {
    compiling = compiler.compileAsync(scene, camera);
  } finally {
    holder.removeFromParent();
    holder.remove(...standIns);
  }
  return compiling.then(
    (): void => undefined,
    (): void => undefined,
  );
}

export function warmUpWithin(compiler: ShaderCompiler, scene: Scene, camera: Camera, standIns: readonly Object3D[], timers: Timers, ms: number): Promise<void> {
  const cancels: (() => void)[] = [];
  const waited: Promise<void> = new Promise<void>((resolve: () => void): void => {
    cancels.push(timers.after(ms, resolve));
  });
  const warmed: Promise<void> = warmUp(compiler, scene, camera, standIns).finally((): void => {
    for (const cancel of cancels) cancel();
  });
  return Promise.race([warmed, waited]);
}
