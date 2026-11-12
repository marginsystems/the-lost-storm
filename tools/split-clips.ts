import type { Accessor, Animation, AnimationChannel, Document, Node } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SPLIT = {
  epsilon: 1e-4,
} as const;

function restValue(node: Node, path: string): readonly number[] | null {
  switch (path) {
    case 'translation':
      return node.getTranslation();
    case 'rotation':
      return node.getRotation();
    case 'scale':
      return node.getScale();
    default:
      return null;
  }
}

function staysAtRest(channel: AnimationChannel): boolean {
  const node: Node | null = channel.getTargetNode();
  const output: Accessor | null | undefined = channel.getSampler()?.getOutput();
  const rest: readonly number[] | null = node === null ? null : restValue(node, channel.getTargetPath() ?? '');
  if (rest === null || output === null || output === undefined) return false;
  const element: number[] = [];
  for (let index: number = 0; index < output.getCount(); index += 1) {
    output.getElement(index, element);
    if (element.some((value: number, axis: number): boolean => Math.abs(value - (rest[axis] ?? value)) > SPLIT.epsilon)) return false;
  }
  return true;
}

function dropRestChannels(animation: Animation): number {
  let dropped: number = 0;
  for (const channel of animation.listChannels()) {
    if (!staysAtRest(channel)) continue;
    channel.getSampler()?.dispose();
    channel.dispose();
    dropped += 1;
  }
  return dropped;
}

async function split(io: NodeIO, source: string, folder: string): Promise<string[]> {
  const names: string[] = (await io.read(source))
    .getRoot()
    .listAnimations()
    .map((animation: Animation): string => animation.getName());
  return Promise.all(names.map((name: string): Promise<string> => writeClip(io, source, folder, name)));
}

async function writeClip(io: NodeIO, source: string, folder: string, name: string): Promise<string> {
  const document: Document = await io.read(source);
  for (const animation of document.getRoot().listAnimations()) {
    if (animation.getName() === name) dropRestChannels(animation);
    else animation.dispose();
  }
  await document.transform(prune({ keepLeaves: true }));
  const target: string = join(folder, `${name}.glb`);
  await io.write(target, document);
  return target;
}

async function main(): Promise<void> {
  const args: readonly string[] = process.argv.slice(2);
  const folder: string | undefined = args.at(-1);
  const sources: readonly string[] = args.slice(0, -1);
  if (folder === undefined || sources.length === 0) {
    console.error('usage: node tools/split-clips.ts <clips.glb> [<clips.glb> ...] <folder>');
    process.exit(2);
  }
  mkdirSync(folder, { recursive: true });
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const written: string[][] = await Promise.all(sources.map((source: string): Promise<string[]> => split(io, source, folder)));
  sources.forEach((source: string, index: number): void => {
    console.log(`${source}: ${written[index]?.length ?? 0} clips into ${folder}`);
  });
}

await main();
