import type { Object3D } from 'three';
import { Box3, Vector3 } from 'three';
import type { Vec2 } from '../../sim/math.ts';

export const FIGURE_GAUGE = {
  fallback: 1.8,
  min: 1.2,
  max: 3.2,
  maxReach: 3,
  everySeconds: 0.5,
  head: 'DEF-head',
  feet: ['DEF-foot.L', 'DEF-foot.R'],
} as const;

export interface BodySpan {
  readonly head: Vec2;
  readonly feet: Vec2;
}

export interface FigureSize {
  readonly height: number;
  readonly reach: number;
  readonly span: BodySpan | null;
}

export interface FigureGauge {
  measure(figure: Object3D, now: number): FigureSize;
}

export const FALLBACK_FIGURE: FigureSize = { height: FIGURE_GAUGE.fallback, reach: 0, span: null };

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

interface SpanBones {
  readonly head: Object3D;
  readonly feet: readonly Object3D[];
}

function spanBones(figure: Object3D): SpanBones | null {
  const head: Object3D | undefined = figure.getObjectByName(FIGURE_GAUGE.head);
  const feet: Object3D[] = FIGURE_GAUGE.feet.flatMap((name: string): Object3D[] => {
    const bone: Object3D | undefined = figure.getObjectByName(name);
    return bone === undefined ? [] : [bone];
  });
  return head === undefined || feet.length === 0 ? null : { head, feet };
}

function spanOf(bones: SpanBones, at: Vector3): BodySpan {
  bones.head.getWorldPosition(at);
  const head: Vec2 = { x: at.x, z: at.z };
  let x: number = 0;
  let z: number = 0;
  for (const foot of bones.feet) {
    foot.getWorldPosition(at);
    x += at.x;
    z += at.z;
  }
  return { head, feet: { x: x / bones.feet.length, z: z / bones.feet.length } };
}

export function createFigureGauge(): FigureGauge {
  const box: Box3 = new Box3();
  const root: Vector3 = new Vector3();
  const at: Vector3 = new Vector3();
  let measured: FigureSize = FALLBACK_FIGURE;
  let measuredAt: number = Number.NEGATIVE_INFINITY;
  let measuredFigure: Object3D | null = null;
  let bones: SpanBones | null = null;
  return {
    measure(figure: Object3D, now: number): FigureSize {
      if (figure !== measuredFigure) bones = spanBones(figure);
      if (figure === measuredFigure && now - measuredAt < FIGURE_GAUGE.everySeconds) return bones === null ? measured : { ...measured, span: spanOf(bones, at) };
      measuredFigure = figure;
      measuredAt = now;
      box.setFromObject(figure);
      if (box.isEmpty()) {
        measured = FALLBACK_FIGURE;
        return measured;
      }
      figure.getWorldPosition(root);
      measured = { height: clampFigure(box.max.y - box.min.y), reach: clampReach(reachOf(box, root)), span: bones === null ? null : spanOf(bones, at) };
      return measured;
    },
  };
}
