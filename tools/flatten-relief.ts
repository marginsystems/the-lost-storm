import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Texture } from '@gltf-transform/core';
import { Vector3 } from 'three';
import type { Moved } from './fit-over.ts';
import { elementsOf } from './fit-over.ts';

export const RELIEF = {
  from: 0.0005,
  to: 0.003,
  feather: 0.006,
  channels: 3,
  full: 255,
  maskSize: 512,
} as const;

export interface ReliefFaces {
  readonly uvs: readonly number[];
  readonly indices: readonly number[];
  readonly shifts: readonly number[];
}

export interface Raster {
  readonly width: number;
  readonly height: number;
}

function strength(shift: number): number {
  return Math.min(1, Math.max(0, (shift - RELIEF.from) / (RELIEF.to - RELIEF.from)));
}

function stamp(mask: Float32Array, raster: Raster, x: number, y: number, value: number): void {
  const column: number = Math.min(raster.width - 1, Math.max(0, x));
  const row: number = Math.min(raster.height - 1, Math.max(0, y));
  const at: number = row * raster.width + column;
  if (value > (mask[at] ?? 0)) mask[at] = value;
}

function paintTriangle(mask: Float32Array, raster: Raster, corners: readonly (readonly [number, number])[], weights: readonly number[]): void {
  const [a, b, c] = corners;
  if (a === undefined || b === undefined || c === undefined) return;
  corners.forEach((corner: readonly [number, number], slot: number): void => {
    stamp(mask, raster, Math.floor(corner[0]), Math.floor(corner[1]), weights[slot] ?? 0);
  });
  const area: number = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (area === 0) return;
  const left: number = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const right: number = Math.min(raster.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const top: number = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const bottom: number = Math.min(raster.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y: number = top; y <= bottom; y += 1) {
    for (let x: number = left; x <= right; x += 1) {
      const px: number = x + 0.5;
      const py: number = y + 0.5;
      const first: number = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
      const second: number = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
      const third: number = 1 - first - second;
      if (first < 0 || second < 0 || third < 0) continue;
      stamp(mask, raster, x, y, first * (weights[0] ?? 0) + second * (weights[1] ?? 0) + third * (weights[2] ?? 0));
    }
  }
}

function texelOf(raster: Raster, line: number, step: number, across: boolean): number {
  return across ? line * raster.width + step : step * raster.width + line;
}

function sweep(source: Float32Array, raster: Raster, radius: number, across: boolean, widest: boolean): Float32Array {
  const out: Float32Array = new Float32Array(source.length);
  const lines: number = across ? raster.height : raster.width;
  const length: number = across ? raster.width : raster.height;
  for (let line: number = 0; line < lines; line += 1) {
    for (let step: number = 0; step < length; step += 1) {
      let picked: number = 0;
      for (let offset: number = -radius; offset <= radius; offset += 1) {
        const value: number = source[texelOf(raster, line, Math.min(length - 1, Math.max(0, step + offset)), across)] ?? 0;
        picked = widest ? Math.max(picked, value) : picked + value;
      }
      out[texelOf(raster, line, step, across)] = widest ? picked : picked / (radius * 2 + 1);
    }
  }
  return out;
}

export function reliefMask(faces: readonly ReliefFaces[], raster: Raster): Float32Array {
  let mask: Float32Array = new Float32Array(raster.width * raster.height);
  for (const face of faces) {
    for (let start: number = 0; start + 2 < face.indices.length; start += 3) {
      const corners: number[] = [face.indices[start] ?? 0, face.indices[start + 1] ?? 0, face.indices[start + 2] ?? 0];
      const weights: number[] = corners.map((corner: number): number => strength(face.shifts[corner] ?? 0));
      if (weights.every((weight: number): boolean => weight === 0)) continue;
      const placed: [number, number][] = corners.map((corner: number): [number, number] => [(face.uvs[corner * 2] ?? 0) * raster.width, (face.uvs[corner * 2 + 1] ?? 0) * raster.height]);
      paintTriangle(mask, raster, placed, weights);
    }
  }
  const radius: number = Math.max(1, Math.round(RELIEF.feather * raster.width));
  mask = sweep(sweep(mask, raster, radius, true, true), raster, radius, false, true);
  return sweep(sweep(mask, raster, radius, true, false), raster, radius, false, false);
}

function sampled(mask: Float32Array, raster: Raster, u: number, v: number): number {
  const x: number = Math.min(raster.width - 1, Math.max(0, u * raster.width - 0.5));
  const y: number = Math.min(raster.height - 1, Math.max(0, v * raster.height - 0.5));
  const left: number = Math.floor(x);
  const top: number = Math.floor(y);
  const right: number = Math.min(raster.width - 1, left + 1);
  const bottom: number = Math.min(raster.height - 1, top + 1);
  const across: number = x - left;
  const down: number = y - top;
  const at = (column: number, row: number): number => mask[row * raster.width + column] ?? 0;
  const upper: number = at(left, top) * (1 - across) + at(right, top) * across;
  const lower: number = at(left, bottom) * (1 - across) + at(right, bottom) * across;
  return upper * (1 - down) + lower * down;
}

export function flattened(pixels: Uint8Array, image: Raster, mask: Float32Array, maskRaster: Raster): Uint8Array {
  const out: Uint8Array = new Uint8Array(pixels);
  const normal: Vector3 = new Vector3();
  const up: Vector3 = new Vector3(0, 0, 1);
  for (let texel: number = 0; texel < image.width * image.height; texel += 1) {
    const amount: number = sampled(mask, maskRaster, ((texel % image.width) + 0.5) / image.width, (Math.floor(texel / image.width) + 0.5) / image.height);
    if (amount <= 0) continue;
    const at: number = texel * RELIEF.channels;
    normal.set(((pixels[at] ?? 0) / RELIEF.full) * 2 - 1, ((pixels[at + 1] ?? 0) / RELIEF.full) * 2 - 1, ((pixels[at + 2] ?? 0) / RELIEF.full) * 2 - 1);
    normal.lerp(up, amount).normalize();
    out[at] = Math.round(((normal.x + 1) / 2) * RELIEF.full);
    out[at + 1] = Math.round(((normal.y + 1) / 2) * RELIEF.full);
    out[at + 2] = Math.round(((normal.z + 1) / 2) * RELIEF.full);
  }
  return out;
}

function facesOf(reshaped: Moved): ReliefFaces {
  const position: number = reshaped.primitive.getAttribute('POSITION')?.getCount() ?? 0;
  const indices: number[] = elementsOf(reshaped.primitive.getIndices(), 1);
  return {
    uvs: elementsOf(reshaped.primitive.getAttribute('TEXCOORD_0'), 2),
    indices: indices.length === 0 ? Array.from({ length: position }, (_value: unknown, index: number): number => index) : indices,
    shifts: reshaped.shifts,
  };
}

function rewrite(texture: Texture, faces: readonly ReliefFaces[]): void {
  const image: Uint8Array | null = texture.getImage();
  const size: readonly number[] | null = texture.getSize();
  if (image === null || size === null) return;
  const [width, height] = size;
  if (width === undefined || height === undefined) return;
  const maskRaster: Raster = { width: RELIEF.maskSize, height: RELIEF.maskSize };
  const mask: Float32Array = reliefMask(faces, maskRaster);
  if (mask.every((amount: number): boolean => amount === 0)) return;
  const folder: string = mkdtempSync(join(tmpdir(), 'flatten-relief-'));
  const source: string = join(folder, 'in.img');
  const raw: string = join(folder, 'in.rgb');
  const rawOut: string = join(folder, 'out.rgb');
  const target: string = join(folder, 'out.png');
  writeFileSync(source, image);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', source, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  writeFileSync(rawOut, flattened(new Uint8Array(readFileSync(raw)), { width, height }, mask, maskRaster));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${String(width)}x${String(height)}`, '-i', rawOut, '-frames:v', '1', target]);
  texture.setImage(new Uint8Array(readFileSync(target))).setMimeType('image/png');
}

export function flattenRelief(reshaped: readonly Moved[]): void {
  const byTexture: Map<Texture, ReliefFaces[]> = new Map<Texture, ReliefFaces[]>();
  for (const entry of reshaped) {
    const texture: Texture | null = entry.primitive.getMaterial()?.getNormalTexture() ?? null;
    if (texture === null) continue;
    byTexture.set(texture, [...(byTexture.get(texture) ?? []), facesOf(entry)]);
  }
  for (const [texture, faces] of byTexture) rewrite(texture, faces);
}
