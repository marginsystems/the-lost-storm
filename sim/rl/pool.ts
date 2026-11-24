import type { Content } from '../content/types.ts';
import type { Command, PlayerState, World } from '../world/types.ts';
import { commandsFor } from './act.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { Arena, ArenaOptions, ArenaOutcome } from './arena.ts';
import { arenaObservation, createArena, stepArena } from './arena.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import { ARENA } from './arena.ts';
import type { Action } from './contract.ts';
import type { LevelRange } from './curriculum.ts';
import { CURRICULUM, levelIn } from './curriculum.ts';
import { LAYOUT, RL } from './contract.ts';
import type { Duel, DuelOptions, DuelSeat } from './duel.ts';
import { createDuel, DUEL, duelObservation, stepDuel } from './duel.ts';
import type { KeptReplay } from './duel-replay.ts';
import { recordDuelReplay } from './duel-replay.ts';
import type { Recall } from './recall.ts';
import { rememberDecision } from './recall.ts';
import type { Observation } from './observe.ts';
import { actionFrom, recordReplay } from './replay.ts';
import type { Roam, RoamOptions, RoamRole, RoamSeat } from './roam.ts';
import { createRoam, ROAM, roamObservation, stepRoam } from './roam.ts';
import { DUEL_KIT } from './kit.ts';
import type { CornerRole } from './corner.ts';
import { cornerDrawn, cornerRole } from './corner.ts';
import { treeBuildFor, treeLevel } from './tree-build.ts';

export interface PoolOptions {
  readonly seed: number;
  readonly envs: number;
  readonly duels: number;
  readonly roams?: number;
  readonly escorts?: number;
  readonly jitter: number;
  readonly waves: number;
  readonly keepEvery: number;
  readonly levels: readonly number[];
  readonly build?: Build;
  readonly rivals?: readonly Build[];
  readonly seats?: readonly (Build | null)[];
  readonly range?: LevelRange;
  readonly buildLevel?: number;
  readonly treeBuilds?: boolean;
  readonly corners?: number;
}

export type Match = { readonly kind: 'arena'; readonly arena: Arena } | { readonly kind: 'duel'; readonly duel: Duel } | { readonly kind: 'roam'; readonly roam: Roam };

export type MatchKind = Match['kind'] | 'escort';

export interface EpisodeSummary {
  readonly env: number;
  readonly seed: number;
  readonly situation: Match['kind'];
  readonly level: number;
  readonly outcome: ArenaOutcome;
  readonly total: number;
  readonly waves: number;
  readonly decisions: number;
  readonly role?: RoamRole;
  readonly corner?: CornerRole;
}

export interface Pool {
  readonly content: Content;
  readonly options: PoolOptions;
  readonly matches: Match[];
  readonly seen: Observation[];
  readonly actions: number[][][];
  readonly levelRng: Rng;
  levels: readonly number[];
  nextSeed: number;
  episodes: number;
  best: number;
  tag: string;
}

export interface PoolStep {
  readonly obs: Float32Array;
  readonly mask: Uint8Array;
  readonly rewards: Float32Array;
  readonly dones: Uint8Array;
  readonly finished: readonly EpisodeSummary[];
  readonly keep: readonly KeptReplay[];
}

export function roamCount(options: PoolOptions): number {
  return options.roams ?? 0;
}

export function escortCount(options: PoolOptions): number {
  return options.escorts ?? 0;
}

export function arenaSeats(options: PoolOptions): number {
  return options.envs - options.duels * 2 - roamCount(options) - escortCount(options) * 2;
}

export function matchCount(options: PoolOptions): number {
  return arenaSeats(options) + options.duels + roamCount(options) + escortCount(options);
}

export function matchKind(options: PoolOptions, index: number): MatchKind {
  const arenas: number = arenaSeats(options);
  if (index < arenas) return 'arena';
  if (index < arenas + options.duels) return 'duel';
  return index < arenas + options.duels + roamCount(options) ? 'roam' : 'escort';
}

function seatCount(match: Match): number {
  switch (match.kind) {
    case 'arena':
      return 1;
    case 'duel':
      return match.duel.seats.length;
    case 'roam':
      return match.roam.seats.length;
  }
  return 0;
}

