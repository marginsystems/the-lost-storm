import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Accessor, Animation, AnimationChannel, AnimationSampler, Buffer, Document, Node } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Fields } from '../sim/content/read.ts';
import { each, fields, numeric, text } from '../sim/content/read.ts';

const RETARGET = {
  framesPerSecond: 30,
  restWarningDegrees: 12,
  restWarningMetres: 0.12,
} as const;

interface ClipPart {
  readonly clip: string;
  readonly start: number;
  readonly end: number | null;
  readonly reverse: boolean;
  readonly hold: number;
  readonly rate: number;
}

interface ClipPlan {
  readonly name: string;
  readonly parts: readonly ClipPart[];
}

interface Manifest {
  readonly hips: string;
  readonly joints: ReadonlyMap<string, string>;
  readonly clips: readonly ClipPlan[];
}

interface Track {
  readonly times: readonly number[];
  readonly values: readonly number[];
  readonly width: number;
}

interface SourceClip {
  readonly duration: number;
  readonly rotations: ReadonlyMap<Node, Track>;
  readonly translations: ReadonlyMap<Node, Track>;
}

interface Pose {
  readonly rotations: Map<Node, Quaternion>;
  readonly positions: Map<Node, Vector3>;
}

interface Joint {
  readonly target: Node;
  readonly source: Node;
  readonly parent: Node | null;
  readonly correction: Quaternion;
}

interface Frame {
  readonly rotations: readonly Quaternion[];
  readonly hips: Vector3;
}

function usage(): never {
  console.error('usage: node tools/retarget-clips.ts <rig.glb> <source-clips.glb> <manifest.json> <out.glb>');
  process.exit(2);
}

function optionalNumber(source: Fields, key: string, where: string, fallback: number): number {
  return source[key] === undefined ? fallback : numeric(source, key, where);
}

function readPart(value: unknown, where: string): ClipPart {
  const source: Fields = fields(value, where);
  return {
    clip: text(source, 'clip', where),
    start: optionalNumber(source, 'start', where, 0),
    end: source['end'] === undefined ? null : numeric(source, 'end', where),
    reverse: source['reverse'] === true,
    hold: optionalNumber(source, 'hold', where, 0),
    rate: optionalNumber(source, 'rate', where, 1),
  };
}

function readManifest(path: string): Manifest {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const source: Fields = fields(parsed, 'manifest');
  const jointFields: Fields = fields(source['joints'], 'manifest.joints');
  const joints: Map<string, string> = new Map<string, string>();
  for (const key of Object.keys(jointFields)) joints.set(key, text(jointFields, key, 'manifest.joints'));
  const clips: ClipPlan[] = each(source['clips'], 'manifest.clips', (entry: unknown, where: string): ClipPlan => {
    const clip: Fields = fields(entry, where);
    return { name: text(clip, 'name', where), parts: each(clip['parts'], `${where}.parts`, readPart) };
  });
  return { hips: text(source, 'hips', 'manifest'), joints, clips };
}

function parentOf(node: Node): Node | null {
  return node.getParentNode();
}

function numbersOf(accessor: Accessor | null): number[] | null {
  if (accessor === null) return null;
  const numbers: number[] = [];
  const element: number[] = [];
  for (let index: number = 0; index < accessor.getCount(); index += 1) {
    accessor.getElement(index, element);
    numbers.push(...element);
  }
  return numbers;
}

function trackOf(sampler: AnimationSampler, width: number): Track | null {
  const times: number[] | null = numbersOf(sampler.getInput());
  const values: number[] | null = numbersOf(sampler.getOutput());
  if (times === null || values === null) return null;
  return { times, values, width };
}

function readClip(animation: Animation): SourceClip {
  const rotations: Map<Node, Track> = new Map<Node, Track>();
  const translations: Map<Node, Track> = new Map<Node, Track>();
  let duration: number = 0;
  for (const channel of animation.listChannels()) {
    const node: Node | null = channel.getTargetNode();
    const sampler: AnimationSampler | null = channel.getSampler();
    const path: string | null = channel.getTargetPath();
    if (node === null || sampler === null || (path !== 'rotation' && path !== 'translation')) continue;
    const track: Track | null = trackOf(sampler, path === 'rotation' ? 4 : 3);
    if (track === null) continue;
    duration = Math.max(duration, track.times.at(-1) ?? 0);
    (path === 'rotation' ? rotations : translations).set(node, track);
  }
  return { duration, rotations, translations };
}

