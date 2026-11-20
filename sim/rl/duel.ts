import type { Content } from '../content/types.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import { findHero } from '../world/heroes.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, PlayerState, World, WorldEvent } from '../world/types.ts';
import type { ArenaOutcome } from './arena.ts';
import { ARENA, benchHero, emptyArena, jitterContent, spawnSpot } from './arena.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import { readyBuild } from './build-hero.ts';
import { RL } from './contract.ts';
import { DUEL_KIT } from './kit.ts';
import type { PickupRule } from './loot.ts';
import type { Observation, ObserveContext } from './observe.ts';
import { observe, seenMonsters } from './observe.ts';
import type { Recall } from './recall.ts';
import { createRecall, noteSeen, recallEvents } from './recall.ts';
import type { RewardTally } from './reward.ts';
import { emptyTally, REWARD, rewardFor } from './reward.ts';

export const DUEL = {
  seats: 2,
  timeLimit: 60,
  rivalParty: 1,
  rivalSeed: 104729,
} as const;

export interface DuelOptions {
  readonly seed: number;
  readonly jitter: number;
  readonly builds?: readonly (Build | null)[];
}

export interface DuelSeat {
  readonly hero: PlayerState;
  readonly recall: Recall;
  readonly tally: RewardTally;
  outcome: ArenaOutcome;
  total: number;
}

export interface Duel {
  readonly options: DuelOptions;
  readonly world: World;
  readonly seats: readonly DuelSeat[];
  readonly pickup: PickupRule;
  readonly level: number;
  readonly start: number;
  decisions: number;
}

export interface DuelStep {
  readonly rewards: readonly number[];
  readonly done: boolean;
  readonly events: readonly WorldEvent[];
}

function seatOf(hero: PlayerState): DuelSeat {
  return { hero, recall: createRecall(), tally: emptyTally(), outcome: 'running', total: 0 };
}

function readySeat(world: World, rng: Rng, seed: number, level: number, build: Build | null): void {
  if (build === null) stepWorld(world, [{ type: 'bench', hero: benchHero(world.content, rng, level) }], RL.tick);
  else readyBuild(world, build, DUEL_KIT, ARENA.benchSeed + seed);
}

function benchedRival(content: Content, rng: Rng, seed: number, level: number, build: Build | null): PlayerState {
  const scratch: World = emptyArena(content, seed + DUEL.rivalSeed, level);
  readySeat(scratch, rng, seed + DUEL.rivalSeed, level, build);
  return scratch.player;
}

export function createDuel(content: Content, options: DuelOptions): Duel {
  const rng: Rng = createRng(options.seed);
  const played: Content = jitterContent(content, rng, options.jitter);
  const rolled: number = rng.int(ARENA.levels.min, ARENA.levels.max);
  const level: number = options.builds === undefined ? rolled : BUILD.level;
  const world: World = emptyArena(played, options.seed, level);
  readySeat(world, rng, options.seed, level, options.builds?.[0] ?? null);
  const benched: PlayerState = benchedRival(played, rng, options.seed, level, options.builds?.[1] ?? null);
  const rival: PlayerState = { ...benched, id: world.nextId, party: DUEL.rivalParty, pos: spawnSpot(world, rng) };
  world.nextId += 1;
  world.heroes.push(rival);
  return { options, world, seats: [seatOf(world.player), seatOf(rival)], pickup: { minRarity: played.rarities.length }, level, start: world.time, decisions: 0 };
}

export function duelRunning(duel: Duel): boolean {
  return duel.seats.every((seat: DuelSeat): boolean => seat.outcome === 'running');
}

export function duelContext(duel: Duel, seat: DuelSeat): ObserveContext {
  return { situation: 'duel', objective: null, timeLeft: Math.max(0, DUEL.timeLimit - (duel.world.time - duel.start)), progress: 0, recall: seat.recall, pickup: duel.pickup };
}

export function duelObservation(duel: Duel, seat: DuelSeat): Observation {
  const seen: Observation = observe(duel.world, duelContext(duel, seat), seat.hero);
  noteSeen(seat.recall, duel.world, seenMonsters(seen.view));
  return seen;
}

function settle(duel: Duel, rewards: number[]): void {
  const fallen: boolean[] = duel.seats.map((seat: DuelSeat): boolean => !seat.hero.alive || seat.tally.deaths > 0);
  if (fallen.some((down: boolean): boolean => down)) {
    duel.seats.forEach((seat: DuelSeat, index: number): void => {
      seat.outcome = fallen[index] === true ? 'died' : 'won';
      if (seat.outcome === 'won') {
        rewards[index] = (rewards[index] ?? 0) + REWARD.win;
        seat.total += REWARD.win;
      }
    });
    return;
  }
  if (duel.world.time - duel.start < DUEL.timeLimit) return;
  for (const seat of duel.seats) seat.outcome = 'timeout';
}

export function afterDuelTick(duel: Duel, events: readonly WorldEvent[], rewards: number[]): void {
  const world: World = duel.world;
  duel.seats.forEach((seat: DuelSeat, index: number): void => {
    recallEvents(seat.recall, world, seat.hero, events);
    const lifeOf = (id: number): number => findHero(world, id)?.maxLife ?? world.monsters.find((monster): boolean => monster.id === id)?.maxLife ?? seat.hero.maxLife;
    const gained: number = rewardFor(events, { playerId: seat.hero.id, playerMaxLife: seat.hero.maxLife, lifeOf, calm: false, worth: (): number => 0 }, seat.tally);
    rewards[index] = (rewards[index] ?? 0) + gained;
    seat.total += gained;
  });
  settle(duel, rewards);
}

export function stepDuel(duel: Duel, commands: readonly (readonly Command[])[]): DuelStep {
  if (commands.length !== duel.seats.length) throw new Error(`a duel takes commands for ${duel.seats.length} seats, got ${commands.length}`);
  const rewards: number[] = duel.seats.map((): number => -REWARD.step);
  for (const seat of duel.seats) seat.total -= REWARD.step;
  const events: WorldEvent[] = [];
  const sent: Command[] = commands.flat();
  for (let tick: number = 0; tick < RL.ticksPerDecision && duelRunning(duel); tick += 1) {
    const happened: WorldEvent[] = stepWorld(duel.world, tick === 0 ? sent : [], RL.tick);
    events.push(...happened);
    afterDuelTick(duel, happened, rewards);
  }
  duel.decisions += 1;
  return { rewards, done: !duelRunning(duel), events };
}
