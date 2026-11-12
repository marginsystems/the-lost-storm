import type { Scene } from 'three';
import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments } from 'three';

export const RAIN = {
  span: 44,
  top: 16,
  fall: 24,
  slantX: 4,
  slantZ: 2.5,
  streak: 0.045,
  color: 0x9db2c6,
  opacity: 0.32,
  flashOpacity: 0.7,
  renderOrder: 3,
} as const;

export interface Drop {
  x: number;
  y: number;
  z: number;
}

export interface Rain {
  setDensity(density: number): void;
  update(dt: number, focusX: number, focusZ: number, flash: number): void;
  readonly shown: number;
  dispose(): void;
}

function wrap(value: number, centre: number): number {
  const half: number = RAIN.span / 2;
  const offset: number = (((value - centre + half) % RAIN.span) + RAIN.span) % RAIN.span;
  return centre - half + offset;
}

export function fallDrop(drop: Drop, dt: number, focusX: number, focusZ: number, random: () => number): void {
  drop.y -= RAIN.fall * dt;
  drop.x += RAIN.slantX * dt;
  drop.z += RAIN.slantZ * dt;
  if (drop.y < 0) {
    drop.y += RAIN.top;
    drop.x = focusX + (random() - 0.5) * RAIN.span;
    drop.z = focusZ + (random() - 0.5) * RAIN.span;
  }
  drop.x = wrap(drop.x, focusX);
  drop.z = wrap(drop.z, focusZ);
}

export function shownDrops(density: number, capacity: number): number {
  return Math.round(Math.min(1, Math.max(0, density)) * capacity);
}

export function createRain(scene: Scene, capacity: number, random: () => number = Math.random): Rain {
  const drops: Drop[] = Array.from({ length: capacity }, (): Drop => ({ x: (random() - 0.5) * RAIN.span, y: random() * RAIN.top, z: (random() - 0.5) * RAIN.span }));
  const positions: Float32Array = new Float32Array(capacity * 6);
  const attribute: BufferAttribute = new BufferAttribute(positions, 3);
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', attribute);
  const material: LineBasicMaterial = new LineBasicMaterial({ color: new Color(RAIN.color), transparent: true, opacity: RAIN.opacity, depthWrite: false, fog: true });
  const lines: LineSegments = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = RAIN.renderOrder;
  lines.visible = false;
  scene.add(lines);
  let shown: number = 0;

  return {
    get shown(): number {
      return shown;
    },
    setDensity(density: number): void {
      shown = shownDrops(density, capacity);
      geometry.setDrawRange(0, shown * 2);
      lines.visible = shown > 0;
    },
    update(dt: number, focusX: number, focusZ: number, flash: number): void {
      if (shown === 0) return;
      for (let index: number = 0; index < shown; index += 1) {
        const drop: Drop | undefined = drops[index];
        if (drop === undefined) continue;
        fallDrop(drop, dt, focusX, focusZ, random);
        const at: number = index * 6;
        positions[at] = drop.x;
        positions[at + 1] = drop.y;
        positions[at + 2] = drop.z;
        positions[at + 3] = drop.x - RAIN.slantX * RAIN.streak;
        positions[at + 4] = drop.y + RAIN.fall * RAIN.streak;
        positions[at + 5] = drop.z - RAIN.slantZ * RAIN.streak;
      }
      attribute.needsUpdate = true;
      material.opacity = RAIN.opacity + (RAIN.flashOpacity - RAIN.opacity) * Math.min(1, flash);
    },
    dispose(): void {
      scene.remove(lines);
      geometry.dispose();
      material.dispose();
    },
  };
}
