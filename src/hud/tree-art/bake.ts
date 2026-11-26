export const ART_BAKE = {
  size: 128,
  red: 0.2126,
  green: 0.7152,
  blue: 0.0722,
  type: 'image/png',
} as const;

export interface BakedArt {
  readonly colour: string;
  readonly grey: string;
}

export function artSource(css: string): string | null {
  const match: RegExpExecArray | null = /^url\("(.+)"\)$/s.exec(css);
  return match === null ? null : (match[1] ?? null);
}

export function cssImage(source: string): string {
  return `url("${source}")`;
}

export function greyPixels(data: Uint8ClampedArray): void {
  for (let index: number = 0; index + 3 < data.length; index += 4) {
    const light: number = (data[index] ?? 0) * ART_BAKE.red + (data[index + 1] ?? 0) * ART_BAKE.green + (data[index + 2] ?? 0) * ART_BAKE.blue;
    data[index] = light;
    data[index + 1] = light;
    data[index + 2] = light;
  }
}

function blobUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise<string | null>((resolve: (url: string | null) => void): void => {
    canvas.toBlob((blob: Blob | null): void => resolve(blob === null ? null : URL.createObjectURL(blob)), ART_BAKE.type);
  });
}

export async function bakeArt(source: string): Promise<BakedArt | null> {
  const image: HTMLImageElement = new Image();
  image.src = source;
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = ART_BAKE.size;
  canvas.height = ART_BAKE.size;
  const pen: CanvasRenderingContext2D | null = canvas.getContext('2d', { willReadFrequently: true });
  if (pen === null) return null;
  try {
    await image.decode();
    pen.drawImage(image, 0, 0, ART_BAKE.size, ART_BAKE.size);
    const colour: string | null = await blobUrl(canvas);
    const pixels: ImageData = pen.getImageData(0, 0, ART_BAKE.size, ART_BAKE.size);
    greyPixels(pixels.data);
    pen.putImageData(pixels, 0, 0);
    const grey: string | null = await blobUrl(canvas);
    if (colour === null || grey === null) return null;
    return { colour, grey };
  } catch {
    return null;
  }
}
