import type { AnimationClip } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clipUrl } from '../../sim/content/clips.ts';
import { gestureClips } from '../../sim/content/gestures.ts';
import type { LoadedRig } from './character-library.ts';
import { loadKeptModel } from './character-library.ts';
import { fitClip } from './clip-fit.ts';
import type { TurnGate } from './paced-work.ts';

export type FetchClip = (rig: LoadedRig, clip: string) => Promise<AnimationClip>;

export interface GestureClips {
  want(rig: LoadedRig): void;
  clip(rig: LoadedRig, name: string): AnimationClip | null;
}

type Slot = { readonly kind: 'loading' } | { readonly kind: 'failed' } | { readonly kind: 'ready'; readonly clip: AnimationClip };

export function createGestureClips(fetch: FetchClip, names: readonly string[] = gestureClips()): GestureClips {
  const byRig: WeakMap<LoadedRig, Map<string, Slot>> = new WeakMap<LoadedRig, Map<string, Slot>>();
  const slotsOf = (rig: LoadedRig): Map<string, Slot> => {
    const found: Map<string, Slot> | undefined = byRig.get(rig);
    if (found !== undefined) return found;
    const made: Map<string, Slot> = new Map<string, Slot>();
    byRig.set(rig, made);
    return made;
  };
  const load = async (rig: LoadedRig, name: string, slots: Map<string, Slot>): Promise<void> => {
    slots.set(name, { kind: 'loading' });
    try {
      slots.set(name, { kind: 'ready', clip: await fetch(rig, name) });
    } catch {
      slots.set(name, { kind: 'failed' });
    }
  };
  return {
    want(rig: LoadedRig): void {
      const slots: Map<string, Slot> = slotsOf(rig);
      for (const name of names) if (!slots.has(name)) void load(rig, name, slots);
    },
    clip(rig: LoadedRig, name: string): AnimationClip | null {
      const slot: Slot | undefined = byRig.get(rig)?.get(name);
      return slot?.kind === 'ready' ? slot.clip : null;
    },
  };
}

export function fetchGestureClip(loader: GLTFLoader, gate: TurnGate): FetchClip {
  return async (rig: LoadedRig, name: string): Promise<AnimationClip> => {
    const gltf: GLTF = await loadKeptModel(loader, clipUrl(rig.def, name), gate);
    const clip: AnimationClip | undefined = gltf.animations.find((entry: AnimationClip): boolean => entry.name === name);
    if (clip === undefined) throw new Error(`Gesture clip "${name}" is not in ${clipUrl(rig.def, name)}`);
    return fitClip(clip, gltf.scene, rig.template);
  };
}
