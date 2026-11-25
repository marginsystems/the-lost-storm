import type { Camera, Vector3, WebGLRenderer } from 'three';
import type { WorldEvent, World } from '../../sim/world/types.ts';
import { warnInConsole } from '../backend/console-log.ts';
import type { Effects } from './effects.ts';
import type { MomentView, MomentViewDeps } from './moment-view.ts';
import { createMomentView } from './moment-view.ts';
import type { PortalView } from './portal-view.ts';
import { createPortalView } from './portal-view.ts';
import type { WardView } from './ward-view.ts';
import { createWardView } from './ward-view.ts';

export const MOMENT_EFFECTS = {
  missWarning: 3,
} as const;

export interface MomentEffects extends Effects {
  showWarm(x: number, z: number): () => void;
  readonly ready: Promise<void>;
}

export function momentEffects(effects: Effects, deps: MomentViewDeps, renderer: WebGLRenderer, camera: Camera): MomentEffects {
  const moments: MomentView = createMomentView(deps);
  const wards: WardView = createWardView(deps.scene, deps.tier.name === 'mobile');
  const portals: PortalView = createPortalView(deps.scene, deps.particles);
  const ready: Promise<void> = moments.warm(renderer, camera);
  let warned: number = 0;
  return {
    handle(events: readonly WorldEvent[], world: World): void {
      effects.handle(events, world);
      moments.handle(events);
    },
    update(dt: number, world: World): void {
      effects.update(dt, world);
      moments.update(dt, world);
      wards.update(dt, world);
      portals.update(dt, world);
      if (import.meta.env.DEV && world.strikeMisses >= MOMENT_EFFECTS.missWarning && world.strikeMisses !== warned) {
        warned = world.strikeMisses;
        warnInConsole(`Moment strikes: ${world.strikeMisses} strikes in a row found no clear spot in ${world.zone.id}`);
      }
    },
    clickMarker(x: number, z: number, hostile: boolean): void {
      effects.clickMarker(x, z, hostile);
    },
    takeMoment(): boolean {
      return effects.takeMoment();
    },
    setTorches(points: readonly Vector3[]): void {
      effects.setTorches(points);
    },
    clear(): void {
      effects.clear();
      moments.clear();
      wards.clear();
      portals.clear();
    },
    showKeepers(): () => void {
      return effects.showKeepers();
    },
    showWarm(x: number, z: number): () => void {
      const hideMoments: () => void = moments.showWarm(x, z);
      const hideKeepers: () => void = effects.showKeepers();
      return (): void => {
        hideMoments();
        hideKeepers();
      };
    },
    ready,
    get hurt(): number {
      return effects.hurt;
    },
  };
}
