import { LABEL_EDGE } from './label-edge.ts';
import type { ViewSize } from './label-edge.ts';
import type { ScreenRect } from './label-stack.ts';

export const HEAD_TAG = {
  enterInset: 8,
  offClass: 'offscreen',
} as const;

export interface HeadSpot {
  readonly x: number;
  readonly y: number;
  readonly front: boolean;
}

export function headTagSeen(spot: HeadSpot, view: ViewSize, was: boolean): boolean {
  if (!spot.front) return false;
  const inset: number = was ? 0 : HEAD_TAG.enterInset;
  return spot.x >= inset && spot.x <= view.width - inset && spot.y >= LABEL_EDGE.top + inset && spot.y <= view.height - inset;
}

export function headTagRect(x: number, y: number, width: number, height: number): ScreenRect {
  return { left: x - width / 2, top: y - height, right: x + width / 2, bottom: y };
}
