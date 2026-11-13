import type { KeyframeTrack, Object3D } from 'three';
import { AnimationClip, PropertyBinding, Quaternion, QuaternionKeyframeTrack } from 'three';

const WIDTH: number = 4;

function nodeOf(track: KeyframeTrack): string {
  const parsed: { readonly nodeName: string } = PropertyBinding.parseTrackName(track.name);
  return parsed.nodeName;
}

function isTurn(track: KeyframeTrack): boolean {
  return track.name.endsWith('.quaternion') && track.values.length === track.times.length * WIDTH;
}

export function carryJoints(model: Object3D, holding: readonly string[], arms: readonly string[]): Set<string> {
  const arm: Set<string> = new Set<string>(arms.map((name: string): string => PropertyBinding.sanitizeNodeName(name)));
  const joints: Set<string> = new Set<string>();
  for (const name of holding) {
    const hand: Object3D | undefined = model.getObjectByName(PropertyBinding.sanitizeNodeName(name));
    if (hand === undefined) continue;
    joints.add(hand.name);
    for (let above: Object3D | null = hand.parent; above !== null && arm.has(above.name); above = above.parent) joints.add(above.name);
  }
  return joints;
}

export function carriedClip(gait: AnimationClip, held: AnimationClip, joints: ReadonlySet<string>, keep: number): AnimationClip {
  const steady: Map<string, Quaternion> = new Map<string, Quaternion>();
  for (const track of held.tracks) if (isTurn(track) && joints.has(nodeOf(track))) steady.set(nodeOf(track), new Quaternion().fromArray(track.values, 0));
  const turn: Quaternion = new Quaternion();
  const tracks: KeyframeTrack[] = gait.tracks.map((track: KeyframeTrack): KeyframeTrack => {
    const rest: Quaternion | undefined = isTurn(track) ? steady.get(nodeOf(track)) : undefined;
    if (rest === undefined) return track;
    const values: Float32Array = new Float32Array(track.values.length);
    for (let key: number = 0; key < track.times.length; key += 1) {
      turn.fromArray(track.values, key * WIDTH);
      if (turn.dot(rest) < 0) turn.set(-turn.x, -turn.y, -turn.z, -turn.w);
      turn.slerpQuaternions(rest, turn.clone(), keep).toArray(values, key * WIDTH);
    }
    const made: QuaternionKeyframeTrack = new QuaternionKeyframeTrack(track.name, track.times, values);
    made.setInterpolation(track.getInterpolation());
    return made;
  });
  const changed: boolean = tracks.some((track: KeyframeTrack, index: number): boolean => track !== gait.tracks[index]);
  return changed ? new AnimationClip(gait.name, gait.duration, tracks, gait.blendMode) : gait;
}
