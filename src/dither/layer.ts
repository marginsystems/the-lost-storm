import type { PixelBox, RadialLayer } from './paint.ts';
import type { DitherRenderer } from './gl.ts';
import { ditherRenderer } from './gl.ts';

export const DITHER_LAYER = {
  settleMs: 160,
  maxRatio: 2,
  seed: 0x51ed270b,
  hostClass: 'dither-host',
  layerClass: 'dither-layer',
} as const;

export interface DitherOptions {
  readonly className: string;
  readonly layers: readonly RadialLayer[];
  readonly eager: boolean;
  readonly marks: string | null;
  readonly maxRatio: number;
}

export interface DitherLayer {
  readonly canvas: HTMLCanvasElement;
  paint(): void;
  show(layers: readonly RadialLayer[]): void;
  release(): void;
}

export function paintRatio(deviceRatio: number, cap: number): number {
  return Math.min(cap, DITHER_LAYER.maxRatio, Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1);
}

export function deviceBox(cssWidth: number, cssHeight: number, deviceRatio: number, cap: number): PixelBox {
  const ratio: number = paintRatio(deviceRatio, cap);
  return { width: Math.round(cssWidth * ratio), height: Math.round(cssHeight * ratio) };
}

export function mountDither(host: HTMLElement, options: DitherOptions): DitherLayer {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.className = `${DITHER_LAYER.layerClass} ${options.className}`;
  canvas.setAttribute('aria-hidden', 'true');
  host.classList.add(DITHER_LAYER.hostClass);
  host.append(canvas);
  let layers: readonly RadialLayer[] = options.layers;
  let wanted: boolean = options.eager;
  let painted: PixelBox | null = null;
  let timer: number | null = null;
  const seed: number = DITHER_LAYER.seed + host.childElementCount;

  const draw = (): void => {
    const box: PixelBox = deviceBox(canvas.offsetWidth, canvas.offsetHeight, window.devicePixelRatio, options.maxRatio);
    if (box.width === 0 || box.height === 0) return;
    const renderer: DitherRenderer | null = ditherRenderer();
    const source: HTMLCanvasElement | null = renderer === null ? null : renderer.draw(layers, box, seed);
    const context: CanvasRenderingContext2D | null = source === null ? null : canvas.getContext('2d');
    if (source === null || context === null) {
      painted = null;
      canvas.width = 0;
      canvas.height = 0;
      if (options.marks !== null) host.classList.remove(options.marks);
      return;
    }
    canvas.width = box.width;
    canvas.height = box.height;
    context.clearRect(0, 0, box.width, box.height);
    context.drawImage(source, 0, 0);
    painted = box;
    if (options.marks !== null) host.classList.add(options.marks);
  };

  new ResizeObserver((): void => {
    if (!wanted) return;
    const box: PixelBox = deviceBox(canvas.offsetWidth, canvas.offsetHeight, window.devicePixelRatio, options.maxRatio);
    if (painted !== null && painted.width === box.width && painted.height === box.height) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(
      (): void => {
        timer = null;
        draw();
      },
      painted === null ? 0 : DITHER_LAYER.settleMs,
    );
  }).observe(canvas);

  if (wanted) draw();

  return {
    canvas,
    paint(): void {
      wanted = true;
      if (painted === null) draw();
    },
    show(next: readonly RadialLayer[]): void {
      layers = next;
      wanted = true;
      draw();
    },
    release(): void {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      painted = null;
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