export function matchWorld(match: Match): World {
  switch (match.kind) {
    case 'arena':
      return match.arena.world;
    case 'duel':
      return match.duel.world;
    case 'roam':
      return match.roam.world;
  }
  return match;
}

export function matchLevel(match: Match): number {
  switch (match.kind) {
    case 'arena':
      return match.arena.level;
    case 'duel':
      return match.duel.level;
    case 'roam':
      return match.roam.level;
  }
  return match;
}

export function matchHeroes(match: Match): PlayerState[] {
  switch (match.kind) {
    case 'arena':
      return [match.arena.world.player];
    case 'duel':
      return match.duel.seats.map((seat: DuelSeat): PlayerState => seat.hero);
    case 'roam':
      return match.roam.seats.map((seat: RoamSeat): PlayerState => seat.hero);
  }
  return match;
}

function firstEnv(pool: Pool, index: number): number {
  return pool.matches.slice(0, index).reduce((sum: number, match: Match): number => sum + seatCount(match), 0);
}

function observeSeats(match: Match): Observation[] {
  switch (match.kind) {
    case 'arena':
      return [arenaObservation(match.arena)];
    case 'duel': {
      const duel: Duel = match.duel;
      return duel.seats.map((seat: DuelSeat): Observation => duelObservation(duel, seat));
    }
    case 'roam': {
      const roam: Roam = match.roam;
      return roam.seats.map((seat: RoamSeat): Observation => roamObservation(roam, seat));
    }
  }
  return [];
}

export function poolRange(options: PoolOptions): LevelRange {
  return options.range ?? ARENA.levels;
}

export function poolBuildLevel(options: PoolOptions): number {
  return options.buildLevel ?? BUILD.level;
}

function arenaOptions(pool: Pool, seed: number): ArenaOptions {
  const options: ArenaOptions = { seed, jitter: pool.options.jitter, waves: pool.options.waves };
  if (pool.options.treeBuilds === true) {
    const level: number = treeLevel(seed, pool.levels, poolRange(pool.options));
    return { ...options, level, build: treeBuildFor(pool.content, DUEL_KIT, seed, level) };
  }
  if (pool.options.build !== undefined) return { ...options, build: pool.options.build, level: poolBuildLevel(pool.options) };
  const level: number | null = levelIn(pool.levelRng, pool.levels, poolRange(pool.options));
  return level === null ? options : { ...options, level };
}

export function duelBuilds(options: PoolOptions, seed: number): readonly (Build | null)[] | undefined {
  if (options.seats !== undefined) return options.seats;
  if (options.build === undefined) return undefined;
  const rivals: readonly Build[] = options.rivals ?? [];
  return [options.build, rivals.length === 0 ? null : (rivals[seed % rivals.length] ?? null)];
}

function duelOptions(pool: Pool, seed: number): DuelOptions {
  const options: DuelOptions = drawnDuelOptions(pool, seed);
  return cornerDrawn(seed, pool.options.corners ?? 0) ? { ...options, corner: true } : options;
}

function drawnDuelOptions(pool: Pool, seed: number): DuelOptions {
  if (pool.options.treeBuilds === true) {
    const level: number = treeLevel(seed, pool.levels, poolRange(pool.options));
    return { seed, jitter: pool.options.jitter, level, builds: [treeBuildFor(pool.content, DUEL_KIT, seed, level), treeBuildFor(pool.content, DUEL_KIT, seed + DUEL.rivalSeed, level)] };
  }
  const builds: readonly (Build | null)[] | undefined = duelBuilds(pool.options, seed);
  const options: DuelOptions = builds === undefined ? { seed, jitter: pool.options.jitter } : { seed, jitter: pool.options.jitter, builds };
  if (builds?.some((build: Build | null): boolean => build !== null) === true) return { ...options, level: poolBuildLevel(pool.options) };
  const level: number | null = levelIn(pool.levelRng, [], poolRange(pool.options));
  return level === null ? options : { ...options, level };
}

function roamBuilds(pool: Pool, seed: number, partner: boolean): readonly (Build | null)[] | undefined {
  if (pool.options.build === undefined) return undefined;
  const rivals: readonly Build[] = pool.options.rivals ?? [];
  return [pool.options.build, partner && rivals.length > 0 ? (rivals[seed % rivals.length] ?? null) : null];
}

