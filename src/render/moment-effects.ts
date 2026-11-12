import type { Camera, Vector3, WebGLRenderer } from 'three';
import type { WorldEvent, World } from '../../sim/world/types.ts';
import type { Effects } from './effects.ts';
import type { MomentView, MomentViewDeps } from './moment-view.ts';
import { createMomentView } from './moment-view.ts';

export async function momentEffects(effects: Effects, deps: MomentViewDeps, renderer: WebGLRenderer, camera: Camera): Promise<Effects> {
  const moments: MomentView = createMomentView(deps);
  await moments.prepare(renderer, camera);
  return {
    handle(events: readonly WorldEvent[], world: World): void {
      effects.handle(events, world);
      moments.handle(events);
    },
    update(dt: number, world: World): void {
      effects.update(dt, world);
      moments.update(dt, world);
    },
    clickMarker(x: number, z: number, hostile: boolean): void {
      effects.clickMarker(x, z, hostile);
    },
    takeHitStop(): number {
      return effects.takeHitStop();
    },
    setTorches(points: readonly Vector3[]): void {
      effects.setTorches(points);
    },
    clear(): void {
      effects.clear();
      moments.clear();
    },
    get hurt(): number {
      return effects.hurt;
    },
  };
}
