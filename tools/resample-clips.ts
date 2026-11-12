import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';
import { statSync } from 'node:fs';

const RESAMPLE = {
  tolerance: 1e-4,
  kilobyte: 1024,
} as const;

async function shrink(path: string): Promise<void> {
  const io: NodeIO = new NodeIO();
  const document: Document = await io.read(path);
  const before: number = statSync(path).size;
  await document.transform(resample({ tolerance: RESAMPLE.tolerance }), dedup(), prune({ keepLeaves: true }));
  await io.write(path, document);
  console.log(`${path}: ${Math.round(before / RESAMPLE.kilobyte)} KB -> ${Math.round(statSync(path).size / RESAMPLE.kilobyte)} KB`);
}

async function main(): Promise<void> {
  const paths: readonly string[] = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('usage: node tools/resample-clips.ts <clips.glb> [<clips.glb> ...]');
    process.exit(2);
  }
  await Promise.all(paths.map(shrink));
}

await main();