function roamOptions(pool: Pool, seed: number, partner: boolean): RoamOptions {
  const options: RoamOptions = { seed, jitter: pool.options.jitter, partner };
  if (pool.options.treeBuilds === true) {
    const level: number = treeLevel(seed, pool.levels, poolRange(pool.options));
    return { ...options, level, builds: [treeBuildFor(pool.content, DUEL_KIT, seed, level), partner ? treeBuildFor(pool.content, DUEL_KIT, seed + ROAM.partnerSeed, level) : null] };
  }
  const builds: readonly (Build | null)[] | undefined = roamBuilds(pool, seed, partner);
  if (builds !== undefined) return { ...options, builds, level: poolBuildLevel(pool.options) };
  const level: number | null = levelIn(pool.levelRng, pool.levels, poolRange(pool.options));
  return level === null ? options : { ...options, level };
}

function matchOf(pool: Pool, index: number, seed: number): Match {
  const kind: MatchKind = matchKind(pool.options, index);
  switch (kind) {
    case 'arena':
      return { kind, arena: createArena(pool.content, arenaOptions(pool, seed)) };
    case 'duel':
      return { kind, duel: createDuel(pool.content, duelOptions(pool, seed)) };
    case 'roam':
    case 'escort':
      return { kind: 'roam', roam: createRoam(pool.content, roamOptions(pool, seed, kind === 'escort')) };
  }
  return { kind: 'arena', arena: createArena(pool.content, arenaOptions(pool, seed)) };
}

export function setLevels(pool: Pool, weights: readonly number[]): void {
  pool.levels = weights;
}

function freshMatch(pool: Pool, index: number): void {
  const seed: number = pool.nextSeed;
  pool.nextSeed += 1;
  const match: Match = matchOf(pool, index, seed);
  pool.matches[index] = match;
  const env: number = firstEnv(pool, index);
  observeSeats(match).forEach((seen: Observation, seat: number): void => {
    pool.seen[env + seat] = seen;
    pool.actions[env + seat] = [];
  });
}

export function createPool(content: Content, options: PoolOptions): Pool {
  if (options.duels < 0 || roamCount(options) < 0 || escortCount(options) < 0 || arenaSeats(options) < 0) throw new Error(`${options.duels} duels, ${roamCount(options)} roams and ${escortCount(options)} escorts need ${options.envs - arenaSeats(options)} envs, but there are ${options.envs}`);
  const pool: Pool = { content, options, matches: [], seen: [], actions: [], levelRng: createRng(options.seed + CURRICULUM.seedSalt), levels: options.levels, nextSeed: options.seed, episodes: 0, best: -Infinity, tag: '' };
  const count: number = matchCount(options);
  for (let index: number = 0; index < count; index += 1) freshMatch(pool, index);
  return pool;
}

function gather(pool: Pool, rewards: Float32Array, dones: Uint8Array, finished: readonly EpisodeSummary[], keep: readonly KeptReplay[]): PoolStep {
  const envs: number = pool.options.envs;
  const obs: Float32Array = new Float32Array(envs * LAYOUT.size);
  const mask: Uint8Array = new Uint8Array(envs * LAYOUT.mask);
  pool.seen.forEach((seen: Observation, env: number): void => {
    obs.set(seen.obs, env * LAYOUT.size);
    mask.set(seen.mask, env * LAYOUT.mask);
  });
  return { obs, mask, rewards, dones, finished, keep };
}

export function poolObservations(pool: Pool): PoolStep {
  const envs: number = pool.options.envs;
  return gather(pool, new Float32Array(envs), new Uint8Array(envs), [], []);
}

function keptOnSchedule(pool: Pool): boolean {
  return pool.options.keepEvery > 0 && pool.episodes % pool.options.keepEvery === 0;
}

function worthKeeping(pool: Pool, arena: Arena): boolean {
  const best: boolean = arena.total > pool.best;
  if (best) pool.best = arena.total;
  return best || keptOnSchedule(pool);
}

function kept(pool: Pool, match: Match, env: number): KeptReplay | null {
  if (match.kind === 'roam') return null;
  if (match.kind === 'arena') return worthKeeping(pool, match.arena) ? recordReplay(match.arena, pool.actions[env] ?? [], pool.tag) : null;
  if (!keptOnSchedule(pool)) return null;
  return recordDuelReplay(match.duel, match.duel.seats.map((_seat: DuelSeat, seat: number): number[][] => pool.actions[env + seat] ?? []), pool.tag);
}

