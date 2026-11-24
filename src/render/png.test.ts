import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32 as zlibCrc32, inflateSync } from 'node:zlib';
import { PNG, crc32, encodePng, scanlines } from './png.ts';

interface Chunk {
  readonly type: string;
  readonly data: Uint8Array;
  readonly crc: number;
  readonly checked: number;
}

function chunksOf(bytes: Uint8Array): Chunk[] {
  const view: DataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let at: number = PNG.signature.length;
  while (at < bytes.length) {
    const length: number = view.getUint32(at);
    const type: string = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data: Uint8Array = bytes.subarray(at + 8, at + 8 + length);
    const crc: number = view.getUint32(at + 8 + length);
    chunks.push({ type, data, crc, checked: zlibCrc32(bytes.subarray(at + 4, at + 8 + length)) });
    at += 12 + length;
  }
  return chunks;
}

function picture(width: number, height: number): Uint8ClampedArray {
  const rgba: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4);
  for (let at: number = 0; at < rgba.length; at += 1) rgba[at] = (at * 37 + 11) % 256;
  return rgba;
}

void test('crc32 matches zlib on the PNG chunk names and on arbitrary bytes', (): void => {
  const iend: Uint8Array = new TextEncoder().encode('IEND');
  assert.equal(crc32(iend), 0xae426082);
  const bytes: Uint8Array = new Uint8Array(picture(7, 5).buffer);
  assert.equal(crc32(bytes), zlibCrc32(bytes));
  assert.equal(crc32(bytes, 3, 40), zlibCrc32(bytes.subarray(3, 40)));
});

void test('each scanline starts with the no-filter byte and holds its row unchanged', (): void => {
  const rgba: Uint8ClampedArray = picture(3, 2);
  const lines: Uint8Array = scanlines(rgba, 3, 2);
  assert.equal(lines.length, 2 * (1 + 3 * 4));
  assert.equal(lines[0], 0);
  assert.equal(lines[13], 0);
  assert.deepEqual([...lines.subarray(1, 13)], [...rgba.subarray(0, 12)]);
  assert.deepEqual([...lines.subarray(14, 26)], [...rgba.subarray(12, 24)]);
});

void test('an encoded image is a valid RGBA PNG whose pixels inflate back exactly', async (): Promise<void> => {
  const width: number = 9;
  const height: number = 4;
  const rgba: Uint8ClampedArray = picture(width, height);
  const blob: Blob = await encodePng(rgba, width, height);
  assert.equal(blob.type, 'image/png');
  const bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 8)], [...PNG.signature]);
  const chunks: Chunk[] = chunksOf(bytes);
  assert.deepEqual(chunks.map((chunk: Chunk): string => chunk.type), ['IHDR', 'IDAT', 'IEND']);
  for (const chunk of chunks) assert.equal(chunk.crc, chunk.checked, chunk.type);
  const [head, body] = chunks;
  assert.ok(head !== undefined && body !== undefined);
  const header: DataView = new DataView(head.data.buffer, head.data.byteOffset, head.data.byteLength);
  assert.deepEqual([header.getUint32(0), header.getUint32(4), head.data[8], head.data[9], head.data[10], head.data[11], head.data[12]], [width, height, 8, 6, 0, 0, 0]);
  assert.deepEqual([...inflateSync(body.data)], [...scanlines(rgba, width, height)]);
});
