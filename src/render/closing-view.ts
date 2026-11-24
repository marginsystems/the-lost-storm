import type { Scene } from 'three';
import { Color } from 'three';
import type { ClosingState } from '../../sim/world/closing.ts';
import { closingRadius } from '../../sim/world/closing.ts';
import type { World } from '../../sim/world/types.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';
import { floorUp } from './terrain-lift.ts';

export const CLOSING_VIEW = {
  edge: 0xff8a5c,
  band: 1,
  bandWidth: 0.45,
  wobble: 0.4,
  lift: 0.05,
  resting: 0.18,
  closing: 0.5,
} as const;

interface ClosingEntry {
  readonly closing: ClosingState;
  readonly edge: GroundLight;
}

export interface ClosingView {
  update(dt: number, world: World): void;
  clear(): void;
}

export function createClosingView(scene: Scene): ClosingView {
  let entry: ClosingEntry | null = null;
  let fading: GroundLight[] = [];
  let clock: number = 0;

  const build = (closing: ClosingState): ClosingEntry => {
    const round = { kind: 'round', radius: closing.from, inner: 0, arc: Math.PI * 2 } as const;
    const edge: GroundLight = createGroundLight(new Color(CLOSING_VIEW.edge), round, { fill: 0, band: CLOSING_VIEW.band, width: CLOSING_VIEW.bandWidth, wobble: CLOSING_VIEW.wobble });
    edge.mesh.position.set(closing.centre.x, floorUp(closing.centre.x, 0, closing.centre.z) + CLOSING_VIEW.lift, closing.centre.z);
    scene.add(edge.mesh);
    return { closing, edge };
  };

  const retire = (): void => {
    if (entry === null) return;
    entry.edge.show(0);
    fading.push(entry.edge);
    entry = null;
  };

  return {
    update(dt: number, world: World): void {
      clock += dt;
      const closing: ClosingState | null = world.closing;
      if (entry !== null && entry.closing !== closing) retire();
      if (closing !== null && entry === null) entry = build(closing);
      if (entry !== null) {
        const moving: boolean = world.time > entry.closing.startsAt;
        entry.edge.front(closingRadius(entry.closing, world.time) / entry.closing.from);
        entry.edge.show(moving ? CLOSING_VIEW.closing : CLOSING_VIEW.resting);
        entry.edge.step(dt, clock);
      }
      for (const edge of fading) edge.step(dt, clock);
      const gone: GroundLight[] = fading.filter((edge: GroundLight): boolean => edge.strength <= 0.001);
      for (const edge of gone) edge.dispose();
      fading = fading.filter((edge: GroundLight): boolean => edge.strength > 0.001);
    },
    clear(): void {
      entry?.edge.dispose();
      entry = null;
      for (const edge of fading) edge.dispose();
      fading = [];
    },
  };
}
