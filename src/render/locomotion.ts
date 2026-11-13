import { GAIT } from '../../sim/gait.ts';
import type { Motion } from '../../sim/world/types.ts';

export { chooseGait } from '../../sim/gait.ts';
export type { GaitChoice, GaitSpeed } from '../../sim/gait.ts';

export const LOCOMOTION = {
  minSpeed: GAIT.minSpeed,
  switchMargin: GAIT.switchMargin,
  hurryCost: GAIT.hurryCost,
  hop: 0.22,
  fullHopTime: 0.35,
  tilt: 0.2,
} as const;

export type ClipKind = 'idle' | 'gait' | 'knock' | 'action' | 'rise';

export function clipKindOf(motion: Motion): ClipKind {
  switch (motion) {
    case 'still':
      return 'idle';
    case 'stride':
      return 'gait';
    case 'knocked':
    case 'pulled':
      return 'knock';
    case 'dash':
    case 'lunge':
      return 'action';
    case 'rising':
      return 'rise';
  }
  return 'idle';
}

export interface KnockPose {
  readonly lift: number;
  readonly lean: number;
}

export function knockPose(span: number, left: number): KnockPose {
  if (span <= 0) return { lift: 0, lean: 0 };
  const arc: number = Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - left / span)));
  const size: number = Math.min(1, span / LOCOMOTION.fullHopTime);
  return { lift: LOCOMOTION.hop * size * arc, lean: LOCOMOTION.tilt * size * arc };
}

export const BODY_STATES = ['idle', 'move', 'attack', 'hit', 'knockback', 'death'] as const;

export type BodyState = (typeof BODY_STATES)[number];

export interface StateClipSet<T> {
  readonly idle: T;
  readonly gaits: readonly T[];
  readonly hit: readonly T[];
  readonly death: readonly T[];
  readonly rise: T | null;
  readonly action: T | null;
}

export function clipsFor<T>(state: BodyState, set: StateClipSet<T>): readonly T[] {
  switch (state) {
    case 'idle':
      return [set.idle];
    case 'move':
      return set.gaits.length > 0 ? set.gaits : [set.idle];
    case 'attack':
      return set.action === null ? [set.idle] : [set.action];
    case 'hit':
    case 'knockback':
      return set.hit.length > 0 ? set.hit : [set.idle];
    case 'death':
      if (set.death.length > 0) return set.death;
      return set.rise === null ? [set.idle] : [set.rise];
  }
  return [set.idle];
}
