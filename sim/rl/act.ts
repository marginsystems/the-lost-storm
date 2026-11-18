import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Command, Intent, MonsterState, PlayerState, World } from '../world/types.ts';
import type { Action } from './contract.ts';
import { MOVE_CHOICES, RL } from './contract.ts';
import type { View } from './observe.ts';
import { movesHero, skillNumbers } from './skill-numbers.ts';

export const ACT = {
  still: 0.25,
  minDash: 1,
} as const;

const DIRECTIONS: number = MOVE_CHOICES - 1;

export function moveDirection(move: number): Vec2 | null {
  if (move < 1 || move > DIRECTIONS) return null;
  const angle: number = ((move - 1) / DIRECTIONS) * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

export function moveBucket(offset: Vec2): number {
  if (Math.hypot(offset.x, offset.z) < ACT.still) return 0;
  const turn: number = Math.atan2(offset.z, offset.x) / (Math.PI * 2);
  const index: number = Math.round(turn * DIRECTIONS);
  return (((index % DIRECTIONS) + DIRECTIONS) % DIRECTIONS) + 1;
}

function ahead(from: Vec2, direction: Vec2, reach: number): Vec2 {
  return { x: from.x + direction.x * reach, z: from.z + direction.z * reach };
}

function facingOf(player: PlayerState): Vec2 {
  return { x: Math.cos(player.facing), z: Math.sin(player.facing) };
}

function skillCommands(player: PlayerState, slot: number, skill: SkillDef, direction: Vec2 | null, target: MonsterState | null): Command[] {
  const press: Command[] = skill.press !== null && !player.held.includes(slot) ? [{ type: 'hold', slot, down: true }] : [];
  if (movesHero(skill)) {
    const reach: number = Math.max(ACT.minDash, skillNumbers(skill).reach);
    const aim: Vec2 = direction !== null ? ahead(player.pos, direction, reach) : target !== null ? target.pos : ahead(player.pos, facingOf(player), reach);
    return [...press, { type: 'skill', slot, aim, targetId: null }];
  }
  const aim: Vec2 = target !== null ? { x: target.pos.x, z: target.pos.z } : ahead(player.pos, direction ?? facingOf(player), RL.moveReach);
  return [...press, { type: 'skill', slot, aim, targetId: target?.id ?? null }];
}

export function commandsFor(world: World, action: Action, view: View): Command[] {
  const player: PlayerState = world.player;
  if (!player.alive) return [];
  const slot: number = action.skill - 1;
  const skill: SkillDef | null = slot >= 0 ? (player.skills[slot] ?? null) : null;
  const direction: Vec2 | null = moveDirection(action.move);
  const target: MonsterState | null = view.targets[action.target] ?? view.targets[0] ?? null;
  const out: Command[] = player.held.filter((held: number): boolean => held !== slot).map((held: number): Command => ({ type: 'hold', slot: held, down: false }));
  if (skill !== null) out.push(...skillCommands(player, slot, skill, direction, target));
  else if (direction !== null) out.push({ type: 'move', held: false, dest: ahead(player.pos, direction, RL.moveReach) });
  else if (action.flask === 0 && player.intent.type !== 'idle') out.push({ type: 'stop' });
  if (action.flask > 0) out.push({ type: 'flask', slot: action.flask - 1 });
  return out;
}

function nearestTarget(view: View, at: Vec2): number {
  let best: number = 0;
  let bestGap: number = Infinity;
  view.targets.forEach((monster: MonsterState, index: number): void => {
    const gap: number = Math.hypot(monster.pos.x - at.x, monster.pos.z - at.z);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });
  return best;
}

interface Carried {
  readonly move: number;
  readonly skill: number;
  readonly target: number;
}

function carriedOrder(world: World, intent: Intent, view: View, from: Vec2): Carried {
  const player: PlayerState = world.player;
  if (intent.type === 'move') return { move: moveBucket({ x: intent.dest.x - from.x, z: intent.dest.z - from.z }), skill: 0, target: 0 };
  if (intent.type === 'attack' && (player.skills[intent.slot] ?? null) !== null) {
    const found: number = view.targets.findIndex((monster: MonsterState): boolean => monster.id === intent.targetId);
    if (found >= 0) return { move: 0, skill: intent.slot + 1, target: found };
    const aimed: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.id === intent.targetId && monster.alive);
    if (aimed !== undefined && view.targets.length > 0) return { move: 0, skill: intent.slot + 1, target: nearestTarget(view, aimed.pos) };
  }
  return { move: 0, skill: 0, target: 0 };
}

export function actionOf(world: World, commands: readonly Command[], view: View, from: Vec2, before: Intent): Action {
  const player: PlayerState = world.player;
  let move: number = 0;
  let skill: number = 0;
  let target: number = 0;
  let flask: number = 0;
  for (const command of commands) {
    if (command.type === 'skill' && skill === 0) {
      const def: SkillDef | null = player.skills[command.slot] ?? null;
      if (def === null) continue;
      skill = command.slot + 1;
      const found: number = command.targetId === null ? -1 : view.targets.findIndex((monster: MonsterState): boolean => monster.id === command.targetId);
      target = found >= 0 ? found : nearestTarget(view, command.aim);
      if (movesHero(def)) move = moveBucket({ x: command.aim.x - from.x, z: command.aim.z - from.z });
    }
    else if ((command.type === 'move' || command.type === 'walk') && skill === 0) move = moveBucket({ x: command.dest.x - from.x, z: command.dest.z - from.z });
    else if (command.type === 'flask' && flask === 0) flask = command.slot + 1;
  }
  if (move === 0 && skill === 0) {
    const carried: Carried = carriedOrder(world, before, view, from);
    move = carried.move;
    skill = carried.skill;
    target = carried.target;
  }
  return { move, skill, target: Math.min(target, RL.targets - 1), flask: Math.min(flask, RL.flasks) };
}