function sample(track: Track, time: number): number[] {
  const times: readonly number[] = track.times;
  let upper: number = times.findIndex((key: number): boolean => key >= time);
  if (upper < 0) upper = times.length - 1;
  const lower: number = Math.max(0, upper - 1);
  const from: number = times[lower] ?? 0;
  const to: number = times[upper] ?? from;
  const blend: number = to > from ? Math.min(1, Math.max(0, (time - from) / (to - from))) : 0;
  const out: number[] = [];
  for (let index: number = 0; index < track.width; index += 1) {
    const a: number = track.values[lower * track.width + index] ?? 0;
    const b: number = track.values[upper * track.width + index] ?? a;
    out.push(a + (b - a) * blend);
  }
  return out;
}

function sampleRotation(track: Track, time: number): Quaternion {
  const times: readonly number[] = track.times;
  let upper: number = times.findIndex((key: number): boolean => key >= time);
  if (upper < 0) upper = times.length - 1;
  const lower: number = Math.max(0, upper - 1);
  const from: number = times[lower] ?? 0;
  const to: number = times[upper] ?? from;
  const blend: number = to > from ? Math.min(1, Math.max(0, (time - from) / (to - from))) : 0;
  const a: Quaternion = new Quaternion().fromArray(track.values, lower * 4);
  const b: Quaternion = new Quaternion().fromArray(track.values, upper * 4);
  return a.slerp(b, blend).normalize();
}

function poseOf(nodes: readonly Node[], clip: SourceClip | null, time: number): Pose {
  const matrices: Map<Node, Matrix4> = new Map<Node, Matrix4>();
  const rotations: Map<Node, Quaternion> = new Map<Node, Quaternion>();
  const positions: Map<Node, Vector3> = new Map<Node, Vector3>();
  const worldOf = (node: Node): Matrix4 => {
    const known: Matrix4 | undefined = matrices.get(node);
    if (known !== undefined) return known;
    const rotationTrack: Track | undefined = clip?.rotations.get(node);
    const translationTrack: Track | undefined = clip?.translations.get(node);
    const rotation: Quaternion = rotationTrack === undefined ? new Quaternion().fromArray(node.getRotation()) : sampleRotation(rotationTrack, time);
    const translation: Vector3 = new Vector3().fromArray(translationTrack === undefined ? node.getTranslation() : sample(translationTrack, time));
    const local: Matrix4 = new Matrix4().compose(translation, rotation, new Vector3().fromArray(node.getScale()));
    const parent: Node | null = parentOf(node);
    const world: Matrix4 = parent === null ? local : worldOf(parent).clone().multiply(local);
    matrices.set(node, world);
    return world;
  };
  for (const node of nodes) {
    const position: Vector3 = new Vector3();
    const rotation: Quaternion = new Quaternion();
    worldOf(node).decompose(position, rotation, new Vector3());
    rotations.set(node, rotation);
    positions.set(node, position);
  }
  return { rotations, positions };
}

function named(document: Document): Map<string, Node> {
  const map: Map<string, Node> = new Map<string, Node>();
  for (const node of document.getRoot().listNodes()) map.set(node.getName(), node);
  return map;
}

function depth(node: Node): number {
  const parent: Node | null = parentOf(node);
  return parent === null ? 0 : depth(parent) + 1;
}

function boneDirection(pose: Pose, node: Node, mapped: ReadonlySet<Node>): Vector3 | null {
  const children: Node[] = node.listChildren().filter((child: Node): boolean => mapped.has(child));
  const child: Node | undefined = children[0];
  const from: Vector3 | undefined = pose.positions.get(node);
  const to: Vector3 | undefined = child === undefined ? undefined : pose.positions.get(child);
  if (children.length !== 1 || from === undefined || to === undefined) return null;
  const direction: Vector3 = to.clone().sub(from);
  return direction.lengthSq() > 1e-10 ? direction.normalize() : null;
}

