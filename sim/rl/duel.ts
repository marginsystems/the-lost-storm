import type { Content, ZoneDef, ZoneDuel } from '../content/types.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import { refillHero } from '../world/bench-hero.ts';
import { refreshPlayer } from '../world/character.ts';
import { findHero } from '../world/heroes.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, PlayerState, World, WorldEvent } from '../world/types.ts';
import type { ArenaOutcome } from './arena.ts';
import { ARENA, benchHero, emptyArena, jitterContent, spawnSpot } from './arena.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import { readyBuild } from './build-hero.ts';
import { RL } from './contract.ts';
import type { CornerStart } from './corner.ts';
import { casterMask, CORNER, cornerEscaped, cornerFled, findCorner } from './corner.ts';
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
  timeLimit: 120,
  taken: 1,
  stalemate: 1.5,
  idle: 0.005,
  idleGrace: 3,
  rivalParty: 1,
  rivalSeed: 104729,
} as const;

export interface DuelOptions {
  readonly seed: number;
  readonly jitter: number;
  readonly builds?: readonly (Build | null)[];
  readonly level?: number;
  readonly corner?: boolean;
}

export interface DuelSeat {
  readonly hero: PlayerState;
  readonly recall: Recall;
  readonly tally: RewardTally;
  outcome: ArenaOutcome;
  total: number;
  lastHit: number;
}

export interface Duel {
  readonly options: DuelOptions;
  readonly world: World;
  readonly seats: readonly DuelSeat[];
  readonly pickup: PickupRule;
  readonly level: number;
  readonly start: number;
  readonly corner: CornerStart | null;
  decisions: number;
}

export interface DuelStep {
  readonly rewards: readonly number[];
  readonly done: boolean;
  readonly events: readonly WorldEvent[];
}

function seatOf(hero: PlayerState, time: number): DuelSeat {
  return { hero, recall: createRecall(), tally: emptyTally(), outcome: 'running', total: 0, lastHit: time };
}

function readySeat(world: World, rng: Rng, seed: number, level: number, build: Build | null): void {
  if (build === null) stepWorld(world, [{ type: 'bench', hero: benchHero(world.content, rng, level) }], RL.tick);
  else readyBuild(world, build, DUEL_KIT, ARENA.benchSeed + seed, level);
}

export function benchedRival(content: Content, rng: Rng, seed: number, level: number, build: Build | null): PlayerState {
  const scratch: World = emptyArena(content, seed + DUEL.rivalSeed, level);
  readySeat(scratch, rng, seed + DUEL.rivalSeed, level, build);
  return scratch.player;
}

export function duelRules(content: Content): ZoneDuel | null {
  for (const zone of content.zones.values()) if (zone.duel !== null) return zone.duel;
  return null;
}

export function createDuel(content: Content, options: DuelOptions): Duel {
  const rng: Rng = createRng(options.seed);
  const played: Content = jitterContent(content, rng, options.jitter);
  const rolled: number = rng.int(ARENA.levels.min, ARENA.levels.max);
  const level: number = options.level ?? (options.builds === undefined ? rolled : BUILD.level);
  const world: World = emptyArena(played, options.seed, level);
  const zone: ZoneDef = { ...world.zone, duel: duelRules(played) };
  world.zone = zone;
  readySeat(world, rng, options.seed, level, options.builds?.[0] ?? null);
  const benched: PlayerState = benchedRival(played, rng, options.seed, level, options.builds?.[1] ?? null);
  const rival: PlayerState = { ...benched, id: world.nextId, party: DUEL.rivalParty, pos: spawnSpot(world, rng) };
  world.nextId += 1;
  world.heroes.push(rival);
  const corner: CornerStart | null = options.corner === true ? cornered(world, rng, rival) : null;
  return { options, world, seats: [seatOf(world.player, world.time), seatOf(rival, world.time)], pickup: { minRarity: played.rarities.length }, level, start: world.time, corner, decisions: 0 };
}

function cornered(world: World, rng: Rng, rival: PlayerState): CornerStart | null {
  const start: CornerStart | null = findCorner(world, rng);
  if (start === null) return null;
  rival.pos = { x: start.corner.x, z: start.corner.z };
  world.player.pos = { x: start.caster.x, z: start.caster.z };
  world.player.bar[CORNER.slot] = CORNER.skill;
  refreshPlayer(world);
  refillHero(world);
  return start;
}

function keepCasting(hero: PlayerState): void {
  hero.life = hero.maxLife;
  hero.mana = hero.stats.maxMana;
}

