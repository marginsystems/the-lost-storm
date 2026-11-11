import type { Scene } from 'three';
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, LineBasicMaterial, LineSegments } from 'three';

export const WEATHER = {
  drops: 900,
  halfWidth: 34,
  height: 30,
  fallSpeed: 46,
  slantX: -7,
  slantZ: 4,
  streak: 0.045,
  rainColor: 0xa9c2e6,
  rainOpacity: 0.3,
  lightningMin: 7,
  lightningMax: 16,
  lightningDecay: 3.2,
  flickerAt: 0.14,
  flickerPower: 0.7,
} as const;

export interface Weather {
  update(dt: number, focusX: number, focusZ: number): void;
  strike(power: number): void;
  readonly flash: number;
}

export function createWeather(scene: Scene): Weather {
  const count: number = WEATHER.drops;
  const positions: Float32Array = new Float32Array(count * 6);
  const offsets: Float32Array = new Float32Array(count * 3);
  for (let drop: number = 0; drop < count; drop += 1) {
    offsets[drop * 3] = (Math.random() * 2 - 1) * WEATHER.halfWidth;
    offsets[drop * 3 + 1] = Math.random() * WEATHER.height;
    offsets[drop * 3 + 2] = (Math.random() * 2 - 1) * WEATHER.halfWidth;
  }
  const geometry: BufferGeometry = new BufferGeometry();
  const attribute: BufferAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  const rain: LineSegments = new LineSegments(geometry, new LineBasicMaterial({ color: WEATHER.rainColor, transparent: true, opacity: WEATHER.rainOpacity, depthWrite: false }));
  rain.frustumCulled = false;
  rain.renderOrder = 9;
  scene.add(rain);

  let flash: number = 0;
  let untilStrike: number = WEATHER.lightningMin;
  let untilFlicker: number = -1;

  return {
    get flash(): number {
      return flash;
    },
    strike(power: number): void {
      flash = Math.max(flash, power);
    },
    update(dt: number, focusX: number, focusZ: number): void {
      for (let drop: number = 0; drop < count; drop += 1) {
        let y: number = (offsets[drop * 3 + 1] ?? 0) - WEATHER.fallSpeed * dt;
        let x: number = (offsets[drop * 3] ?? 0) + WEATHER.slantX * dt;
        let z: number = (offsets[drop * 3 + 2] ?? 0) + WEATHER.slantZ * dt;
        if (y < 0) {
          y += WEATHER.height;
          x = (Math.random() * 2 - 1) * WEATHER.halfWidth;
          z = (Math.random() * 2 - 1) * WEATHER.halfWidth;
        }
        offsets[drop * 3] = x;
        offsets[drop * 3 + 1] = y;
        offsets[drop * 3 + 2] = z;
        positions[drop * 6] = focusX + x;
        positions[drop * 6 + 1] = y;
        positions[drop * 6 + 2] = focusZ + z;
        positions[drop * 6 + 3] = focusX + x + WEATHER.slantX * WEATHER.streak;
        positions[drop * 6 + 4] = y - WEATHER.fallSpeed * WEATHER.streak;
        positions[drop * 6 + 5] = focusZ + z + WEATHER.slantZ * WEATHER.streak;
      }
      attribute.needsUpdate = true;

      flash = Math.max(0, flash - WEATHER.lightningDecay * dt * Math.max(0.25, flash));
      untilStrike -= dt;
      if (untilStrike <= 0) {
        flash = 1;
        untilStrike = WEATHER.lightningMin + Math.random() * (WEATHER.lightningMax - WEATHER.lightningMin);
        untilFlicker = WEATHER.flickerAt;
      }
      if (untilFlicker > 0) {
        untilFlicker -= dt;
        if (untilFlicker <= 0) flash = Math.max(flash, WEATHER.flickerPower);
      }
    },
  };
}