function recallOf(match: Match, seat: number): Recall | null {
  switch (match.kind) {
    case 'arena':
      return match.arena.recall;
    case 'duel':
      return match.duel.seats[seat]?.recall ?? null;
    case 'roam':
      return match.roam.seats[seat]?.recall ?? null;
  }
  return null;
}

function decide(pool: Pool, match: Match, env: number, seat: number, actions: Int32Array): Command[] {
  const seen: Observation | undefined = pool.seen[env + seat];
  const log: number[][] | undefined = pool.actions[env + seat];
  const recall: Recall | null = recallOf(match, seat);
  if (seen === undefined || log === undefined || recall === null) return [];
  const list: number[] = Array.from(actions.subarray((env + seat) * RL.actionParts, (env + seat + 1) * RL.actionParts));
  log.push(list);
  const action: Action = actionFrom(list);
  rememberDecision(recall, action);
  return commandsFor(matchWorld(match), action, seen.view);
}

interface Played {
  readonly rewards: readonly number[];
  readonly done: boolean;
}

function play(match: Match, commands: readonly Command[][]): Played {
  switch (match.kind) {
    case 'arena': {
      const step = stepArena(match.arena, commands[0] ?? []);
      return { rewards: [step.reward], done: step.done };
    }
    case 'duel':
      return stepDuel(match.duel, commands);
    case 'roam':
      return stepRoam(match.roam, commands);
  }
  return { rewards: [], done: true };
}

function summaries(match: Match, env: number): EpisodeSummary[] {
  if (match.kind === 'arena') {
    const arena: Arena = match.arena;
    return [{ env, seed: arena.options.seed, situation: 'arena', level: arena.level, outcome: arena.outcome, total: arena.total, waves: arena.tally.waves, decisions: arena.decisions }];
  }
  if (match.kind === 'roam') {
    const roam: Roam = match.roam;
    return roam.seats.map((seat: RoamSeat, index: number): EpisodeSummary => ({ env: env + index, seed: roam.options.seed, situation: 'roam', level: roam.level, outcome: seat.outcome, total: seat.total, waves: 0, decisions: roam.decisions, role: seat.role }));
  }
  const duel: Duel = match.duel;
  return duel.seats.map((seat: DuelSeat, index: number): EpisodeSummary => duelSummary(duel, seat, index, env));
}

function duelSummary(duel: Duel, seat: DuelSeat, index: number, env: number): EpisodeSummary {
  const summary: EpisodeSummary = { env: env + index, seed: duel.options.seed, situation: 'duel', level: duel.level, outcome: seat.outcome, total: seat.total, waves: 0, decisions: duel.decisions };
  return duel.corner === null ? summary : { ...summary, corner: cornerRole(index) };
}

export function stepPool(pool: Pool, actions: Int32Array): PoolStep {
  const envs: number = pool.options.envs;
  if (actions.length !== envs * RL.actionParts) throw new Error(`expected ${envs * RL.actionParts} action numbers, got ${actions.length}`);
  const rewards: Float32Array = new Float32Array(envs);
  const dones: Uint8Array = new Uint8Array(envs);
  const finished: EpisodeSummary[] = [];
  const keep: KeptReplay[] = [];
  let env: number = 0;
  pool.matches.forEach((match: Match, index: number): void => {
    const seats: number = seatCount(match);
    const commands: Command[][] = Array.from({ length: seats }, (_unused: unknown, seat: number): Command[] => decide(pool, match, env, seat, actions));
    const played: Played = play(match, commands);
    played.rewards.forEach((reward: number, seat: number): void => {
      rewards[env + seat] = reward;
    });
    if (!played.done) {
      observeSeats(match).forEach((seen: Observation, seat: number): void => {
        pool.seen[env + seat] = seen;
      });
      env += seats;
      return;
    }
    for (let seat: number = 0; seat < seats; seat += 1) dones[env + seat] = 1;
    pool.episodes += 1;
    finished.push(...summaries(match, env));
    const replay: KeptReplay | null = kept(pool, match, env);
    if (replay !== null) keep.push(replay);
    freshMatch(pool, index);
    env += seats;
  });
  return gather(pool, rewards, dones, finished, keep);
}