function buildJoints(manifest: Manifest, sourceNodes: Map<string, Node>, targetNodes: Map<string, Node>, sourceRest: Pose, targetRest: Pose): Joint[] {
  const joints: Joint[] = [];
  const sourceMapped: Set<Node> = new Set<Node>();
  const targetMapped: Set<Node> = new Set<Node>();
  const pairs: [Node, Node][] = [];
  for (const [sourceName, targetName] of manifest.joints) {
    const source: Node | undefined = sourceNodes.get(sourceName);
    const target: Node | undefined = targetNodes.get(targetName);
    if (source === undefined) throw new Error(`Source joint "${sourceName}" is not in the clip file`);
    if (target === undefined) throw new Error(`Rig joint "${targetName}" is not in the rig file`);
    pairs.push([source, target]);
    sourceMapped.add(source);
    targetMapped.add(target);
  }
  for (const [source, target] of pairs) {
    const sourceRotation: Quaternion | undefined = sourceRest.rotations.get(source);
    const targetRotation: Quaternion | undefined = targetRest.rotations.get(target);
    if (sourceRotation === undefined || targetRotation === undefined) continue;
    const from: Vector3 | null = boneDirection(sourceRest, source, sourceMapped);
    const to: Vector3 | null = boneDirection(targetRest, target, targetMapped);
    const align: Quaternion = from === null || to === null ? new Quaternion() : new Quaternion().setFromUnitVectors(to, from);
    const degrees: number = (2 * Math.acos(Math.min(1, Math.abs(align.w))) * 180) / Math.PI;
    if (degrees > RETARGET.restWarningDegrees) console.warn(`rest poses differ by ${degrees.toFixed(1)} degrees at ${target.getName()}`);
    joints.push({ target, source, parent: parentOf(target), correction: sourceRotation.clone().invert().multiply(align).multiply(targetRotation) });
  }
  joints.sort((a: Joint, b: Joint): number => depth(a.target) - depth(b.target));
  return joints;
}

function partDuration(part: ClipPart, clip: SourceClip): number {
  return ((part.end ?? clip.duration) - part.start) / part.rate + part.hold;
}

function partTime(part: ClipPart, clip: SourceClip, local: number): number {
  const span: number = (part.end ?? clip.duration) - part.start;
  const within: number = Math.min(span, Math.max(0, local * part.rate));
  return part.reverse ? part.start + span - within : part.start + within;
}

function addClip(document: Document, buffer: Buffer, name: string, joints: readonly Joint[], hips: Node, frames: readonly Frame[]): void {
  const times: Float32Array = new Float32Array(frames.map((_frame: Frame, index: number): number => index / RETARGET.framesPerSecond));
  const input: Accessor = document.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
  const animation: Animation = document.createAnimation(name);
  const add = (node: Node, path: 'rotation' | 'translation', type: 'VEC4' | 'VEC3', values: Float32Array): void => {
    const output: Accessor = document.createAccessor().setType(type).setArray(values).setBuffer(buffer);
    const sampler: AnimationSampler = document.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    const channel: AnimationChannel = document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler);
    animation.addSampler(sampler).addChannel(channel);
  };
  joints.forEach((joint: Joint, jointIndex: number): void => {
    const values: Float32Array = new Float32Array(frames.length * 4);
    let previous: Quaternion | null = null;
    frames.forEach((frame: Frame, frameIndex: number): void => {
      const rotation: Quaternion = (frame.rotations[jointIndex] ?? new Quaternion()).clone();
      if (previous !== null && previous.dot(rotation) < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
      previous = rotation;
      rotation.toArray(values, frameIndex * 4);
    });
    add(joint.target, 'rotation', 'VEC4', values);
  });
  const moved: Float32Array = new Float32Array(frames.length * 3);
  frames.forEach((frame: Frame, index: number): void => {
    frame.hips.toArray(moved, index * 3);
  });
  add(hips, 'translation', 'VEC3', moved);
}

