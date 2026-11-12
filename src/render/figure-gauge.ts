import type { Object3D } from 'three';
import { Box3, Vector3 } from 'three';

export const FIGURE_GAUGE = {
  fallback: 1.8,
  min: 1.2,
  max: 3.2,
  maxReach: 3,
  everySeconds: 0.5,
} as const;

export interface FigureSize {
  readonly height: number;
  readonly reach: number;
}

export interface FigureGauge {
  measure(figure: Object3D, now: number): FigureSize;
}

export const FALLBACK_FIGURE: FigureSize = { height: FIGURE_GAUGE.fallback, reach: 0 };

export function clampFigure(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return FIGURE_GAUGE.fallback;
  return Math.min(FIGURE_GAUGE.max, Math.max(FIGURE_GAUGE.min, height));
}

export function clampReach(reach: number): number {
  if (!Number.isFinite(reach) || reach <= 0) return 0;
  return Math.min(FIGURE_GAUGE.maxReach, reach);
}

function reachOf(box: Box3, root: Vector3): number {
  const x: number = Math.max(Math.abs(box.min.x - root.x), Math.abs(box.max.x - root.x));
  const z: number = Math.max(Math.abs(box.min.z - root.z), Math.abs(box.max.z - root.z));
  return Math.hypot(x, z);
}

export function createFigureGauge(): FigureGauge {
  const box: Box3 = new Box3();
  const root: Vector3 = new Vector3();
  let measured: FigureSize = FALLBACK_FIGURE;
  let measuredAt: number = Number.NEGATIVE_INFINITY;
  let measuredFigure: Object3D | null = null;
  return {
    measure(figure: Object3D, now: number): FigureSize {
      if (figure === measuredFigure && now - measuredAt < FIGURE_GAUGE.everySeconds) return measured;
      measuredFigure = figure;
      measuredAt = now;
      box.setFromObject(figure);
      if (box.isEmpty()) {
        measured = FALLBACK_FIGURE;
        return measured;
      }
      figure.getWorldPosition(root);
      measured = { height: clampFigure(box.max.y - box.min.y), reach: clampReach(reachOf(box, root)) };
      return measured;
    },
  };
}
