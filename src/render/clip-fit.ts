import type { KeyframeTrack, Object3D } from 'three';
import { AnimationClip, Matrix3, PropertyBinding, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';

export const CLIP_FIT = {
  sameTurn: 1e-6,
  sameMetres: 1e-5,
  carriedFromMetres: 0.25,
  quaternionWidth: 4,
  vectorWidth: 3,
} as const;

interface TrackTarget {
  readonly node: string;
  readonly property: string;
}

function targetOf(track: KeyframeTrack): TrackTarget {
  const parsed: { readonly nodeName: string; readonly propertyName: string } = PropertyBinding.parseTrackName(track.name);
  return { node: parsed.nodeName, property: parsed.propertyName };
}

function worldTurn(node: Object3D | null): Quaternion {
  return node === null ? new Quaternion() : node.getWorldQuaternion(new Quaternion());
}

function worldLinear(node: Object3D | null): Matrix3 {
  return node === null ? new Matrix3() : new Matrix3().setFromMatrix4(node.matrixWorld);
}

function isIdentity(turn: Quaternion): boolean {
  return 1 - Math.abs(turn.w) < CLIP_FIT.sameTurn;
}

function fitTurns(track: KeyframeTrack, from: Object3D, to: Object3D): KeyframeTrack {
  const before: Quaternion = worldTurn(to.parent).invert().multiply(worldTurn(from.parent));
  const after: Quaternion = worldTurn(from).invert().multiply(worldTurn(to));
  const width: number = CLIP_FIT.quaternionWidth;
  if ((isIdentity(before) && isIdentity(after)) || track.values.length !== track.times.length * width) return track;
  const values: Float32Array = new Float32Array(track.values.length);
  const turn: Quaternion = new Quaternion();
  for (let key: number = 0; key < track.times.length; key += 1) {
    turn.fromArray(track.values, key * width).premultiply(before).multiply(after).normalize().toArray(values, key * width);
  }
  const fitted: QuaternionKeyframeTrack = new QuaternionKeyframeTrack(track.name, track.times, values);
  fitted.setInterpolation(track.getInterpolation());
  return fitted;
}

function carriedRatio(from: Object3D, to: Object3D): number {
  const sourceHeight: number = from.getWorldPosition(new Vector3()).y;
  const targetHeight: number = to.getWorldPosition(new Vector3()).y;
  return sourceHeight > CLIP_FIT.carriedFromMetres && targetHeight > CLIP_FIT.carriedFromMetres ? targetHeight / sourceHeight : 1;
}

function fitMoves(track: KeyframeTrack, from: Object3D, to: Object3D): KeyframeTrack {
  const width: number = CLIP_FIT.vectorWidth;
  if (track.values.length !== track.times.length * width) return track;
  const outward: Matrix3 = worldLinear(from.parent);
  const inward: Matrix3 = worldLinear(to.parent).invert();
  const ratio: number = carriedRatio(from, to);
  const values: Float32Array = new Float32Array(track.values.length);
  const move: Vector3 = new Vector3();
  let changed: boolean = false;
  for (let key: number = 0; key < track.times.length; key += 1) {
    move
      .fromArray(track.values, key * width)
      .sub(from.position)
      .applyMatrix3(outward)
      .multiplyScalar(ratio)
      .applyMatrix3(inward)
      .add(to.position)
      .toArray(values, key * width);
    for (let axis: number = 0; axis < width; axis += 1) {
      if (Math.abs((values[key * width + axis] ?? 0) - (track.values[key * width + axis] ?? 0)) > CLIP_FIT.sameMetres) changed = true;
    }
  }
  if (!changed) return track;
  const fitted: VectorKeyframeTrack = new VectorKeyframeTrack(track.name, track.times, values);
  fitted.setInterpolation(track.getInterpolation());
  return fitted;
}

export function fitClip(clip: AnimationClip, source: Object3D, target: Object3D): AnimationClip {
  source.updateWorldMatrix(true, true);
  target.updateWorldMatrix(true, true);
  let changed: boolean = false;
  const tracks: KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const aim: TrackTarget = targetOf(track);
    const from: Object3D | undefined = source.getObjectByName(aim.node);
    const to: Object3D | undefined = target.getObjectByName(aim.node);
    if (to === undefined) {
      changed = true;
      continue;
    }
    if (from === undefined || (aim.property !== 'quaternion' && aim.property !== 'position')) {
      tracks.push(track);
      continue;
    }
    const fitted: KeyframeTrack = aim.property === 'quaternion' ? fitTurns(track, from, to) : fitMoves(track, from, to);
    if (fitted !== track) changed = true;
    tracks.push(fitted);
  }
  return changed ? new AnimationClip(clip.name, clip.duration, tracks, clip.blendMode) : clip;
}