async function main(rigPath: string, sourcePath: string, manifestPath: string, outPath: string): Promise<void> {
  const io: NodeIO = new NodeIO();
  const manifest: Manifest = readManifest(manifestPath);
  const sourceDocument: Document = await io.read(sourcePath);
  const document: Document = await io.read(rigPath);
  for (const animation of document.getRoot().listAnimations()) animation.dispose();
  const sourceNodes: Map<string, Node> = named(sourceDocument);
  const targetNodes: Map<string, Node> = named(document);
  const sourceList: Node[] = [...sourceNodes.values()];
  const targetList: Node[] = [...targetNodes.values()];
  const sourceRest: Pose = poseOf(sourceList, null, 0);
  const targetRest: Pose = poseOf(targetList, null, 0);
  const joints: Joint[] = buildJoints(manifest, sourceNodes, targetNodes, sourceRest, targetRest);
  const hips: Node | undefined = targetNodes.get(manifest.hips);
  const hipsJoint: Joint | undefined = joints.find((joint: Joint): boolean => joint.target === hips);
  const hipsParent: Node | null = hips === undefined ? null : parentOf(hips);
  const sourceHipsRest: Vector3 | undefined = hipsJoint === undefined ? undefined : sourceRest.positions.get(hipsJoint.source);
  const targetHipsRest: Vector3 | undefined = hips === undefined ? undefined : targetRest.positions.get(hips);
  if (hips === undefined || hipsJoint === undefined || sourceHipsRest === undefined || targetHipsRest === undefined) throw new Error(`Hips joint "${manifest.hips}" is not mapped`);
  const heightScale: number = targetHipsRest.y / sourceHipsRest.y;
  for (const joint of joints) {
    const from: Vector3 | undefined = sourceRest.positions.get(joint.source);
    const to: Vector3 | undefined = targetRest.positions.get(joint.target);
    if (from !== undefined && to !== undefined && from.distanceTo(to) > RETARGET.restWarningMetres) console.warn(`rest joints are ${from.distanceTo(to).toFixed(2)} m apart at ${joint.target.getName()}`);
  }
  const parentInverse: Matrix4 = new Matrix4();
  if (hipsParent !== null) {
    const position: Vector3 = targetRest.positions.get(hipsParent) ?? new Vector3();
    const rotation: Quaternion = targetRest.rotations.get(hipsParent) ?? new Quaternion();
    parentInverse.compose(position, rotation, new Vector3(1, 1, 1)).invert();
  }
  const clips: Map<string, SourceClip> = new Map<string, SourceClip>();
  for (const animation of sourceDocument.getRoot().listAnimations()) clips.set(animation.getName(), readClip(animation));
  const buffer: Buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  for (const plan of manifest.clips) {
    const frames: Frame[] = [];
    let total: number = 0;
    const spans: { readonly part: ClipPart; readonly clip: SourceClip; readonly from: number }[] = [];
    for (const part of plan.parts) {
      const clip: SourceClip | undefined = clips.get(part.clip);
      if (clip === undefined) throw new Error(`Clip "${part.clip}" is not in ${sourcePath}`);
      spans.push({ part, clip, from: total });
      total += partDuration(part, clip);
    }
    const count: number = Math.max(2, Math.round(total * RETARGET.framesPerSecond) + 1);
    for (let index: number = 0; index < count; index += 1) {
      const time: number = Math.min(total, index / RETARGET.framesPerSecond);
      const span = spans.findLast((candidate): boolean => candidate.from <= time) ?? spans[0];
      if (span === undefined) continue;
      const pose: Pose = poseOf(sourceList, span.clip, partTime(span.part, span.clip, time - span.from));
      const world: Map<Node, Quaternion> = new Map<Node, Quaternion>();
      const rotations: Quaternion[] = joints.map((joint: Joint): Quaternion => {
        const source: Quaternion = pose.rotations.get(joint.source) ?? new Quaternion();
        const target: Quaternion = source.clone().multiply(joint.correction);
        world.set(joint.target, target);
        const parent: Quaternion = joint.parent === null ? new Quaternion() : (world.get(joint.parent) ?? targetRest.rotations.get(joint.parent) ?? new Quaternion());
        return parent.clone().invert().multiply(target).normalize();
      });
      const sourceHips: Vector3 = pose.positions.get(hipsJoint.source) ?? sourceHipsRest;
      const placed: Vector3 = sourceHips.clone().sub(sourceHipsRest).multiplyScalar(heightScale).add(targetHipsRest).applyMatrix4(parentInverse);
      frames.push({ rotations, hips: placed });
    }
    addClip(document, buffer, plan.name, joints, hips, frames);
    console.log(`${plan.name}: ${total.toFixed(2)}s, ${frames.length} frames`);
  }
  await document.transform(prune({ keepLeaves: true }));
  mkdirSync(dirname(outPath), { recursive: true });
  await io.write(outPath, document);
  console.log(`${outPath}: ${document.getRoot().listAnimations().length} clips, hips scaled by ${heightScale.toFixed(3)}`);
}

const [rigPath, sourcePath, manifestPath, outPath] = process.argv.slice(2);
if (rigPath === undefined || sourcePath === undefined || manifestPath === undefined || outPath === undefined) usage();
await main(rigPath, sourcePath, manifestPath, outPath);
