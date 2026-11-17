import type { AnimationAction, Object3D } from 'three';
import { findNode } from './character-loader.ts';
import type { SpinClips } from './spin-style.ts';

export const SPIN_CLIPS = {
  loopFade: 0.08,
  settle: 0.001,
} as const;

export interface ClipSpin {
  readonly clips: SpinClips;
  readonly pivot: Object3D | null;
  loop: AnimationAction | null;
}

export function startClipSpin(root: Object3D, clips: SpinClips): ClipSpin {
  return { clips, pivot: clips.pivot === 'hips' ? null : (findNode(root, clips.pivot) ?? null), loop: null };
}

export function loopDue(spin: ClipSpin | null, current: AnimationAction): spin is ClipSpin {
  return spin !== null && spin.loop === null && current.time >= current.getClip().duration - SPIN_CLIPS.settle;
}
