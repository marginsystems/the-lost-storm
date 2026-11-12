export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ColourStop {
  readonly at: number;
  readonly colour: Rgba;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type RadialSize = { readonly kind: 'farthest-corner' } | { readonly kind: 'fixed'; readonly rx: number; readonly ry: number };

export interface RadialLayer {
  readonly centre: Point;
  readonly size: RadialSize;
  readonly stops: readonly ColourStop[];
}

export interface PixelBox {
  readonly width: number;
  readonly height: number;
}

export interface Radii {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

const PAINT = {
  channelMax: 255,
  minimumRadius: 1e-6,
  channels: 4,
  maxLayers: 2,
  maxStops: 8,
} as const;

export function transparent(): Rgba {
  return { r: 0, g: 0, b: 0, a: 0 };
}

export function rgba(r: number, g: number, b: number, a: number): Rgba {
  return { r, g, b, a };
}

export function radii(layer: RadialLayer, box: PixelBox): Radii {
  const cx: number = layer.centre.x * box.width;
  const cy: number = layer.centre.y * box.height;
  if (layer.size.kind === 'fixed') return { cx, cy, rx: Math.max(layer.size.rx * box.width, PAINT.minimumRadius), ry: Math.max(layer.size.ry * box.height, PAINT.minimumRadius) };
  const farX: number = Math.max(cx, box.width - cx, PAINT.minimumRadius);
  const farY: number = Math.max(cy, box.height - cy, PAINT.minimumRadius);
  return { cx, cy, rx: farX * Math.SQRT2, ry: farY * Math.SQRT2 };
}

export interface LayerUniforms {
  readonly count: number;
  readonly shapes: Float32Array;
  readonly stopCounts: Float32Array;
  readonly positions: Float32Array;
  readonly colours: Float32Array;
}

export const DITHER_LIMITS: { readonly layers: number; readonly stops: number } = { layers: PAINT.maxLayers, stops: PAINT.maxStops };

export function layerUniforms(layers: readonly RadialLayer[], box: PixelBox): LayerUniforms {
  const used: readonly RadialLayer[] = layers.slice(0, PAINT.maxLayers);
  const shapes: Float32Array = new Float32Array(PAINT.maxLayers * 4);
  const stopCounts: Float32Array = new Float32Array(PAINT.maxLayers);
  const positions: Float32Array = new Float32Array(PAINT.maxLayers * PAINT.maxStops);
  const colours: Float32Array = new Float32Array(PAINT.maxLayers * PAINT.maxStops * PAINT.channels);
  used.forEach((layer: RadialLayer, index: number): void => {
    const shape: Radii = radii(layer, box);
    shapes.set([shape.cx, shape.cy, shape.rx, shape.ry], index * 4);
    const stops: readonly ColourStop[] = layer.stops.slice(0, PAINT.maxStops);
    stopCounts[index] = stops.length;
    stops.forEach((entry: ColourStop, at: number): void => {
      positions[index * PAINT.maxStops + at] = entry.at;
      const alpha: number = entry.colour.a;
      colours.set([(entry.colour.r / PAINT.channelMax) * alpha, (entry.colour.g / PAINT.channelMax) * alpha, (entry.colour.b / PAINT.channelMax) * alpha, alpha], (index * PAINT.maxStops + at) * PAINT.channels);
    });
  });
  return { count: used.length, shapes, stopCounts, positions, colours };
}
