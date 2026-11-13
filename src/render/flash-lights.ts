import type { Color, Object3D } from 'three';
import { PointLight } from 'three';
import { flashLevel, KIT } from './effect-kit.ts';

export const FLASH_LIGHTS = {
  range: 16,
  falloff: 1.6,
  decay: 9,
} as const;

export interface FlashLights {
  flash(x: number, y: number, z: number, color: Color, intensity: number, rise: number): void;
  update(dt: number): void;
  clear(): void;
  readonly lights: readonly PointLight[];
}

interface Flash {
  readonly light: PointLight;
  peak: number;
  age: number;
  rise: number;
}

export function createFlashLights(parent: Object3D, count: number): FlashLights {
  const flashes: Flash[] = [];
  for (let index: number = 0; index < Math.max(1, Math.floor(count)); index += 1) {
    const light: PointLight = new PointLight(0xffffff, 0, FLASH_LIGHTS.range, FLASH_LIGHTS.falloff);
    parent.add(light);
    flashes.push({ light, peak: 0, age: 0, rise: KIT.flashRise });
  }
  let next: number = 0;
  return {
    lights: flashes.map((entry: Flash): PointLight => entry.light),
    flash(x: number, y: number, z: number, color: Color, intensity: number, rise: number): void {
      const entry: Flash | undefined = flashes[next];
      next = (next + 1) % flashes.length;
      if (entry === undefined) return;
      entry.light.color.copy(color);
      entry.light.position.set(x, y, z);
      entry.peak = intensity;
      entry.age = 0;
      entry.rise = Math.max(KIT.flashRise, rise);
    },
    update(dt: number): void {
      for (const entry of flashes) {
        entry.age += dt;
        entry.light.intensity = entry.peak * flashLevel(entry.age, entry.rise, FLASH_LIGHTS.decay);
      }
    },
    clear(): void {
      for (const entry of flashes) {
        entry.peak = 0;
        entry.light.intensity = 0;
      }
    },
  };
}