function casterOf(duel: Duel): DuelSeat | null {
  return duel.corner === null ? null : (duel.seats[CORNER.casterSeat] ?? null);
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
  const target: DuelSeat | undefined = duel.seats[CORNER.corneredSeat];
  return seat === casterOf(duel) && target !== undefined ? { ...seen, mask: casterMask(seen.mask, seen.view, target.hero) } : seen;
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
  if (duel.corner !== null) {
    settleCorner(duel, rewards);
    return;
  }
  if (duel.world.time - duel.start >= DUEL.timeLimit) stalemate(duel, rewards);
}

function stalemate(duel: Duel, rewards: number[]): void {
  duel.seats.forEach((seat: DuelSeat, index: number): void => {
    seat.outcome = 'timeout';
    rewards[index] = (rewards[index] ?? 0) - DUEL.stalemate;
    seat.total -= DUEL.stalemate;
  });
}

export function cornerCleared(duel: Duel): boolean {
  const start: CornerStart | null = duel.corner;
  const hero: PlayerState | undefined = duel.seats[CORNER.corneredSeat]?.hero;
  const caster: PlayerState | undefined = duel.seats[CORNER.casterSeat]?.hero;
  return start !== null && hero !== undefined && caster !== undefined && cornerEscaped(start, hero.pos, caster.pos);
}

export function cornerRunAway(duel: Duel): boolean {
  const start: CornerStart | null = duel.corner;
  const hero: PlayerState | undefined = duel.seats[CORNER.corneredSeat]?.hero;
  const caster: PlayerState | undefined = duel.seats[CORNER.casterSeat]?.hero;
  return start !== null && hero !== undefined && caster !== undefined && cornerFled(start, hero.pos, caster.pos);
}

function settleCorner(duel: Duel, rewards: number[]): void {
  if (cornerRunAway(duel)) {
    duel.seats.forEach((seat: DuelSeat, index: number): void => {
      seat.outcome = index === CORNER.corneredSeat ? 'died' : 'timeout';
      if (seat.outcome !== 'died') return;
      rewards[index] = (rewards[index] ?? 0) - REWARD.death;
      seat.total -= REWARD.death;
    });
    return;
  }
  if (cornerCleared(duel)) {
    duel.seats.forEach((seat: DuelSeat, index: number): void => {
      seat.outcome = index === CORNER.corneredSeat ? 'won' : 'timeout';
      if (seat.outcome !== 'won') return;
      rewards[index] = (rewards[index] ?? 0) + REWARD.win;
      seat.total += REWARD.win;
    });
    return;
  }
  if (duel.world.time - duel.start >= CORNER.timeLimit) stalemate(duel, rewards);
}

function hitRival(duel: Duel, seat: DuelSeat, events: readonly WorldEvent[]): boolean {
  return events.some((event: WorldEvent): boolean => event.type === 'damage' && event.sourceId === seat.hero.id && event.targetId !== seat.hero.id && duel.seats.some((other: DuelSeat): boolean => other.hero.id === event.targetId));
}

export function chargeIdle(duel: Duel, rewards: number[]): void {
  if (duel.corner !== null) return;
  duel.seats.forEach((seat: DuelSeat, index: number): void => {
    if (duel.world.time - seat.lastHit <= DUEL.idleGrace) return;
    rewards[index] = (rewards[index] ?? 0) - DUEL.idle;
    seat.total -= DUEL.idle;
  });
}

export function afterDuelTick(duel: Duel, events: readonly WorldEvent[], rewards: number[]): void {
  const world: World = duel.world;
  const caster: DuelSeat | null = casterOf(duel);
  if (caster !== null && caster.hero.alive) keepCasting(caster.hero);
  duel.seats.forEach((seat: DuelSeat, index: number): void => {
    recallEvents(seat.recall, world, seat.hero, events);
    const lifeOf = (id: number): number => findHero(world, id)?.maxLife ?? world.monsters.find((monster): boolean => monster.id === id)?.maxLife ?? seat.hero.maxLife;
    const gained: number = rewardFor(events, { playerId: seat.hero.id, playerMaxLife: seat.hero.maxLife, lifeOf, calm: false, worth: (): number => 0, taken: DUEL.taken }, seat.tally);
    rewards[index] = (rewards[index] ?? 0) + gained;
    seat.total += gained;
    if (hitRival(duel, seat, events)) seat.lastHit = world.time;
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
  const done: boolean = !duelRunning(duel);
  if (!done) chargeIdle(duel, rewards);
  return { rewards, done, events };
}
