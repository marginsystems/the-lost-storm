import { Vector2 } from 'three';
import type { Vec2 } from '../../sim/math.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import type { Placement } from './mix.ts';
import { placement } from './mix.ts';
import type { ElementSize } from '../render/element-size.ts';
import { watchSize } from '../render/element-size.ts';

const LISTENER = {
  soundHeight: 0.8,
} as const;

export type Listener = (position: Vec2) => Placement | null;

export function createListener(camera: IsoCamera, canvas: HTMLCanvasElement, hero: () => Vec2): Listener {
  const heroPoint: Vector2 = new Vector2();
  const soundPoint: Vector2 = new Vector2();
  const size: ElementSize = watchSize(canvas);
  return (position: Vec2): Placement | null => {
    const from: Vec2 = hero();
    camera.project(from.x, LISTENER.soundHeight, from.z, heroPoint);
    camera.project(position.x, LISTENER.soundHeight, position.z, soundPoint);
    const half: number = Math.max(1, size.width / 2);
    return placement(Math.hypot(position.x - from.x, position.z - from.z), (soundPoint.x - heroPoint.x) / half);
  };
}
