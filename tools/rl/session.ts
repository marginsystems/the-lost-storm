import type { Content } from '../../sim/content/types.ts';
import { fields, text } from '../../sim/content/read.ts';
import type { Fields } from '../../sim/content/read.ts';
import { createRng } from '../../sim/rng.ts';
import type { Rng } from '../../sim/rng.ts';
import type { Build } from '../../sim/rl/build.ts';
import { BUILD, buildProblems, checkedLevel, mustBeLegal, readBuild } from '../../sim/rl/build.ts';
import { DUEL } from '../../sim/rl/duel.ts';
import { DUEL_KIT } from '../../sim/rl/kit.ts';
import type { ArenaOptions } from '../../sim/rl/arena.ts';
import { contractShape, LAYOUT, RL } from '../../sim/rl/contract.ts';
import type { LevelRange } from '../../sim/rl/curriculum.ts';
import { CURRICULUM, levelIn, rangeProblems, readLevelRange, readLevelWeights } from '../../sim/rl/curriculum.ts';
import type { DemoEpisode, Demonstration } from '../../sim/rl/demo.ts';
import { demonstrate } from '../../sim/rl/demo.ts';
import type { Pool, PoolOptions, PoolStep } from '../../sim/rl/pool.ts';
import { createPool, poolBuildLevel, poolObservations, poolRange, setLevels, stepPool } from '../../sim/rl/pool.ts';
import type { KeptReplay } from '../../sim/rl/duel-replay.ts';
import { treeBuildFor, treeLevel } from '../../sim/rl/tree-build.ts';
import type { Frame } from './frames.ts';
import { demonstrationFrame, frame, FRAME, jsonPart, observationFrame, readActions, readJson } from './frames.ts';

export const SESSION = {
  maxJitter: 0.9,
  maxSeed: 2 ** 40,
} as const;

export interface Session {
  readonly content: Content;
  pool: Pool | null;
}

export interface Reply {
  readonly frames: Iterable<Buffer>;
  readonly keep: readonly KeptReplay[];
  readonly quit: boolean;
}

function spread(source: Fields): number {
  const value: number = count(source, 'jitter', 0);
  if (value > SESSION.maxJitter) throw new Error(`jitter must be at most ${SESSION.maxJitter}`);
  return value;
}

function seedOf(source: Fields): number {
  const value: number = count(source, 'seed', 1);
  if (!Number.isSafeInteger(value) || value > SESSION.maxSeed) throw new Error(`seed must be a whole number of at most ${SESSION.maxSeed}`);
  return value;
}

