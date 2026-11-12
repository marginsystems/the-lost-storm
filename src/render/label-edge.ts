import type { ScreenRect } from './label-stack.ts';

export const LABEL_EDGE = {
  top: 48,
  side: 8,
  hudGap: 4,
  awayDistance: 6,
} as const;

export interface TagPlace {
  readonly x: number;
  readonly y: number;
  readonly away: boolean;
  readonly turn: number;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

export function anchorInView(x: number, y: number, view: ViewSize): boolean {
  return x >= 0 && x <= view.width && y >= LABEL_EDGE.top && y <= view.height;
}

export function keepInside(x: number, width: number, view: ViewSize): number {
  const low: number = LABEL_EDGE.side + width / 2;
  const high: number = view.width - LABEL_EDGE.side - width / 2;
  return low > high ? view.width / 2 : Math.min(high, Math.max(low, x));
}

export function keepBelowTop(bottom: number, height: number, view: ViewSize): number {
  return Math.min(view.height - LABEL_EDGE.side, Math.max(LABEL_EDGE.side + height, bottom));
}

function boxOf(x: number, y: number, width: number, height: number): ScreenRect {
  return { left: x - width / 2, top: y - height, right: x + width / 2, bottom: y };
}

function hits(box: ScreenRect, rect: ScreenRect): boolean {
  return box.left < rect.right + LABEL_EDGE.hudGap && rect.left - LABEL_EDGE.hudGap < box.right && box.top < rect.bottom + LABEL_EDGE.hudGap && rect.top - LABEL_EDGE.hudGap < box.bottom;
}

export interface ItemPoint {
  readonly x: number;
  readonly y: number;
}

export function placeTag(anchorX: number, anchorY: number, width: number, height: number, view: ViewSize, rects: readonly ScreenRect[], item: ItemPoint = { x: anchorX, y: anchorY }): TagPlace {
  const inView = ([x, y]: readonly [number, number]): [number, number] => [keepInside(x, width, view), keepBelowTop(y, height, view)];
  const free = ([x, y]: readonly [number, number]): boolean => !rects.some((rect: ScreenRect): boolean => hits(boxOf(x, y, width, height), rect));
  const start: [number, number] = inView([anchorX, anchorY]);
  let chosen: [number, number] = start;
  if (!free(start)) {
    const gap: number = LABEL_EDGE.hudGap + 1;
    const xs: number[] = [start[0], ...rects.flatMap((rect: ScreenRect): number[] => [rect.left - gap - width / 2, rect.right + gap + width / 2])];
    const ys: number[] = [start[1], ...rects.flatMap((rect: ScreenRect): number[] => [rect.top - gap, rect.bottom + gap + height])];
    let best: number = Infinity;
    for (const cx of xs) {
      for (const cy of ys) {
        const option: [number, number] = inView([cx, cy]);
        const distance: number = Math.hypot(option[0] - anchorX, option[1] - anchorY);
        if (distance < best && free(option)) {
          best = distance;
          chosen = option;
        }
      }
    }
  }
  const [x, y] = chosen;
  const away: boolean = Math.hypot(x - anchorX, y - anchorY) > LABEL_EDGE.awayDistance;
  return { x, y, away, turn: Math.atan2(item.y - (y - height / 2), item.x - x) };
}
