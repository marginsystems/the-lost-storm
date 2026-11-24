export interface ArtCounter {
  next: number;
}

const COUNTER: ArtCounter = { next: 0 };

export function artInstance(svg: string, counter: ArtCounter = COUNTER): string {
  counter.next += 1;
  const tag: string = `a${counter.next}`;
  return svg
    .replace(/\bid="([^"]+)"/g, (_match: string, id: string): string => `id="${tag}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_match: string, id: string): string => `url(#${tag}-${id})`)
    .replace('<svg ', '<svg class="skill-art" ');
}
