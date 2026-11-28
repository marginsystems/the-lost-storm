import type { ZoneDuel } from '../content/types.ts';
import { createRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
import { findHero } from '../world/heroes.ts';
import type { Command, PlayerState, World, WorldEvent } from '../world/types.ts';
import { commandsFor } from './act.ts';
import type { Build } from './build.ts';
import type { Action } from './contract.ts';
import { RL } from './contract.ts';
import { benchedRival, DUEL } from './duel.ts';
import { DUEL_KIT } from './kit.ts';
import type { Observation, ObserveContext } from './observe.ts';
import { observe, seenMonsters } from './observe.ts';
import type { PolicyNet } from './policy-net.ts';
import { greedyAction } from './policy-net.ts';
import type { Recall } from './recall.ts';
import { createRecall, noteSeen, recallEvents, rememberDecision } from './recall.ts';
import { rivalBuild } from './rival-build.ts';

export const RIVAL = {
  startIn: 1.5,
  holdAfter: 2.5,
  decisionTime: RL.tick * RL.ticksPerDecision,
  buildSalt: 15485863,
  trainedClock: 60,
} as const;

export type RivalOutcome = 'fighting' | 'won' | 'lost' | 'resigned' | 'left';

export type RivalPilot = (obs: Float32Array, mask: Uint8Array) => Action;

export interface RivalDuel {
  readonly rivalId: number;
  readonly build: Build;
  readonly level: number;
  start: number;
  readonly recall: Recall;
  outcome: RivalOutcome;
  endedAt: number | null;
  clock: number;
  left: boolean;
}

export function netPilot(net: PolicyNet): RivalPilot {
  return (obs: Float32Array, mask: Uint8Array): Action => greedyAction(net, obs, mask);
}

export function startRivalDuel(world: World, seed: number): RivalDuel | null {
  const duel: ZoneDuel | null = world.zone.duel;
  if (duel === null) return null;
  const level: number = world.player.level;
  const rng: Rng = createRng(seed + RIVAL.buildSalt);
  const build: Build = rivalBuild(world.content, DUEL_KIT, rng, level);
  const benched: PlayerState = benchedRival(world.content, rng, seed, level, build);
  const rival: PlayerState = { ...benched, id: world.nextId, party: DUEL.rivalParty, pos: { x: duel.rival.x, z: duel.rival.z }, facing: Math.atan2(world.player.pos.x - duel.rival.x, world.player.pos.z - duel.rival.z) };
  world.nextId += 1;
  world.heroes.push(rival);
  return { rivalId: rival.id, build, level, start: world.time + RIVAL.startIn, recall: createRecall(), outcome: 'fighting', endedAt: null, clock: RIVAL.decisionTime, left: false };
}

export function beginRivalDuel(duel: RivalDuel, world: World): void {
  duel.start = world.time + RIVAL.startIn;
  duel.clock = RIVAL.decisionTime;
}

export function rivalOf(duel: RivalDuel, world: World): PlayerState | null {
  return findHero(world, duel.rivalId);
}

export function resignRivalDuel(duel: RivalDuel, world: World): boolean {
  if (duel.outcome !== 'fighting') return false;
  duel.outcome = 'resigned';
  duel.endedAt = world.time;
  return true;
}

export function rivalContext(duel: RivalDuel, world: World): ObserveContext {
  return { situation: 'duel', objective: null, timeLeft: RIVAL.trainedClock, progress: 0, recall: duel.recall, pickup: { minRarity: world.content.rarities.length } };
}

function decide(duel: RivalDuel, world: World, rival: PlayerState, pilot: RivalPilot): Command[] {
  const seen: Observation = observe(world, rivalContext(duel, world), rival);
  noteSeen(duel.recall, world, seenMonsters(seen.view));
  const action: Action = pilot(seen.obs, seen.mask);
  rememberDecision(duel.recall, action);
  return commandsFor(world, action, seen.view, true);
}

export function rivalCommands(duel: RivalDuel, world: World, pilot: RivalPilot, dt: number): Command[] {
  if (duel.outcome !== 'fighting') {
    if (duel.outcome === 'left' || duel.left || duel.endedAt === null || world.time - duel.endedAt < RIVAL.holdAfter) return [];
    duel.left = true;
    return [{ type: 'leave_duel' }];
  }
  const rival: PlayerState | null = rivalOf(duel, world);
  if (rival === null || world.time < duel.start) return [];
  duel.clock += dt;
  if (duel.clock < RIVAL.decisionTime) return [];
  duel.clock = Math.min(RIVAL.decisionTime, duel.clock - RIVAL.decisionTime);
  return decide(duel, world, rival, pilot);
}

function settle(duel: RivalDuel, world: World, rival: PlayerState | null): RivalOutcome {
  if (world.zone.duel === null) return 'left';
  if (!world.player.alive) return 'lost';
  if (rival === null || !rival.alive) return 'won';
  return 'fighting';
}

export function rivalHeard(duel: RivalDuel, world: World, events: readonly WorldEvent[]): void {
  const rival: PlayerState | null = rivalOf(duel, world);
  if (rival !== null) recallEvents(duel.recall, world, rival, events);
  if (duel.outcome !== 'fighting') return;
  duel.outcome = settle(duel, world, rival);
  if (duel.outcome !== 'fighting') duel.endedAt = world.time;
}
