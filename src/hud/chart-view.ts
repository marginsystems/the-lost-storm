import { ATLAS_VIEW, toMap } from './atlas-view.ts';
import type { AtlasFrame, AtlasView, ScreenPoint } from './atlas-view.ts';

export const CHART_VIEW = {
  openScale: 0.9,
  maxScale: 2.6,
  fitMargin: 0.94,
  labelEdge: 12,
  labelGap: 6,
} as const;

export interface LabelBox {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export interface PinnedLabel {
  readonly x: number;
  readonly y: number;
  readonly pinned: boolean;
}

function between(value: number, low: number, high: number): number {
  return low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}

export function fitScale(frame: AtlasFrame): number {
  return Math.min(frame.width / frame.mapWidth, frame.height / frame.mapHeight) * CHART_VIEW.fitMargin;
}

function topScale(frame: AtlasFrame): number {
  return Math.max(fitScale(frame), CHART_VIEW.maxScale);
}

export function clampChart(view: AtlasView, frame: AtlasFrame): AtlasView {
  const scale: number = between(view.scale, fitScale(frame), topScale(frame));
  const halfWidth: number = frame.width / (2 * scale);
  const halfHeight: number = frame.height / (2 * scale);
  return { scale, x: between(view.x, halfWidth, frame.mapWidth - halfWidth), y: between(view.y, halfHeight, frame.mapHeight - halfHeight) };
}

export function openChart(frame: AtlasFrame, at: ScreenPoint): AtlasView {
  return clampChart({ x: at.x, y: at.y, scale: CHART_VIEW.openScale }, frame);
}

export function wholeChart(frame: AtlasFrame): AtlasView {
  return clampChart({ x: frame.mapWidth / 2, y: frame.mapHeight / 2, scale: fitScale(frame) }, frame);
}

export function zoomChart(view: AtlasView, frame: AtlasFrame, cursor: ScreenPoint, wheelDelta: number): AtlasView {
  const scale: number = between(view.scale * Math.exp(-wheelDelta * ATLAS_VIEW.wheelRate), fitScale(frame), topScale(frame));
  const held: ScreenPoint = toMap(view, frame, cursor);
  return clampChart({ scale, x: held.x - (cursor.x - frame.width / 2) / scale, y: held.y - (cursor.y - frame.height / 2) / scale }, frame);
}

export function panChart(view: AtlasView, frame: AtlasFrame, dx: number, dy: number): AtlasView {
  return clampChart({ scale: view.scale, x: view.x - dx / view.scale, y: view.y - dy / view.scale }, frame);
}

export function pinLabel(at: ScreenPoint, halfWidth: number, halfHeight: number, frame: AtlasFrame): PinnedLabel {
  const left: number = halfWidth + CHART_VIEW.labelEdge;
  const top: number = halfHeight + CHART_VIEW.labelEdge;
  const x: number = between(at.x, left, frame.width - left);
  const y: number = between(at.y, top, frame.height - top);
  return { x, y, pinned: x !== at.x || y !== at.y };
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth + CHART_VIEW.labelGap && Math.abs(a.y - b.y) < a.halfHeight + b.halfHeight + CHART_VIEW.labelGap;
}

export function spreadLabels(boxes: readonly LabelBox[], frame: AtlasFrame): LabelBox[] {
  const placed: LabelBox[] = [];
  for (const box of boxes) {
    const toward: number = box.y < frame.height / 2 ? 1 : -1;
    let y: number = box.y;
    for (let tries: number = 0; tries <= placed.length; tries += 1) {
      const hit: LabelBox | undefined = placed.find((other: LabelBox): boolean => overlaps({ x: box.x, y, halfWidth: box.halfWidth, halfHeight: box.halfHeight }, other));
      if (hit === undefined) break;
      y = hit.y + toward * (hit.halfHeight + box.halfHeight + CHART_VIEW.labelGap);
    }
    placed.push({ x: box.x, y, halfWidth: box.halfWidth, halfHeight: box.halfHeight });
  }
  return placed;
}
