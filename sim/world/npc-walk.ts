import type { Vec2 } from '../math.ts';
import { distance, facingOf, normalize } from '../math.ts';
import { nearestWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import type { Escort } from './scene-state.ts';
import type { NpcState, World } from './types.ts';

export const NPC_WALK = {
  settle: 1e-6,
  beside: 1.4,
  behind: 0.6,
  reach: 3,
} as const;

export function walkNpc(npc: NpcState, dt: number): void {
  const from: Vec2 = { x: npc.pos.x, z: npc.pos.z };
  let travel: number = npc.pace * dt;
  while (travel > 0) {
    const next: Vec2 | undefined = npc.route[0];
    if (next === undefined) break;
    const gap: number = distance(npc.pos, next);
    if (gap <= travel) {
      npc.pos.x = next.x;
      npc.pos.z = next.z;
      npc.route.shift();
      travel -= gap;
      continue;
    }
    npc.pos.x += ((next.x - npc.pos.x) / gap) * travel;
    npc.pos.z += ((next.z - npc.pos.z) / gap) * travel;
    travel = 0;
  }
  const moved: number = distance(from, npc.pos);
  const walking: boolean = moved > NPC_WALK.settle;
  if (walking) npc.facing = facingOf({ x: npc.pos.x - from.x, z: npc.pos.z - from.z });
  npc.motion = walking ? 'stride' : 'still';
  npc.gait = walking && dt > 0 ? moved / dt : 0;
}

export function stepNpcs(world: World, dt: number): void {
  const staged: number | null = world.scene?.npcId ?? null;
  for (const npc of world.npcs) {
    const talking: boolean = world.dialogue?.npcId === npc.id;
    const homing: boolean = npc !== world.porter && npc.id !== staged && npc.route.length > 0;
    walkNpc(npc, talking ? 0 : dt);
    if (homing && npc.route.length === 0) {
      npc.facing = npc.homeFacing;
      npc.pace = 0;
    }
  }
}

export function arriveWith(world: World, escort: Escort): void {
  const npc: NpcState | undefined = world.npcs.find((candidate: NpcState): boolean => candidate.def.id === escort.npc);
  if (npc === undefined) return;
  const home: Vec2 = { x: npc.placement.x, z: npc.placement.z };
  const hero: Vec2 = world.player.pos;
  const toward: Vec2 = normalize({ x: home.x - hero.x, z: home.z - hero.z }, { x: 1, z: 0 });
  const aside: Vec2 = { x: hero.x - toward.z * NPC_WALK.beside - toward.x * NPC_WALK.behind, z: hero.z + toward.x * NPC_WALK.beside - toward.z * NPC_WALK.behind };
  const start: Vec2 = nearestWalkable(world.grid, aside, NPC_WALK.reach) ?? { x: hero.x, z: hero.z };
  npc.pos.x = start.x;
  npc.pos.z = start.z;
  npc.facing = facingOf(toward);
  npc.route = findPath(world.grid, start, home);
  npc.pace = escort.pace;
}
