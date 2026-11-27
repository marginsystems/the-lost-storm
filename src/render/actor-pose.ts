import type { ReadonlyVec2 } from '../../sim/math.ts';
import { facingOf } from '../../sim/math.ts';
import type { Actor, Motion } from '../../sim/world/types.ts';
import { isTimeHeld, knockTime } from '../../sim/world/movement.ts';

export interface ActorPose {
  readonly pos: ReadonlyVec2;
  readonly facing: number;
  readonly motion: Motion;
  readonly gait: number;
  readonly knockTime: number;
  readonly busy: boolean;
  readonly held: boolean;
  readonly beat: number | null;
  readonly deadTime: number;
}

export function poseOf(actor: Actor, beat: number | null): ActorPose {
  const press = actor.action?.skill.press;
  const stride: ReadonlyVec2 | null = actor.kind === 'player' && actor.motion === 'stride' && press?.type === 'channel' && press.strafe === true ? actor.walked : null;
  return {
    pos: actor.pos,
    facing: stride === null || (stride.x === 0 && stride.z === 0) ? actor.facing : facingOf(stride),
    motion: actor.motion,
    gait: actor.gait,
    knockTime: knockTime(actor),
    busy: actor.action !== null && stride === null,
    held: isTimeHeld(actor),
    beat,
    deadTime: actor.deadTime,
  };
}

export interface SyncOptions {
  readonly rise: number;
  readonly floor: number;
  readonly turnRate: number;
  readonly seen: boolean;
}
