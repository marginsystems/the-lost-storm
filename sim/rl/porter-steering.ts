import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { lineWalkable } from '../nav/grid.ts';
import { freshPlayer } from '../world/create.ts';
import type { PorterSteering } from '../world/porter.ts';
import type { NpcState, PlayerState, World } from '../world/types.ts';
import { MOVE_CHOICES, NO_ACTION } from './contract.ts';
import { walkingMask } from './gather.ts';
import { moveDirection } from './moves.ts';
import { observe } from './observe.ts';
import { createRecall, rememberDecision } from './recall.ts';
import type { Recall } from './recall.ts';

export type RequestPorterMove = (obs: Float32Array, mask: Uint8Array, answer: (move: number) => void) => boolean;

const STEER = { minimumProgress: 0.55, legShare: 0.5, minLeg: 0.25 } as const;

interface Walker {
  readonly hero: PlayerState;
  readonly recall: Recall;
  route: Vec2[] | null;
  move: number | null;
}

function stride(world: World, from: Vec2, corner: Vec2, reach: number, move: number): Vec2 | null {
  const direction: Vec2 | null = moveDirection(move);
  if (direction === null) return null;
  const gap: number = distance(from, corner);
  const length: number = Math.min(reach, gap * STEER.legShare);
  if (length < STEER.minLeg) return null;
  const end = { x: from.x + direction.x * length, z: from.z + direction.z * length };
  if (gap - distance(end, corner) < length * STEER.minimumProgress) return null;
  return lineWalkable(world.grid, from, end) && lineWalkable(world.grid, end, corner) ? end : null;
}

function requestStride(world: World, npc: NpcState, walker: Walker, corner: Vec2, reach: number, request: RequestPorterMove): void {
  const hero = walker.hero;
  hero.facing = npc.facing;
  hero.moving = npc.motion === 'stride';
  hero.gait = npc.gait;
  if (hero.stats.moveSpeed !== npc.pace) hero.stats = { ...hero.stats, moveSpeed: npc.pace };
  const seen = observe(world, { situation: 'roam', objective: corner, timeLeft: distance(npc.pos, corner) / npc.pace, progress: 0, recall: walker.recall, pickup: { minRarity: world.content.rarities.length } }, hero);
  const mask = walkingMask(seen.mask);
  mask[0] = 0;
  let available: boolean = false;
  for (let move: number = 1; move < MOVE_CHOICES; move += 1) {
    const valid: boolean = stride(world, npc.pos, corner, reach, move) !== null;
    mask[move] = Number(valid);
    if (valid) available = true;
  }
  if (!available) return;
  const route: Vec2[] = npc.route;
  const accepted: boolean = request(seen.obs, mask, (move: number): void => {
    if (walker.route === route && route[0] === corner && mask[move] === 1 && move > 0 && move < MOVE_CHOICES) walker.move = move;
  });
  if (!accepted) walker.route = null;
}

export function createPorterSteering(request: RequestPorterMove): PorterSteering {
  const walkers: WeakMap<NpcState, Walker> = new WeakMap();
  return (world: World, npc: NpcState, interval: number): void => {
    const corner: Vec2 | undefined = npc.route[0];
    if (corner === undefined) return;
    let walker: Walker | undefined = walkers.get(npc);
    if (walker === undefined) {
      const hero: PlayerState = { ...freshPlayer(world.content, null, null), id: npc.id, pos: npc.pos, party: world.player.party };
      walker = { hero, recall: createRecall(), route: null, move: null };
      walkers.set(npc, walker);
    }
    const reach: number = npc.pace * interval;
    if (walker.route !== npc.route) {
      walker.route = npc.route;
      walker.move = null;
      requestStride(world, npc, walker, corner, reach, request);
    }
    if (walker.move === null) return;
    const move: number = walker.move;
    walker.move = null;
    const end = stride(world, npc.pos, corner, reach, move);
    if (end !== null) {
      npc.route.unshift(end);
      rememberDecision(walker.recall, { ...NO_ACTION, move });
    }
  };
}
