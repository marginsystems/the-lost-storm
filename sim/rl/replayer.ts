import type { Content } from '../content/types.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, WorldEvent } from '../world/types.ts';
import { commandsFor } from './act.ts';
import type { Arena } from './arena.ts';
import { afterTick, arenaObservation, arenaRunning, createArena } from './arena.ts';
import { RL } from './contract.ts';
import type { Replay } from './replay.ts';
import { REWARD } from './reward.ts';
import { actionFrom, playableReplay } from './replay.ts';

export interface Replayer {
  readonly arena: Arena;
  readonly replay: Replay;
  ticks: number;
  decision: number;
}

export function createReplayer(content: Content, replay: Replay): Replayer {
  return { arena: createArena(content, playableReplay(replay).options), replay, ticks: 0, decision: 0 };
}

export function replayerDone(replayer: Replayer): boolean {
  if (!arenaRunning(replayer.arena)) return true;
  return replayer.ticks % RL.ticksPerDecision === 0 && replayer.decision >= replayer.replay.actions.length;
}

function nextCommands(replayer: Replayer): readonly Command[] {
  if (replayer.ticks % RL.ticksPerDecision !== 0) return [];
  const list: readonly number[] | undefined = replayer.replay.actions[replayer.decision];
  replayer.decision += 1;
  if (list === undefined) return [];
  replayer.arena.total -= REWARD.step;
  replayer.arena.decisions += 1;
  return commandsFor(replayer.arena.world, actionFrom(list), arenaObservation(replayer.arena).view);
}

export function replayTick(replayer: Replayer): WorldEvent[] {
  if (replayerDone(replayer)) return [];
  const commands: readonly Command[] = nextCommands(replayer);
  const events: WorldEvent[] = stepWorld(replayer.arena.world, commands, RL.tick);
  afterTick(replayer.arena, events);
  replayer.ticks += 1;
  return events;
}
