import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

async function pack(source: string, target: string): Promise<void> {
  const io: NodeIO = new NodeIO();
  const document: Document = await io.read(source);
  await document.transform(prune({ keepLeaves: true }));
  mkdirSync(dirname(target), { recursive: true });
  await io.write(target, document);
  console.log(`${source} -> ${target}`);
}

async function main(): Promise<void> {
  const paths: readonly string[] = process.argv.slice(2);
  if (paths.length === 0 || paths.length % 2 !== 0) {
    console.error('usage: node tools/pack-gltf.ts <model.gltf> <model.glb> [<model.gltf> <model.glb> ...]');
    process.exit(2);
  }
  const jobs: Promise<void>[] = [];
  for (let index: number = 0; index < paths.length; index += 2) {
    const source: string | undefined = paths[index];
    const target: string | undefined = paths[index + 1];
    if (source !== undefined && target !== undefined) jobs.push(pack(source, target));
  }
  await Promise.all(jobs);
}

await main();