function count(source: Fields, key: string, fallback: number): number {
  const value: unknown = source[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${key} must be a number of zero or more`);
  return value;
}

function optionalBuild(raw: unknown, where: string): Build | null {
  return raw === undefined || raw === null ? null : readBuild(raw, where);
}

function buildList(raw: unknown, where: string): (Build | null)[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(`${where} must be a list`);
  const list: readonly unknown[] = raw;
  return list.map((entry: unknown, index: number): Build | null => optionalBuild(entry, `${where} ${index + 1}`));
}

function builds(source: Fields): Pick<PoolOptions, 'build' | 'rivals' | 'seats'> {
  const build: Build | null = optionalBuild(source['build'], 'build');
  const rivals: Build[] = buildList(source['rivals'], 'rival build').filter((rival: Build | null): rival is Build => rival !== null);
  const seats: (Build | null)[] = buildList(source['seats'], 'seat build');
  if (source['seats'] !== undefined && seats.length !== DUEL.seats) throw new Error(`seats lists a build for each of the ${DUEL.seats} duel seats, got ${seats.length}`);
  return { ...(build === null ? {} : { build }), ...(rivals.length === 0 ? {} : { rivals }), ...(source['seats'] === undefined ? {} : { seats }) };
}

function flagOf(source: Fields, key: string): boolean {
  const value: unknown = source[key];
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error(`${key} must be true or false`);
  return value;
}

function treeChoice(source: Fields): Pick<PoolOptions, 'treeBuilds'> {
  return flagOf(source, 'treeBuilds') ? { treeBuilds: true } : {};
}

function cornerChoice(source: Fields): Pick<PoolOptions, 'corners'> {
  const share: number = count(source, 'corners', 0);
  if (share > 1) throw new Error('corners is the share of duels that start in a corner, at most 1');
  return share === 0 ? {} : { corners: share };
}

function roamChoice(source: Fields): Pick<PoolOptions, 'roams' | 'escorts'> {
  const roams: number = Math.floor(count(source, 'roams', 0));
  const escorts: number = Math.floor(count(source, 'escorts', 0));
  return { ...(roams === 0 ? {} : { roams }), ...(escorts === 0 ? {} : { escorts }) };
}

function levelChoice(source: Fields): Pick<PoolOptions, 'range' | 'buildLevel'> {
  const range: LevelRange | null = source['levelRange'] === undefined ? null : readLevelRange(source['levelRange']);
  const level: number | null = source['buildLevel'] === undefined ? null : count(source, 'buildLevel', BUILD.level);
  return { ...(range === null ? {} : { range }), ...(level === null ? {} : { buildLevel: level }) };
}

export function readPoolOptions(raw: unknown): PoolOptions {
  const source: Fields = fields(raw, 'hello');
  const choice: Pick<PoolOptions, 'range' | 'buildLevel'> = levelChoice(source);
  return { seed: seedOf(source), envs: Math.max(1, Math.floor(count(source, 'envs', 1))), duels: Math.floor(count(source, 'duels', 0)), ...roamChoice(source), ...cornerChoice(source), jitter: spread(source), waves: Math.max(1, Math.floor(count(source, 'waves', 1))), keepEvery: Math.floor(count(source, 'keepEvery', 0)), levels: readLevelWeights(source['levels'], choice.range), ...builds(source), ...choice, ...treeChoice(source) };
}

export function legalPool(content: Content, options: PoolOptions): PoolOptions {
  if (options.treeBuilds === true && (options.build !== undefined || options.rivals !== undefined || options.seats !== undefined)) throw new Error('treeBuilds draws every build itself, so it takes no build, rivals or seats');
  const level: number = checkedLevel(content, poolBuildLevel(options));
  checkedRange(content, poolRange(options));
  const build: Build | undefined = options.build === undefined ? undefined : mustBeLegal(content, DUEL_KIT, options.build, 'build', level);
  const seats: (Build | null)[] | undefined = options.seats?.map((seat: Build | null, index: number): Build | null => (seat === null ? null : mustBeLegal(content, DUEL_KIT, seat, `seat ${index + 1} build`, level)));
  const rivals: Build[] = (options.rivals ?? []).filter((rival: Build): boolean => buildProblems(content, DUEL_KIT, rival, level).length === 0);
  const rest: PoolOptions = { seed: options.seed, envs: options.envs, duels: options.duels, jitter: options.jitter, waves: options.waves, keepEvery: options.keepEvery, levels: options.levels };
  return { ...rest, ...(options.roams === undefined ? {} : { roams: options.roams }), ...(options.escorts === undefined ? {} : { escorts: options.escorts }), ...(build === undefined ? {} : { build }), ...(seats === undefined ? {} : { seats }), ...(rivals.length === 0 ? {} : { rivals }), ...(options.range === undefined ? {} : { range: options.range }), ...(options.buildLevel === undefined ? {} : { buildLevel: options.buildLevel }), ...(options.treeBuilds === true ? { treeBuilds: true } : {}), ...(options.corners === undefined ? {} : { corners: options.corners }) };
}

function checkedRange(content: Content, range: LevelRange): void {
  const problems: readonly string[] = rangeProblems(range, content.player.xp.maxLevel);
  if (problems.length > 0) throw new Error(problems.join('; '));
}

function buildName(build: Build | null | undefined): string | null {
  return build === null || build === undefined ? null : build.name;
}

export interface BuiltShape {
  readonly duelLevel?: number;
  readonly build?: string | null;
  readonly rivals?: readonly string[];
  readonly seats?: readonly (string | null)[];
  readonly treeBuilds?: boolean;
}

export function builtShape(options: PoolOptions): BuiltShape {
  if (options.treeBuilds === true) return { treeBuilds: true };
  if (options.build === undefined && options.rivals === undefined && options.seats === undefined) return {};
  return { duelLevel: poolBuildLevel(options), build: buildName(options.build), rivals: (options.rivals ?? []).map((rival: Build): string => rival.name), seats: (options.seats ?? []).map(buildName) };
}

function observations(step: PoolStep, envs: number): Buffer {
  return observationFrame({ envs, size: LAYOUT.size, maskSize: LAYOUT.mask, obs: step.obs, rewards: step.rewards, mask: step.mask, dones: step.dones, info: { finished: step.finished } });
}

interface DemoRequest {
  readonly seed: number;
  readonly episodes: number;
  readonly jitter: number;
  readonly waves: number;
  readonly seeds: readonly number[];
  readonly levels: readonly number[];
  readonly samples: boolean;
  readonly build: Build | null;
  readonly range: LevelRange;
  readonly buildLevel: number;
  readonly treeBuilds: boolean;
}

function seedList(raw: unknown): number[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('seeds must be a list');
  return raw.map((value: unknown): number => seedOf({ seed: value }));
}

export function readDemoRequest(raw: unknown): DemoRequest {
  const source: Fields = fields(raw, 'demo');
  const range: LevelRange = readLevelRange(source['levelRange']);
  const seeds: number[] = seedList(source['seeds']);
  const samples: unknown = source['samples'];
  if (samples !== undefined && typeof samples !== 'boolean') throw new Error('samples must be true or false');
  return { seed: seedOf(source), episodes: seeds.length > 0 ? seeds.length : Math.max(1, Math.floor(count(source, 'episodes', 1))), jitter: spread(source), waves: Math.max(1, Math.floor(count(source, 'waves', 1))), seeds, levels: readLevelWeights(source['levels'], range), samples: samples !== false, build: optionalBuild(source['build'], 'build'), range, buildLevel: count(source, 'buildLevel', BUILD.level), treeBuilds: flagOf(source, 'treeBuilds') };
}

export function demoOptions(content: Content, request: DemoRequest, rng: Rng, index: number): ArenaOptions {
  const options: ArenaOptions = { seed: request.seeds[index] ?? request.seed + index, jitter: request.jitter, waves: request.waves };
  if (request.build !== null) return { ...options, build: request.build, level: request.buildLevel };
  if (request.treeBuilds) {
    const drawn: number = treeLevel(options.seed, request.levels, request.range);
    return { ...options, level: drawn, build: treeBuildFor(content, DUEL_KIT, options.seed, drawn) };
  }
  const level: number | null = levelIn(rng, request.levels, request.range);
  return level === null ? options : { ...options, level };
}

function episodeFrame(episode: DemoEpisode | null, keepSamples: boolean): Buffer {
  const samples: readonly Demonstration[] = keepSamples ? (episode?.samples ?? []) : [];
  const obs: Float32Array = new Float32Array(samples.length * LAYOUT.size);
  const mask: Uint8Array = new Uint8Array(samples.length * LAYOUT.mask);
  const actions: Int32Array = new Int32Array(samples.length * RL.actionParts);
  samples.forEach((sample: Demonstration, index: number): void => {
    obs.set(sample.obs, index * LAYOUT.size);
    mask.set(sample.mask, index * LAYOUT.mask);
    actions.set([sample.action.move, sample.action.skill, sample.action.target, sample.action.use], index * RL.actionParts);
  });
  const episodes = episode === null ? [] : [{ seed: episode.seed, level: episode.level, outcome: episode.outcome, total: episode.total, waves: episode.waves }];
  return demonstrationFrame({ count: samples.length, size: LAYOUT.size, maskSize: LAYOUT.mask, obs, actions, mask, info: { episodes, done: episode === null } });
}

function* demonstrations(session: Session, request: DemoRequest): Generator<Buffer> {
  try {
    checkedRange(session.content, request.range);
    if (request.treeBuilds && request.build !== null) throw new Error('treeBuilds draws every build itself, so it takes no build');
    if (request.build !== null) mustBeLegal(session.content, DUEL_KIT, request.build, 'build', checkedLevel(session.content, request.buildLevel));
    const rng: Rng = createRng(request.seed + CURRICULUM.seedSalt);
    for (let index: number = 0; index < request.episodes; index += 1) yield episodeFrame(demonstrate(session.content, demoOptions(session.content, request, rng, index)), request.samples);
    yield episodeFrame(null, request.samples);
  }
  catch (error: unknown) {
    yield errorFrame(error);
  }
}

function errorFrame(error: unknown): Buffer {
  return frame(FRAME.error, jsonPart({ error: error instanceof Error ? error.message : String(error) }));
}

function needPool(session: Session): Pool {
  if (session.pool === null) throw new Error('say hello before reset or step');
  return session.pool;
}

function answer(session: Session, received: Frame): Reply {
  switch (received.kind) {
    case FRAME.hello: {
      const options: PoolOptions = legalPool(session.content, readPoolOptions(readJson(received.payload)));
      session.pool = createPool(session.content, options);
      return { frames: [frame(FRAME.hello, jsonPart({ ...contractShape(), envs: options.envs, levels: poolRange(options), ...builtShape(options) }))], keep: [], quit: false };
    }
    case FRAME.reset: {
      const pool: Pool = needPool(session);
      return { frames: [observations(poolObservations(pool), pool.options.envs)], keep: [], quit: false };
    }
    case FRAME.step: {
      const pool: Pool = needPool(session);
      const step: PoolStep = stepPool(pool, readActions(received.payload));
      return { frames: [observations(step, pool.options.envs)], keep: step.keep, quit: false };
    }
    case FRAME.tag: {
      const pool: Pool = needPool(session);
      pool.tag = text(fields(readJson(received.payload), 'tag'), 'tag', 'tag');
      return { frames: [frame(FRAME.tag, [])], keep: [], quit: false };
    }
    case FRAME.levels: {
      const pool: Pool = needPool(session);
      setLevels(pool, readLevelWeights(fields(readJson(received.payload), 'levels')['weights'], poolRange(pool.options)));
      return { frames: [frame(FRAME.levels, [])], keep: [], quit: false };
    }
    case FRAME.demo:
      return { frames: demonstrations(session, readDemoRequest(readJson(received.payload))), keep: [], quit: false };
    case FRAME.quit:
      return { frames: [], keep: [], quit: true };
    default:
      return { frames: [frame(FRAME.error, jsonPart({ error: `unknown frame kind ${received.kind}` }))], keep: [], quit: false };
  }
}

export function handle(session: Session, received: Frame): Reply {
  try {
    return answer(session, received);
  }
  catch (error: unknown) {
    return { frames: [errorFrame(error)], keep: [], quit: false };
  }
}
