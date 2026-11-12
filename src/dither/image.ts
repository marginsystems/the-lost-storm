import type { PixelBox, RadialLayer } from './paint.ts';
import type { DitherRenderer } from './gl.ts';
import { ditherRenderer } from './gl.ts';
import { deviceBox, DITHER_LAYER } from './layer.ts';

export const DITHER_IMAGE = {
  imageType: 'image/png',
} as const;

export interface DitherImageOptions {
  readonly pseudo: string;
  readonly property: string;
  readonly marks: string;
  readonly layers: readonly RadialLayer[];
  readonly maxRatio: number;
}

export function cssPixels(value: string): number {
  const parsed: number = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function sameBox(a: PixelBox | null, b: PixelBox): boolean {
  return a !== null && a.width === b.width && a.height === b.height;
}

export function mountDitherImage(element: HTMLElement, options: DitherImageOptions): void {
  let painted: PixelBox | null = null;
  let url: string | null = null;
  let timer: number | null = null;

  const fail = (): void => {
    painted = null;
    element.classList.remove(options.marks);
  };

  const show = (blob: Blob | null): void => {
    if (blob === null) {
      fail();
      return;
    }
    const next: string = URL.createObjectURL(blob);
    element.style.setProperty(options.property, `url("${next}")`);
    element.classList.add(options.marks);
    if (url !== null) URL.revokeObjectURL(url);
    url = next;
  };

  const draw = (): void => {
    const style: CSSStyleDeclaration = getComputedStyle(element, options.pseudo);
    const box: PixelBox = deviceBox(cssPixels(style.width), cssPixels(style.height), window.devicePixelRatio, options.maxRatio);
    if (box.width === 0 || box.height === 0 || sameBox(painted, box)) return;
    const renderer: DitherRenderer | null = ditherRenderer();
    const source: HTMLCanvasElement | null = renderer === null ? null : renderer.draw(options.layers, box, DITHER_LAYER.seed);
    const copy: HTMLCanvasElement = document.createElement('canvas');
    copy.width = box.width;
    copy.height = box.height;
    const context: CanvasRenderingContext2D | null = source === null ? null : copy.getContext('2d');
    if (source === null || context === null) {
      fail();
      return;
    }
    context.drawImage(source, 0, 0);
    painted = box;
    copy.toBlob(show, DITHER_IMAGE.imageType);
  };

  new ResizeObserver((): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(
      (): void => {
        timer = null;
        draw();
      },
      painted === null ? 0 : DITHER_LAYER.settleMs,
    );
  }).observe(element);

  draw();
}
