export interface RectSurface {
  getBoundingClientRect(): DOMRect;
}

export interface SurfaceRect {
  read(): DOMRect;
  stale(): void;
}

export function surfaceRect(surface: RectSurface): SurfaceRect {
  let cached: DOMRect | null = null;
  return {
    read(): DOMRect {
      cached ??= surface.getBoundingClientRect();
      return cached;
    },
    stale(): void {
      cached = null;
    },
  };
}
