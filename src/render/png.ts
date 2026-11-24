export const PNG = {
  signature: [137, 80, 78, 71, 13, 10, 26, 10],
  bitDepth: 8,
  colourType: 6,
  channels: 4,
  headerBytes: 13,
  lengthBytes: 4,
  typeBytes: 4,
  crcBytes: 4,
  noFilter: 0,
  crcPolynomial: 0xedb88320,
  byteValues: 256,
  bitsPerByte: 8,
  mimeType: 'image/png',
} as const;

function crcTable(): Uint32Array {
  const table: Uint32Array = new Uint32Array(PNG.byteValues);
  for (let value: number = 0; value < PNG.byteValues; value += 1) {
    let crc: number = value;
    for (let bit: number = 0; bit < PNG.bitsPerByte; bit += 1) crc = (crc & 1) === 1 ? PNG.crcPolynomial ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
}

const CRC_TABLE: Uint32Array = crcTable();

export function crc32(bytes: Uint8Array, from: number = 0, to: number = bytes.length): number {
  let crc: number = 0xffffffff;
  for (let at: number = from; at < to; at += 1) crc = (CRC_TABLE[(crc ^ (bytes[at] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(PNG.lengthBytes + PNG.typeBytes + data.length + PNG.crcBytes);
  const view: DataView = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let at: number = 0; at < PNG.typeBytes; at += 1) bytes[PNG.lengthBytes + at] = type.charCodeAt(at);
  bytes.set(data, PNG.lengthBytes + PNG.typeBytes);
  const end: number = PNG.lengthBytes + PNG.typeBytes + data.length;
  view.setUint32(end, crc32(bytes, PNG.lengthBytes, end));
  return bytes;
}

function header(width: number, height: number): Uint8Array {
  const data: Uint8Array<ArrayBuffer> = new Uint8Array(PNG.headerBytes);
  const view: DataView = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(PNG.lengthBytes, height);
  data[PNG.lengthBytes * 2] = PNG.bitDepth;
  data[PNG.lengthBytes * 2 + 1] = PNG.colourType;
  return data;
}

export function scanlines(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array<ArrayBuffer> {
  const rowBytes: number = width * PNG.channels;
  const out: Uint8Array<ArrayBuffer> = new Uint8Array(height * (rowBytes + 1));
  for (let row: number = 0; row < height; row += 1) {
    const at: number = row * (rowBytes + 1);
    out[at] = PNG.noFilter;
    out.set(rgba.subarray(row * rowBytes, (row + 1) * rowBytes), at + 1);
  }
  return out;
}

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream: ReadableStream<Uint8Array> = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const compressed: Uint8Array = await deflate(scanlines(rgba, width, height));
  return new Blob([new Uint8Array(PNG.signature), chunk('IHDR', header(width, height)), chunk('IDAT', compressed), chunk('IEND', new Uint8Array(0))], { type: PNG.mimeType });
}
