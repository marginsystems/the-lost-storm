export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

interface MeasuredSize {
  width: number;
  height: number;
}

export function watchSize(element: HTMLElement): ElementSize {
  const size: MeasuredSize = { width: element.clientWidth, height: element.clientHeight };
  new ResizeObserver((): void => {
    size.width = element.clientWidth;
    size.height = element.clientHeight;
  }).observe(element);
  return size;
}
