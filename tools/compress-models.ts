import type { Document, Mesh, Primitive, Texture } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COMPRESS = {
  quantized: /^(NORMAL|TANGENT|JOINTS_\d+|WEIGHTS_\d+|COLOR_\d+)$/,
  webpQuality: '84',
  kilobyte: 1024,
} as const;

function toWebp(texture: Texture, folder: string, index: number): boolean {
  const mime: string = texture.getMimeType();
  const image: Uint8Array | null = texture.getImage();
  if (image === null || mime === 'image/webp') return false;
  const source: string = join(folder, `${index}.${mime === 'image/png' ? 'png' : 'jpg'}`);
  const target: string = join(folder, `${index}.webp`);
  writeFileSync(source, image);
  execFileSync('cwebp', ['-quiet', '-q', COMPRESS.webpQuality, '-m', '6', source, '-o', target]);
  texture.setImage(new Uint8Array(readFileSync(target)));
  texture.setMimeType('image/webp');
  texture.setURI(texture.getURI().replace(/\.(png|jpe?g)$/i, '.webp'));
  return true;
}

function dropCustomAttributes(document: Document): void {
  for (const mesh of document.getRoot().listMeshes()) dropFromMesh(mesh);
}

function dropFromMesh(mesh: Mesh): void {
  for (const primitive of mesh.listPrimitives()) dropFromPrimitive(primitive);
}

function dropFromPrimitive(primitive: Primitive): void {
  for (const semantic of primitive.listSemantics()) {
    if (semantic.startsWith('_')) primitive.setAttribute(semantic, null);
  }
}

async function compress(io: NodeIO, path: string): Promise<void> {
  const before: number = statSync(path).size;
  const document: Document = await io.read(path);
  const folder: string = mkdtempSync(join(tmpdir(), 'compress-models-'));
  const converted: boolean[] = document
    .getRoot()
    .listTextures()
    .map((texture: Texture, index: number): boolean => toWebp(texture, folder, index));
  if (converted.some((done: boolean): boolean => done)) document.createExtension(EXTTextureWebP).setRequired(true);
  dropCustomAttributes(document);
  await document.transform(dedup(), prune({ keepLeaves: true }), reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ pattern: COMPRESS.quantized }));
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(path, document);
  console.log(`${path}: ${Math.round(before / COMPRESS.kilobyte)} KB -> ${Math.round(statSync(path).size / COMPRESS.kilobyte)} KB`);
}

async function main(): Promise<void> {
  const paths: readonly string[] = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('usage: node tools/compress-models.ts <model.glb> [<model.glb> ...]');
    process.exit(2);
  }
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  await Promise.all(paths.map((path: string): Promise<void> => compress(io, path)));
}

await main();
