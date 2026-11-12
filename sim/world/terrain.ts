import type { ZoneTrigger } from '../content/road-types.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { driftOpen } from '../nav/drift.ts';
import type { DriftCells } from '../nav/grid.ts';
import { isWalkable, nearestWalkable, setDriftOpen } from '../nav/grid.ts';
import { allHold } from './conditions.ts';
import { setFlags } from './story.ts';
import { findPath } from '../nav/path.ts';
import type { MonsterState, PlayerState, World } from './types.ts';

const TERRAIN = {
  rescueRadius: 12,
} as const;

function rescue(world: World, actor: PlayerState | MonsterState): void {
  const goal: Vec2 | undefined = actor.path.at(-1);
  if (!actor.alive) return;
  if (!isWalkable(world.grid, actor.pos.x, actor.pos.z)) {
    const safe: Vec2 | null = nearestWalkable(world.grid, actor.pos, TERRAIN.rescueRadius);
    if (safe !== null) {
      actor.pos.x = safe.x;
      actor.pos.z = safe.z;
    }
  }
  actor.path = goal === undefined ? [] : findPath(world.grid, actor.pos, goal);
}

export function stepDrifts(world: World): void {
  let closed: boolean = false;
  for (const patch of world.grid.drifts) {
    const open: boolean = driftOpen(patch.drift, world.time);
    if (open === patch.open) continue;
    setDriftOpen(world.grid, patch, open);
    closed ||= !open;
  }
  if (!closed) return;
  rescue(world, world.player);
  for (const monster of world.monsters) rescue(world, monster);
}

export function openDrifts(world: World): readonly DriftCells[] {
  return world.grid.drifts.filter((patch: DriftCells): boolean => patch.open);
}

export function stepTriggers(world: World): void {
  if (!world.player.alive) return;
  for (const trigger of world.zone.triggers) {
    if (distance(world.player.pos, trigger) > trigger.radius || !allHold(world, trigger.when)) continue;
    if (Object.keys(trigger.sets).every((key: string): boolean => world.flags[key] === trigger.sets[key])) continue;
    world.events.push({ type: 'triggered', trigger: trigger.id, pos: { x: trigger.x, z: trigger.z } });
    setFlags(world, trigger.sets);
  }
}

export function triggerAt(world: World, id: string): ZoneTrigger | null {
  return world.zone.triggers.find((trigger: ZoneTrigger): boolean => trigger.id === id) ?? null;
}
