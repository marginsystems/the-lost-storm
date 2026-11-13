import type { Object3D } from 'three';
import { Euler, PropertyBinding, Quaternion } from 'three';
import { stepSpring } from './lobby-orbit.ts';
import type { Spring } from './lobby-orbit.ts';

export const LOBBY_LIFE = {
  breathHz: 0.25,
  breathRadians: 0.012,
  glanceYawRadians: 0.07,
  glancePitchRadians: 0.03,
  glanceYawHz: [0.041, 0.097, 0.163],
  glancePitchHz: [0.053, 0.121],
  glanceYawPeak: 1.7,
  glancePitchPeak: 1.5,
  phaseSpreadSeconds: 17,
  weightIn: { freq: 1.1, damping: 0.8 },
} as const;

export interface LifeOffsets {
  readonly lean: number;
  readonly headYaw: number;
  readonly headPitch: number;
}

export interface BodyRoles {
  readonly head: string | null;
  readonly torso: readonly string[];
}

export interface LobbyLife {
  step(dt: number): void;
}

interface Applied {
  readonly result: Quaternion;
  readonly offset: Quaternion;
  set: boolean;
}

const NO_OFFSETS: LifeOffsets = { lean: 0, headYaw: 0, headPitch: 0 };

function wave(hz: number, t: number): number {
  return Math.sin(2 * Math.PI * hz * t);
}

export function lifeOffsets(t: number, weight: number): LifeOffsets {
  if (weight <= 0) return NO_OFFSETS;
  const [yawSlow, yawMid, yawFast] = LOBBY_LIFE.glanceYawHz;
  const [pitchSlow, pitchFast] = LOBBY_LIFE.glancePitchHz;
  return {
    lean: weight * LOBBY_LIFE.breathRadians * wave(LOBBY_LIFE.breathHz, t),
    headYaw: (weight * LOBBY_LIFE.glanceYawRadians * (wave(yawSlow, t + 3.1) + 0.5 * wave(yawMid, t + 0.4) + 0.2 * wave(yawFast, t + 5.2))) / LOBBY_LIFE.glanceYawPeak,
    headPitch: (weight * LOBBY_LIFE.glancePitchRadians * (wave(pitchSlow, t + 1.3) + 0.5 * wave(pitchFast, t + 2.6))) / LOBBY_LIFE.glancePitchPeak,
  };
}

export function bodyRoles(parts: Readonly<Record<string, readonly string[]>>): BodyRoles {
  return { head: parts['head']?.[0] ?? null, torso: parts['torso'] ?? [] };
}

export function boneNamed(root: Object3D, name: string | null): Object3D | null {
  if (name === null) return null;
  return root.getObjectByName(PropertyBinding.sanitizeNodeName(name)) ?? root.getObjectByName(name) ?? null;
}

export function spineBelow(head: Object3D | null, torso: readonly string[]): Object3D[] {
  const names: Set<string> = new Set(torso.flatMap((name: string): string[] => [name, PropertyBinding.sanitizeNodeName(name)]));
  const chain: Object3D[] = [];
  for (let bone: Object3D | null = head?.parent ?? null; bone !== null; bone = bone.parent) if (names.has(bone.name)) chain.push(bone);
  return chain.toReversed();
}

export function createLobbyLife(root: Object3D, seed: number, roles: BodyRoles): LobbyLife {
  const head: Object3D | null = boneNamed(root, roles.head);
  const spines: Object3D[] = spineBelow(head, roles.torso);
  const living: Object3D[] = head === null ? spines : [...spines, head];
  const applied: Map<Object3D, Applied> = new Map(living.map((bone: Object3D): [Object3D, Applied] => [bone, { result: new Quaternion(), offset: new Quaternion(), set: false }]));
  const undo: Quaternion = new Quaternion();
  const offsetOf = (bone: Object3D, offset: Quaternion): void => {
    const last: Applied | undefined = applied.get(bone);
    if (last === undefined) return;
    if (last.set && bone.quaternion.equals(last.result)) bone.quaternion.multiply(undo.copy(last.offset).invert());
    bone.quaternion.multiply(offset);
    last.offset.copy(offset);
    last.result.copy(bone.quaternion);
    last.set = true;
  };
  const weight: Spring = { x: 0, v: 0 };
  const turn: Quaternion = new Quaternion();
  const angles: Euler = new Euler();
  let t: number = (((seed * 0.618034) % 1) + 1) % 1 * LOBBY_LIFE.phaseSpreadSeconds;
  return {
    step(dt: number): void {
      t += dt;
      const share: number = Math.min(1, Math.max(0, stepSpring(weight, 1, LOBBY_LIFE.weightIn.freq, LOBBY_LIFE.weightIn.damping, dt)));
      const offsets: LifeOffsets = lifeOffsets(t, share);
      if (offsets === NO_OFFSETS) return;
      const lean: number = spines.length === 0 ? 0 : offsets.lean / spines.length;
      for (const bone of spines) offsetOf(bone, turn.setFromEuler(angles.set(lean, 0, 0)));
      if (head !== null) offsetOf(head, turn.setFromEuler(angles.set(offsets.headPitch, offsets.headYaw, 0)));
    },
  };
}
