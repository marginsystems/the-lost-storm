import { glidesWith } from '../sim/world/momentum.ts';
import type { Delivery, SkillDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import type { Movement } from './settings/bindings.ts';

export type HeroMotion = 'carried' | 'strafe' | 'rolled' | 'aimed' | 'still';

export const SKILL_STEER = {
  keyReach: 6,
} as const;

export interface SteerInput {
  readonly movement: Movement;
  readonly keys: Vec2 | null;
  readonly cursor: Vec2 | null;
  readonly from: Vec2;
}

const DELIVERY_MOTION: Readonly<Record<Delivery['type'], HeroMotion>> = {
  dash: 'rolled',
  blink: 'aimed',
  arc: 'still',
  nova: 'still',
  projectile: 'still',
  mark: 'still',
  revive: 'still',
  field: 'still',
  chain: 'still',
  area: 'still',
  beam: 'still',
};

export function heroMotion(skill: SkillDef): HeroMotion {
  if (skill.press?.type === 'channel' && skill.press.strafe === true) return 'strafe';
  if (glidesWith(skill.press)) return 'carried';
  if (skill.leap !== null) return 'aimed';
  return DELIVERY_MOTION[skill.delivery.type];
}

function ahead(from: Vec2, way: Vec2): Vec2 {
  return { x: from.x + way.x * SKILL_STEER.keyReach, z: from.z + way.z * SKILL_STEER.keyReach };
}

const KEY_AIM: Readonly<Record<HeroMotion, (input: SteerInput) => Vec2 | null>> = {
  carried: (input: SteerInput): Vec2 | null => (input.keys === null ? { x: input.from.x, z: input.from.z } : ahead(input.from, input.keys)),
  strafe: (input: SteerInput): Vec2 | null => input.cursor,
  rolled: (input: SteerInput): Vec2 | null => (input.keys === null ? input.cursor : ahead(input.from, input.keys)),
  aimed: (input: SteerInput): Vec2 | null => input.cursor,
  still: (input: SteerInput): Vec2 | null => input.cursor,
};

export function motionAim(motion: HeroMotion, input: SteerInput): Vec2 | null {
  return input.movement === 'keys' ? KEY_AIM[motion](input) : input.cursor;
}
