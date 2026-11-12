import type { Object3D } from 'three';
import { Box3 } from 'three';

export const FIGURE_GAUGE = {
  fallback: 1.8,
  min: 1.2,
  max: 3.2,
  everySeconds: 0.5,
} as const;

export interface FigureGauge {
  height(figure: Object3D, now: number): number;
}

export function clampFigure(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return FIGURE_GAUGE.fallback;
  return Math.min(FIGURE_GAUGE.max, Math.max(FIGURE_GAUGE.min, height));
}

export function createFigureGauge(): FigureGauge {
  const box: Box3 = new Box3();
  let measured: number = FIGURE_GAUGE.fallback;
  let measuredAt: number = Number.NEGATIVE_INFINITY;
  let measuredFigure: Object3D | null = null;
  return {
    height(figure: Object3D, now: number): number {
      if (figure === measuredFigure && now - measuredAt < FIGURE_GAUGE.everySeconds) return measured;
      measuredFigure = figure;
      measuredAt = now;
      box.setFromObject(figure);
      measured = clampFigure(box.isEmpty() ? Number.NaN : box.max.y - box.min.y);
      return measured;
    },
  };
}
