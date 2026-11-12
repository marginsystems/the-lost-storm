export const LABEL_EDGE = {
  top: 48,
  side: 8,
} as const;

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
