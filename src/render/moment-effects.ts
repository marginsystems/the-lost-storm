import type { Camera, Vector3, WebGLRenderer } from 'three';
import type { WorldEvent, World } from '../../sim/world/types.ts';
import { warnInConsole } from '../backend/console-log.ts';
import type { Effects } from './effects.ts';
import type { MomentView, MomentViewDeps } from './moment-view.ts';
import { createMomentView } from './moment-view.ts';

export const MOMENT_EFFECTS = {
  missWarning: 3,
} as const;

export interface MomentEffects extends Effects {
  showWarm(x: number, z: number): () => void;
}

export async function momentEffects(effects: Effects, deps: MomentViewDeps, renderer: WebGLRenderer, camera: Camera): Promise<MomentEffects> {
  const moments: MomentView = createMomentView(deps);
  await moments.prepare(renderer, camera);
  let warned: number = 0;
  return {
    handle(events: readonly WorldEvent[], world: World): void {
      effects.handle(events, world);
      moments.handle(events);
    },
    update(dt: number, world: World): void {
      effects.update(dt, world);
      moments.update(dt, world);
      if (import.meta.env.DEV && world.strikeMisses >= MOMENT_EFFECTS.missWarning && world.strikeMisses !== warned) {
        warned = world.strikeMisses;
        warnInConsole(`Moment strikes: ${world.strikeMisses} strikes in a row found no clear spot in ${world.zone.id}`);
      }
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
    showWarm(x: number, z: number): () => void {
      return moments.showWarm(x, z);
    },
    get hurt(): number {
      return effects.hurt;
    },
  };
}
