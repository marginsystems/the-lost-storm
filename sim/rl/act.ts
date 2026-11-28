import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { directionOf } from '../math.ts';
import { lineOfSight } from '../nav/grid.ts';
import { findActor } from '../world/combat.ts';
import { isPrimary } from '../world/heroes.ts';
import type { Actor, Command, GroundItem, Intent, PlayerState, World } from '../world/types.ts';
import type { Action } from './contract.ts';
import { PICKUP_CHOICE, RL } from './contract.ts';
import { moveBucket, moveDirection } from './moves.ts';
import type { View } from './observe.ts';
import { movesHero, skillNumbers } from './skill-numbers.ts';

export const ACT = {
  minDash: 1,
} as const;

function ahead(from: Vec2, direction: Vec2, reach: number): Vec2 {
  return { x: from.x + direction.x * reach, z: from.z + direction.z * reach };
}

function skillCommands(player: PlayerState, slot: number, skill: SkillDef, direction: Vec2 | null, target: Actor | null): Command[] {
  const press: Command[] = skill.press !== null && !player.held.includes(slot) ? [{ type: 'hold', slot, down: true }] : [];
  if (movesHero(skill)) {
    const reach: number = Math.max(ACT.minDash, skillNumbers(skill).reach);
    const aim: Vec2 = direction !== null ? ahead(player.pos, direction, reach) : target !== null ? target.pos : ahead(player.pos, directionOf(player.facing), reach);
    return [...press, { type: 'skill', slot, aim, targetId: null }];
  }
  const aim: Vec2 = target !== null ? { x: target.pos.x, z: target.pos.z } : ahead(player.pos, direction ?? directionOf(player.facing), RL.moveReach);
  return [...press, { type: 'skill', slot, aim, targetId: target?.id ?? null }];
}

function routed(world: World, player: PlayerState, commands: readonly Command[]): Command[] {
  return isPrimary(world, player) ? [...commands] : commands.map((command: Command): Command => ({ ...command, by: player.id }));
}

export function commandsFor(world: World, action: Action, view: View, seekSight: boolean = false): Command[] {
  return routed(world, view.hero, heroCommands(world, action, view, seekSight));
}

function needsSight(skill: SkillDef | null): boolean {
  const type = skill?.delivery.type;
  return type === 'projectile' || type === 'chain' || type === 'beam';
}

function heroCommands(world: World, action: Action, view: View, seekSight: boolean): Command[] {
  const player: PlayerState = view.hero;
  if (!player.alive) return [];
  const slot: number = action.skill - 1;
  const skill: SkillDef | null = slot >= 0 ? (player.skills[slot] ?? null) : null;
  const direction: Vec2 | null = moveDirection(action.move);
  const target: Actor | null = view.targets[action.target] ?? view.targets[0] ?? null;
  const ground: GroundItem | null = action.use === PICKUP_CHOICE ? view.pickup : null;
  const approach: Vec2 | null = seekSight && target !== null && needsSight(skill) && !lineOfSight(world.grid, player.pos, target.pos) ? { ...target.pos } : null;
  const kept: number | null = ground === null && approach === null ? slot : null;
  const out: Command[] = player.held.filter((held: number): boolean => held !== kept).map((held: number): Command => ({ type: 'hold', slot: held, down: false }));
  if (ground !== null) out.push({ type: 'pickup', groundId: ground.id });
  else if (approach !== null) out.push({ type: 'move', held: false, dest: approach });
  else if (skill !== null) out.push(...skillCommands(player, slot, skill, direction, target));
  else if (direction !== null) out.push({ type: 'move', held: false, dest: ahead(player.pos, direction, RL.moveReach) });
  else if (action.use === 0 && player.intent.type !== 'idle') out.push({ type: 'stop' });
  if (action.use > 0 && action.use < PICKUP_CHOICE) out.push({ type: 'flask', slot: action.use - 1 });
  return out;
}

function nearestTarget(view: View, at: Vec2): number {
  let best: number = 0;
  let bestGap: number = Infinity;
  view.targets.forEach((actor: Actor, index: number): void => {
    const gap: number = Math.hypot(actor.pos.x - at.x, actor.pos.z - at.z);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });
  return best;
}

export interface Carried {
  readonly move: number;
  readonly skill: number;
  readonly target: number;
}

export const NO_CARRY: Carried = { move: 0, skill: 0, target: 0 };

export function carriedOrder(world: World, view: View, from: Vec2): Carried {
  const player: PlayerState = view.hero;
  const intent: Intent = player.intent;
  if (intent.type === 'move') return { move: moveBucket({ x: intent.dest.x - from.x, z: intent.dest.z - from.z }), skill: 0, target: 0 };
  if (intent.type === 'attack' && (player.skills[intent.slot] ?? null) !== null) {
    const found: number = view.targets.findIndex((actor: Actor): boolean => actor.id === intent.targetId);
    if (found >= 0) return { move: 0, skill: intent.slot + 1, target: found };
    const aimed: Actor | null = findActor(world, intent.targetId);
    if (aimed !== null && aimed.alive && view.targets.length > 0) return { move: 0, skill: intent.slot + 1, target: nearestTarget(view, aimed.pos) };
  }
  return NO_CARRY;
}

export function actionOf(commands: readonly Command[], view: View, from: Vec2, carried: Carried): Action {
  const player: PlayerState = view.hero;
  let move: number = 0;
  let skill: number = 0;
  let target: number = 0;
  let use: number = 0;
  for (const command of commands) {
    if (command.type === 'skill' && skill === 0) {
      const def: SkillDef | null = player.skills[command.slot] ?? null;
      if (def === null) continue;
      skill = command.slot + 1;
      const found: number = command.targetId === null ? -1 : view.targets.findIndex((actor: Actor): boolean => actor.id === command.targetId);
      target = found >= 0 ? found : nearestTarget(view, command.aim);
      if (movesHero(def)) move = moveBucket({ x: command.aim.x - from.x, z: command.aim.z - from.z });
    }
    else if ((command.type === 'move' || command.type === 'walk') && skill === 0) move = moveBucket({ x: command.dest.x - from.x, z: command.dest.z - from.z });
    else if (command.type === 'flask' && use === 0) use = Math.min(command.slot + 1, RL.flasks);
    else if (command.type === 'pickup') use = PICKUP_CHOICE;
  }
  if (move === 0 && skill === 0) {
    move = carried.move;
    skill = carried.skill;
    target = carried.target;
  }
  return { move, skill, target: Math.min(target, RL.targets - 1), use };
}
