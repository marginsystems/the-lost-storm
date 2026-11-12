import { BufferAttribute, Mesh, PlaneGeometry } from 'three';
import type { MeshStandardMaterial } from 'three';
import type { SurfaceDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { surfaceMaterial } from './surfaces.ts';

export const SHORE_ROCK = {
  size: 30,
  cells: 30,
  inner: 3.5,
  outer: 11,
  lineFrom: -2,
  lineTo: 5,
  lift: 0.015,
  wet: 1,
  opacity: 0.72,
  renderOrder: 2,
} as const;

export interface RockFrame {
  readonly hero: Vec2;
  readonly shift: Vec2;
  readonly at: Vec2;
  readonly facing: Vec2;
  readonly shown: number;
}

export interface ShoreRock {
  readonly mesh: Mesh;
  update(frame: RockFrame | null, floor: number): void;
  dispose(): void;
}

function smoothstep(from: number, to: number, value: number): number {
  const t: number = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function rockAlpha(point: Vec2, frame: RockFrame): number {
  const ashore: number = (point.x - frame.at.x) * frame.facing.x + (point.z - frame.at.z) * frame.facing.z;
  const onRock: number = smoothstep(SHORE_ROCK.lineFrom, SHORE_ROCK.lineTo, ashore);
  const near: number = 1 - smoothstep(SHORE_ROCK.inner, SHORE_ROCK.outer, Math.hypot(point.x - frame.hero.x, point.z - frame.hero.z));
  return SHORE_ROCK.opacity * onRock * near * frame.shown;
}

export function snapped(value: number, tile: number): number {
  return Math.round(value / tile) * tile;
}

export function createShoreRock(def: SurfaceDef): ShoreRock {
  const geometry: PlaneGeometry = new PlaneGeometry(SHORE_ROCK.size, SHORE_ROCK.size, SHORE_ROCK.cells, SHORE_ROCK.cells);
  geometry.rotateX(-Math.PI / 2);
  const across: number = SHORE_ROCK.cells + 1;
  const count: number = across * across;
  const step: number = SHORE_ROCK.size / SHORE_ROCK.cells;
  const local: Float32Array = new Float32Array(count * 2);
  const uv: Float32Array = new Float32Array(count * 2);
  for (let index: number = 0; index < count; index += 1) {
    const x: number = (index % across) * step - SHORE_ROCK.size / 2;
    const z: number = Math.floor(index / across) * step - SHORE_ROCK.size / 2;
    local[index * 2] = x;
    local[index * 2 + 1] = z;
    uv[index * 2] = x;
    uv[index * 2 + 1] = -z;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  const colours: BufferAttribute = new BufferAttribute(new Float32Array(count * 4).fill(1), 4);
  geometry.setAttribute('color', colours);
  const material: MeshStandardMaterial = surfaceMaterial(def, 'overlay', SHORE_ROCK.wet);
  const mesh: Mesh = new Mesh(geometry, material);
  mesh.renderOrder = SHORE_ROCK.renderOrder;
  mesh.receiveShadow = true;
  mesh.visible = false;

  return {
    mesh,
    update(frame: RockFrame | null, floor: number): void {
      mesh.visible = frame !== null && frame.shown > 1e-3;
      if (frame === null || !mesh.visible) return;
      const centre: Vec2 = { x: snapped(frame.hero.x - frame.shift.x, def.metres), z: snapped(frame.hero.z - frame.shift.z, def.metres) };
      mesh.position.set(centre.x + frame.shift.x, floor + SHORE_ROCK.lift, centre.z + frame.shift.z);
      for (let index: number = 0; index < count; index += 1) {
        const point: Vec2 = { x: (local[index * 2] ?? 0) + mesh.position.x, z: (local[index * 2 + 1] ?? 0) + mesh.position.z };
        colours.setW(index, rockAlpha(point, frame));
      }
      colours.needsUpdate = true;
    },
    dispose(): void {
      mesh.removeFromParent();
      geometry.dispose();
    },
  };
}
