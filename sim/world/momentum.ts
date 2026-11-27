import type { MomentumDef, MomentumSpend, PressDef } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { distance, facingOf } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { moveWithCollision } from '../nav/grid.ts';
import { lengthened, widenedSkill } from '../widen.ts';
import type { MomentumState } from './momentum-types.ts';
import { mendActor } from './mend.ts';
import type { ActionState, Actor, PlayerState, World } from './types.ts';
import { turnToward } from './movement.ts';

export const MOMENTUM = {
  arrive: 0.5,
  moved: 1e-4,
  fullTurn: Math.PI * 2,
} as const;

export interface MomentumStep {
  readonly turn: number;
  readonly reach: number;
}

const STILL: MomentumStep = { turn: 1, reach: 1 };

export function momentumStep(def: MomentumDef, value: number): MomentumStep {
  let step: MomentumStep = STILL;
  for (const tier of def.tiers) if (value >= tier.at) step = tier;
  return step;
}

export function momentumDef(player: PlayerState): MomentumDef | null {
  const id: string | null = player.momentum.skill;
  if (id === null) return null;
  return player.skills.find((skill: SkillDef | null): boolean => skill !== null && skill.id === id)?.momentum ?? null;
}

export function momentumOf(actor: Actor, skill: SkillDef): number {
  if (actor.kind !== 'player' || skill.momentum === null || actor.momentum.skill !== skill.id) return 0;
  return actor.momentum.value;
}

export function momentumShare(player: PlayerState): number {
  const def: MomentumDef | null = momentumDef(player);
  return def === null ? 0 : Math.min(1, player.momentum.value / def.cap);
}

export function feedMomentum(world: World, actor: Actor, skill: SkillDef, hits: number): void {
  const def: MomentumDef | null = skill.momentum;
  if (actor.kind !== 'player' || def === null || hits <= 0) return;
  const state: MomentumState = actor.momentum;
  if (state.skill !== skill.id) {
    state.skill = skill.id;
    state.value = 0;
  }
  state.value = Math.min(def.cap, state.value + def.perHit * hits);
  state.quiet = 0;
  actor.mana = Math.min(actor.stats.maxMana, actor.mana + def.manaPerHit * hits);
  mendActor(world, actor, def.lifePerHit * hits);
}

export function spentSkill(skill: SkillDef, held: number, share: number): SkillDef {
  const spend: MomentumSpend | null = skill.spend;
  if (spend === null || held <= 0) return skill;
  const power: number = 1 + spend.damage * held;
  const weight: number = Math.sqrt(power);
  const wide: SkillDef = widenedSkill(skill, 1 + spend.area * held);
  return {
    ...wide,
    delivery: lengthened(wide.delivery, 1 + spend.range * held),
    damage: { ...skill.damage, weaponPercent: skill.damage.weaponPercent * power, flatMin: skill.damage.flatMin * power, flatMax: skill.damage.flatMax * power },
    shake: skill.shake * weight,
    hitStop: skill.hitStop * weight,
    stun: skill.stun > 0 ? skill.stun + spend.stun * share : 0,
    spent: share,
  };
}

export function spendMomentum(actor: Actor, skill: SkillDef): SkillDef {
  if (actor.kind !== 'player' || skill.spend === null) return skill;
  const state: MomentumState = actor.momentum;
  const def: MomentumDef | null = momentumDef(actor);
  const held: number = def === null ? 0 : state.value;
  const share: number = def === null ? 0 : Math.min(1, held / def.cap);
  state.value = 0;
  return spentSkill(skill, held, share);
}

export function stepMomentum(player: PlayerState, dt: number): void {
  const state: MomentumState = player.momentum;
  if (state.value <= 0) return;
  const def: MomentumDef | null = momentumDef(player);
  if (def === null) {
    state.skill = null;
    state.value = 0;
    return;
  }
  state.quiet += dt;
  const draining: number = Math.min(dt, state.quiet - def.grace);
  state.value = Math.min(def.cap, Math.max(0, state.value - def.drain * Math.max(0, draining)));
}

export function steadied(actor: Actor): boolean {
  if (actor.kind !== 'player' || actor.momentum.value <= 0) return false;
  const def: MomentumDef | null = momentumDef(actor);
  return def !== null && actor.momentum.value >= def.steady;
}

export function glidesWith(press: PressDef | null): boolean {
  return press?.type === 'channel' && press.move > 0 && press.strafe !== true;
}

function glideSpeed(action: ActionState): number {
  const press: PressDef | null = action.skill.press;
  if (press?.type !== 'channel' || action.phase === 'recovery') return 0;
  return press.move;
}

export function aimGlide(player: PlayerState, dest: ReadonlyVec2): boolean {
  const action: ActionState | null = player.action;
  if (action === null || glideSpeed(action) <= 0) return false;
  action.goal = { x: dest.x, z: dest.z };
  return true;
}

export function glide(grid: NavGrid, player: PlayerState, dt: number, turnRate: number, pace: number = 1): boolean {
  const action: ActionState | null = player.action;
  if (action === null || action.goal === null || player.root > 0 || player.tempo <= 0) return false;
  const share: number = glideSpeed(action);
  const goal: Vec2 = action.goal;
  const gap: number = distance(player.pos, goal);
  if (share <= 0 || gap <= MOMENTUM.arrive) return false;
  const step: number = Math.min(gap, player.stats.moveSpeed * pace * share * player.tempo * dt);
  const from: Vec2 = { x: player.pos.x, z: player.pos.z };
  const toward: Vec2 = { x: (goal.x - from.x) / gap, z: (goal.z - from.z) / gap };
  moveWithCollision(grid, player.pos, toward.x * step, toward.z * step);
  if (distance(from, player.pos) <= MOMENTUM.moved) return false;
  if (glidesWith(action.skill.press)) player.facing = turnToward(player.facing, facingOf(toward), turnRate * dt);
  else player.motion = 'stride';
  return true;
}

function wrapTurn(angle: number): number {
  const wrapped: number = angle % MOMENTUM.fullTurn;
  if (wrapped > Math.PI) return wrapped - MOMENTUM.fullTurn;
  if (wrapped <= -Math.PI) return wrapped + MOMENTUM.fullTurn;
  return wrapped;
}

export function settleTurn(actor: Actor, action: ActionState): void {
  if (action.turned === 0) return;
  actor.facing = wrapTurn(actor.facing + action.turned);
  action.turned = 0;
}
