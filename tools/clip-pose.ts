import type { Accessor, AnimationChannel, AnimationSampler, Document, Node } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

export const CLIP_POSE = {
  arms: ['DEF-upper_arm.L', 'DEF-upper_arm.R'],
  minTurn: 0.6,
} as const;

function turnBetween(a: readonly number[], b: readonly number[]): number {
  const dot: number = Math.abs((a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0) + (a[3] ?? 0) * (b[3] ?? 0));
  return 2 * Math.acos(Math.min(1, dot));
}

export async function finalTurns(path: string, bones: readonly string[]): Promise<number[]> {
  await MeshoptDecoder.ready;
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc: Document = await io.read(path);
  const channels: AnimationChannel[] = doc.getRoot().listAnimations().flatMap((animation) => animation.listChannels());
  return bones.map((bone: string): number => {
    const channel: AnimationChannel | undefined = channels.find((entry: AnimationChannel): boolean => entry.getTargetPath() === 'rotation' && entry.getTargetNode()?.getName() === bone);
    const node: Node | null = channel?.getTargetNode() ?? null;
    const sampler: AnimationSampler | null = channel?.getSampler() ?? null;
    const output: Accessor | null = sampler?.getOutput() ?? null;
    if (node === null || output === null || output.getCount() === 0) return 0;
    const last: number[] = output.getElement(output.getCount() - 1, []);
    return turnBetween(last, node.getRotation());
  });
}
