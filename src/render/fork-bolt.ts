import type { Scene } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import type { ForkBolt } from './weather.ts';

export const FORK_BOLT = {
  color: 0xe2e6ff,
  distance: 52,
  top: 48,
  steps: 14,
  jitter: 2.6,
  branches: 2,
  branchSteps: 4,
  branchReach: 5,
  branchFrom: 0.25,
  branchSpan: 0.4,
  opacity: 0.95,
} as const;

const SEGMENTS: number = FORK_BOLT.steps + FORK_BOLT.branches * FORK_BOLT.branchSteps;

export interface BoltPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ForkView {
  update(bolt: ForkBolt, focusX: number, focusZ: number): void;
  dispose(): void;
}

function sequence(seed: number): () => number {
  let state: number = Math.floor(seed * 2147483646) + 1;
  return (): number => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function forkSegments(seed: number): BoltPoint[][] {
  const next: () => number = sequence(seed);
  const trunk: BoltPoint[] = [];
  for (let step: number = 0; step <= FORK_BOLT.steps; step += 1) {
    const share: number = step / FORK_BOLT.steps;
    const wander: number = step === 0 || step === FORK_BOLT.steps ? 0 : (next() - 0.5) * FORK_BOLT.jitter;
    trunk.push({ x: wander, y: FORK_BOLT.top * (1 - share), z: (next() - 0.5) * FORK_BOLT.jitter * share });
  }
  const segments: BoltPoint[][] = [];
  for (let step: number = 0; step < FORK_BOLT.steps; step += 1) {
    const from: BoltPoint | undefined = trunk[step];
    const to: BoltPoint | undefined = trunk[step + 1];
    if (from !== undefined && to !== undefined) segments.push([from, to]);
  }
  for (let branch: number = 0; branch < FORK_BOLT.branches; branch += 1) {
    let from: BoltPoint | undefined = trunk[Math.floor(FORK_BOLT.steps * (FORK_BOLT.branchFrom + FORK_BOLT.branchSpan * next()))];
    const side: number = next() < 0.5 ? -1 : 1;
    for (let step: number = 0; step < FORK_BOLT.branchSteps && from !== undefined; step += 1) {
      const to: BoltPoint = { x: from.x + side * (FORK_BOLT.branchReach / FORK_BOLT.branchSteps) * (0.6 + next()), y: from.y - (FORK_BOLT.branchReach / FORK_BOLT.branchSteps) * (0.8 + next()), z: from.z + (next() - 0.5) };
      segments.push([from, to]);
      from = to;
    }
  }
  return segments;
}

export function createForkView(scene: Scene): ForkView {
  const positions: Float32Array = new Float32Array(SEGMENTS * 2 * 3);
  const geometry: BufferGeometry = new BufferGeometry();
  const attribute: BufferAttribute = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', attribute);
  const material: LineBasicMaterial = new LineBasicMaterial({ color: FORK_BOLT.color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
  const lines: LineSegments = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  scene.add(lines);
  let shape: number = -1;

  return {
    update(bolt: ForkBolt, focusX: number, focusZ: number): void {
      material.opacity = bolt.shown * FORK_BOLT.opacity;
      if (bolt.shown <= 0) return;
      if (bolt.seed !== shape) {
        shape = bolt.seed;
        positions.fill(0);
        forkSegments(bolt.seed).forEach((segment: BoltPoint[], index: number): void => {
          segment.forEach((point: BoltPoint, end: number): void => positions.set([point.x, point.y, point.z], (index * 2 + end) * 3));
        });
        attribute.needsUpdate = true;
        geometry.computeBoundingSphere();
      }
      lines.position.set(focusX + Math.cos(bolt.angle) * FORK_BOLT.distance, 0, focusZ + Math.sin(bolt.angle) * FORK_BOLT.distance);
      lines.rotation.y = -bolt.angle;
    },
    dispose(): void {
      scene.remove(lines);
      geometry.dispose();
      material.dispose();
    },
  };
}
