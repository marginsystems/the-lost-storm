import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Animation, Document, Node } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const KEPT_CLIPS: ReadonlySet<string> = new Set<string>([
  'Idle_Loop',
  'Sword_Idle',
  'Idle_Torch_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Sword_Attack',
  'Punch_Cross',
  'Punch_Jab',
  'Spell_Simple_Shoot',
  'Pistol_Idle_Loop',
  'Pistol_Shoot',
  'Hit_Chest',
  'Hit_Head',
  'Death01',
  'Roll',
  'Jump_Land',
]);

const LOD_MARKER: string = '_LOD';

function usage(): never {
  console.error('usage: node tools/build-characters.ts <body.glb> <animations-source.glb> <body-out.glb> <animations-out.glb>');
  process.exit(2);
}

function meshNodes(document: Document): Node[] {
  return document
    .getRoot()
    .listNodes()
    .filter((node: Node): boolean => node.getMesh() !== null);
}

async function write(io: NodeIO, document: Document, path: string): Promise<void> {
  await document.transform(prune({ keepLeaves: true }));
  mkdirSync(dirname(path), { recursive: true });
  await io.write(path, document);
}

async function buildBody(io: NodeIO, source: string, target: string): Promise<void> {
  const document: Document = await io.read(source);
  for (const node of meshNodes(document)) {
    if (node.getName().includes(LOD_MARKER)) node.dispose();
  }
  for (const animation of document.getRoot().listAnimations()) animation.dispose();
  await write(io, document, target);
  console.log(`${target}: ${meshNodes(document).map((node: Node): string => node.getName()).join(', ')}`);
}

async function buildAnimations(io: NodeIO, source: string, target: string): Promise<void> {
  const document: Document = await io.read(source);
  for (const node of meshNodes(document)) node.dispose();
  for (const skin of document.getRoot().listSkins()) skin.dispose();
  const kept: string[] = [];
  for (const animation of document.getRoot().listAnimations()) {
    if (KEPT_CLIPS.has(animation.getName())) kept.push(animation.getName());
    else animation.dispose();
  }
  const missing: string[] = [...KEPT_CLIPS].filter((name: string): boolean => !kept.includes(name));
  if (missing.length > 0) throw new Error(`Missing clips in ${source}: ${missing.join(', ')}`);
  await write(io, document, target);
  const clips: Animation[] = document.getRoot().listAnimations();
  console.log(`${target}: ${clips.length} clips`);
}

const [bodySource, animationSource, bodyTarget, animationTarget] = process.argv.slice(2);
if (bodySource === undefined || animationSource === undefined || bodyTarget === undefined || animationTarget === undefined) usage();
const io: NodeIO = new NodeIO();
await buildBody(io, bodySource, bodyTarget);
await buildAnimations(io, animationSource, animationTarget);
