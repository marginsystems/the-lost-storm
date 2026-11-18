import type { Content } from '../../sim/content/types.ts';
import { RL } from '../../sim/rl/contract.ts';
import type { Replay } from '../../sim/rl/replay.ts';
import { readReplay } from '../../sim/rl/replay.ts';
import type { Replayer } from '../../sim/rl/replayer.ts';
import { createReplayer, replayerDone, replayTick } from '../../sim/rl/replayer.ts';
import type { WorldEvent } from '../../sim/world/types.ts';

export const WATCH = {
  param: 'replay',
  speedParam: 'speed',
  minSpeed: 0.25,
  maxSpeed: 8,
  maxTicksPerFrame: 64,
} as const;

export interface Watching {
  readonly replayer: Replayer;
  readonly speed: number;
  carry: number;
}

export interface WatchRequest {
  readonly path: string;
  readonly speed: number;
}

export function watchRequest(search: string): WatchRequest | null {
  const params: URLSearchParams = new URLSearchParams(search);
  const path: string | null = params.get(WATCH.param);
  if (path === null || path === '') return null;
  const raw: string = (params.get(WATCH.speedParam) ?? '').trim();
  const asked: number = raw === '' ? 1 : Number(raw);
  const speed: number = Number.isFinite(asked) ? Math.min(WATCH.maxSpeed, Math.max(WATCH.minSpeed, asked)) : 1;
  return { path: path.startsWith('/') ? path : `/${path}`, speed };
}

export function startWatching(content: Content, raw: unknown, speed: number): Watching {
  const replay: Replay = readReplay(raw);
  return { replayer: createReplayer(content, replay), speed, carry: 0 };
}

export async function fetchWatching(content: Content, request: WatchRequest): Promise<Watching> {
  const response: Response = await fetch(request.path);
  if (!response.ok) throw new Error(`replay ${request.path} answered ${response.status}`);
  const raw: unknown = await response.json();
  return startWatching(content, raw, request.speed);
}

export function watchTicks(watching: Watching, dt: number): WorldEvent[] {
  watching.carry += dt * watching.speed;
  const due: number = Math.min(WATCH.maxTicksPerFrame, Math.floor(watching.carry / RL.tick));
  watching.carry -= due * RL.tick;
  const events: WorldEvent[] = [];
  for (let tick: number = 0; tick < due && !replayerDone(watching.replayer); tick += 1) events.push(...replayTick(watching.replayer));
  return events;
}

export function watchCaption(watching: Watching): string {
  const replay: Replay = watching.replayer.replay;
  const arena = watching.replayer.arena;
  const label: string = replay.label === '' ? 'replay' : replay.label;
  if (!replayerDone(watching.replayer)) return `Model replay ${label} · seed ${replay.options.seed} · wave ${arena.wave} of ${replay.options.waves}`;
  return `Model replay ${label} · ${arena.outcome} · ${arena.tally.waves} of ${replay.options.waves} waves cleared`;
}
