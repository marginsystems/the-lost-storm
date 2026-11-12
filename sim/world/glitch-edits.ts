import type { CorpseGoneEdit, GlitchEdit, MonsterDeadEdit, PropPair, PropShiftEdit, PropSwapEdit } from '../content/glitches.ts';
import type { ZoneDef, ZoneProp } from '../content/types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { distance, normalize, sub } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { buildNavGrid, cellIndex, nearestWalkable } from '../nav/grid.ts';
import { isFloorCell } from '../nav/layout.ts';
import type { Rng } from '../rng.ts';
import { kill } from './combat.ts';
import type { MonsterState, World } from './types.ts';

export const GLITCH_EDITS = {
  shiftTries: 8,
  snapRadius: 2,
} as const;

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function pick<T>(rng: Rng, list: readonly T[]): T | null {
  if (list.length === 0) return null;
  return list[Math.min(list.length - 1, Math.floor(rng.next() * list.length))] ?? null;
}

function reachable(grid: NavGrid, from: ReadonlyVec2): Uint8Array {
  const seen: Uint8Array = new Uint8Array(grid.columns * grid.rows);
  const start: ReadonlyVec2 | null = nearestWalkable(grid, from, GLITCH_EDITS.snapRadius);
  const first: number = start === null ? -1 : cellIndex(grid, start.x, start.z);
  if (first < 0) return seen;
  const queue: number[] = [first];
  seen[first] = 1;
  for (let head: number = 0; head < queue.length; head += 1) {
    const index: number = queue[head] ?? 0;
    const column: number = index % grid.columns;
    const row: number = Math.floor(index / grid.columns);
    for (const [dc, dr] of NEIGHBOURS) {
      const nc: number = column + dc;
      const nr: number = row + dr;
      if (nc < 0 || nr < 0 || nc >= grid.columns || nr >= grid.rows) continue;
      const next: number = nr * grid.columns + nc;
      if (seen[next] === 1 || grid.walkable[next] !== 1) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
}

function landmarks(world: World): ReadonlyVec2[] {
  const zone: ZoneDef = world.zone;
  return [
    zone.playerStart,
    ...zone.exits,
    ...zone.checkpoints,
    ...(zone.waypoint === null ? [] : [zone.waypoint]),
    ...world.npcs.map((npc): ReadonlyVec2 => npc.pos),
    ...world.monsters.filter((monster: MonsterState): boolean => monster.alive).map((monster: MonsterState): ReadonlyVec2 => monster.pos),
    ...world.ground.map((ground): ReadonlyVec2 => ground.pos),
  ];
}

function reaches(grid: NavGrid, seen: Uint8Array, point: ReadonlyVec2): boolean {
  const near: ReadonlyVec2 | null = nearestWalkable(grid, point, GLITCH_EDITS.snapRadius);
  const index: number = near === null ? -1 : cellIndex(grid, near.x, near.z);
  return index >= 0 && seen[index] === 1;
}

export function keepsWayOpen(world: World, grid: NavGrid): boolean {
  const player: ReadonlyVec2 = world.player.pos;
  const before: Uint8Array = reachable(world.grid, player);
  const after: Uint8Array = reachable(grid, player);
  if (!reaches(grid, after, player)) return false;
  return landmarks(world).every((point: ReadonlyVec2): boolean => !reaches(world.grid, before, point) || reaches(grid, after, point));
}

function withProp(zone: ZoneDef, index: number, placed: ZoneProp): ZoneDef {
  return { ...zone, props: zone.props.map((entry: ZoneProp, at: number): ZoneProp => (at === index ? placed : entry)) };
}

function blocking(world: World, propId: string): boolean {
  return (world.content.props.get(propId)?.blockRadius ?? 0) > 0;
}

function clearsHero(world: World, placed: ZoneProp): boolean {
  const block: number = world.content.props.get(placed.prop)?.blockRadius ?? 0;
  return block <= 0 || distance(placed, world.player.pos) > block + world.content.player.radius;
}

function commit(world: World, edited: ZoneDef, mustCheck: boolean): boolean {
  const grid: NavGrid = buildNavGrid(edited, world.content.props, world.content.player.radius);
  if (mustCheck && !keepsWayOpen(world, grid)) return false;
  world.zone = edited;
  world.grid = grid;
  world.events.push({ type: 'zone_edited', zone: edited.id });
  return true;
}

function nearProps(world: World, reach: number, wanted: (prop: string) => boolean): number[] {
  const indices: number[] = [];
  world.zone.props.forEach((placed: ZoneProp, index: number): void => {
    if (wanted(placed.prop) && distance(placed, world.player.pos) <= reach) indices.push(index);
  });
  return indices;
}

function onFloor(zone: ZoneDef, point: ReadonlyVec2): boolean {
  return isFloorCell(zone, Math.floor(point.x / zone.cellSize), Math.floor(point.z / zone.cellSize));
}

function shiftProp(world: World, edit: PropShiftEdit, rng: Rng): boolean {
  const index: number | null = pick(rng, nearProps(world, edit.reach, (prop: string): boolean => edit.props.includes(prop)));
  const placed: ZoneProp | undefined = index === null ? undefined : world.zone.props[index];
  if (index === null || placed === undefined) return false;
  for (let attempt: number = 0; attempt < GLITCH_EDITS.shiftTries; attempt += 1) {
    const angle: number = rng.next() * Math.PI * 2;
    const moved: ZoneProp = { ...placed, x: placed.x + Math.cos(angle) * edit.distance, z: placed.z + Math.sin(angle) * edit.distance };
    if (!onFloor(world.zone, moved) || !clearsHero(world, moved)) continue;
    if (commit(world, withProp(world.zone, index, moved), blocking(world, placed.prop))) return true;
  }
  return false;
}

function swapTarget(edit: PropSwapEdit, prop: string): string | null {
  const forward: PropPair | undefined = edit.pairs.find((swap: PropPair): boolean => swap.from === prop);
  if (forward !== undefined) return forward.to;
  if (!edit.twoWay) return null;
  return edit.pairs.find((swap: PropPair): boolean => swap.to === prop)?.from ?? null;
}

function swapProp(world: World, edit: PropSwapEdit, rng: Rng): boolean {
  const options: number[] = nearProps(world, edit.reach, (prop: string): boolean => swapTarget(edit, prop) !== null);
  while (options.length > 0) {
    const chosen: number = Math.min(options.length - 1, Math.floor(rng.next() * options.length));
    const index: number = options.splice(chosen, 1)[0] ?? -1;
    const placed: ZoneProp | undefined = world.zone.props[index];
    const target: string | null = placed === undefined ? null : swapTarget(edit, placed.prop);
    if (placed === undefined || target === null || !clearsHero(world, { ...placed, prop: target })) continue;
    if (commit(world, withProp(world.zone, index, { ...placed, prop: target }), blocking(world, target))) return true;
  }
  return false;
}

function killNearby(world: World, edit: MonsterDeadEdit, rng: Rng): boolean {
  const victims: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.def.boss === null && monster.spawnTime <= 0 && distance(monster.pos, world.player.pos) <= edit.reach);
  const victim: MonsterState | null = pick(rng, victims);
  if (victim === null) return false;
  kill(world, victim, normalize(sub(victim.pos, world.player.pos), { x: 0, z: 1 }));
  return true;
}

function clearCorpse(world: World, edit: CorpseGoneEdit, rng: Rng): boolean {
  const corpse: MonsterState | null = pick(rng, world.monsters.filter((monster: MonsterState): boolean => !monster.alive && distance(monster.pos, world.player.pos) <= edit.reach));
  if (corpse === null) return false;
  world.monsters = world.monsters.filter((monster: MonsterState): boolean => monster !== corpse);
  world.events.push({ type: 'monster_remove', monsterId: corpse.id });
  return true;
}

export function applyEdit(world: World, edit: GlitchEdit, rng: Rng): boolean {
  let applied: boolean = false;
  switch (edit.type) {
    case 'monster_dead':
      applied = killNearby(world, edit, rng);
      break;
    case 'corpse_gone':
      applied = clearCorpse(world, edit, rng);
      break;
    case 'hero_turn':
      applied = world.player.alive;
      break;
    case 'prop_shift':
      applied = shiftProp(world, edit, rng);
      break;
    case 'prop_swap':
      applied = swapProp(world, edit, rng);
      break;
  }
  return applied;
}

export function turnHero(world: World): void {
  const turned: number = world.player.facing + Math.PI;
  world.player.facing = Math.atan2(Math.sin(turned), Math.cos(turned));
}
