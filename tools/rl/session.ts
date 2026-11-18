import type { Content } from '../../sim/content/types.ts';
import { fields, text } from '../../sim/content/read.ts';
import type { Fields } from '../../sim/content/read.ts';
import { contractShape, LAYOUT, RL } from '../../sim/rl/contract.ts';
import type { DemoEpisode, Demonstration } from '../../sim/rl/demo.ts';
import { demonstrate } from '../../sim/rl/demo.ts';
import type { Pool, PoolOptions, PoolStep } from '../../sim/rl/pool.ts';
import { createPool, poolObservations, stepPool } from '../../sim/rl/pool.ts';
import type { Replay } from '../../sim/rl/replay.ts';
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
  readonly keep: readonly Replay[];
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

export function readPoolOptions(raw: unknown): PoolOptions {
  const source: Fields = fields(raw, 'hello');
  return { seed: seedOf(source), envs: Math.max(1, Math.floor(count(source, 'envs', 1))), jitter: spread(source), waves: Math.max(1, Math.floor(count(source, 'waves', 1))), keepEvery: Math.floor(count(source, 'keepEvery', 0)) };
}

function observations(step: PoolStep, envs: number): Buffer {
  return observationFrame({ envs, size: LAYOUT.size, maskSize: LAYOUT.mask, obs: step.obs, rewards: step.rewards, mask: step.mask, dones: step.dones, info: { finished: step.finished } });
}

interface DemoRequest {
  readonly seed: number;
  readonly episodes: number;
  readonly jitter: number;
  readonly waves: number;
}

function readDemoRequest(raw: unknown): DemoRequest {
  const source: Fields = fields(raw, 'demo');
  return { seed: seedOf(source), episodes: Math.max(1, Math.floor(count(source, 'episodes', 1))), jitter: spread(source), waves: Math.max(1, Math.floor(count(source, 'waves', 1))) };
}

function episodeFrame(episode: DemoEpisode | null): Buffer {
  const samples: readonly Demonstration[] = episode?.samples ?? [];
  const obs: Float32Array = new Float32Array(samples.length * LAYOUT.size);
  const mask: Uint8Array = new Uint8Array(samples.length * LAYOUT.mask);
  const actions: Int32Array = new Int32Array(samples.length * RL.actionParts);
  samples.forEach((sample: Demonstration, index: number): void => {
    obs.set(sample.obs, index * LAYOUT.size);
    mask.set(sample.mask, index * LAYOUT.mask);
    actions.set([sample.action.move, sample.action.skill, sample.action.target, sample.action.flask], index * RL.actionParts);
  });
  const episodes = episode === null ? [] : [{ outcome: episode.outcome, total: episode.total, waves: episode.waves }];
  return demonstrationFrame({ count: samples.length, size: LAYOUT.size, maskSize: LAYOUT.mask, obs, actions, mask, info: { episodes, done: episode === null } });
}

function* demonstrations(session: Session, request: DemoRequest): Generator<Buffer> {
  try {
    for (let index: number = 0; index < request.episodes; index += 1) yield episodeFrame(demonstrate(session.content, { seed: request.seed + index, jitter: request.jitter, waves: request.waves }));
    yield episodeFrame(null);
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
      const options: PoolOptions = readPoolOptions(readJson(received.payload));
      session.pool = createPool(session.content, options);
      return { frames: [frame(FRAME.hello, jsonPart({ ...contractShape(), envs: options.envs }))], keep: [], quit: false };
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
