export const LABEL_EDGE = {
  top: 48,
} as const;

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

export function anchorInView(x: number, y: number, view: ViewSize): boolean {
  return x >= 0 && x <= view.width && y >= LABEL_EDGE.top && y <= view.height;
}
