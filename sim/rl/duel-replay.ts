import type { Content } from '../content/types.ts';
import type { Fields } from '../content/read.ts';
import { fields, items, text } from '../content/read.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, WorldEvent } from '../world/types.ts';
import { commandsFor } from './act.ts';
import type { ArenaOutcome } from './arena.ts';
import type { Build } from './build.ts';
import { readBuild } from './build.ts';
import type { Action } from './contract.ts';
import { contractShape, RL } from './contract.ts';
import type { Duel, DuelOptions, DuelSeat } from './duel.ts';
import { afterDuelTick, createDuel, DUEL, duelObservation, duelRunning, stepDuel } from './duel.ts';
import type { Observation } from './observe.ts';
import { rememberDecision } from './recall.ts';
import type { Replay } from './replay.ts';
import { actionFrom, actionLists, numberField, outcomeOf, playableReplay, readReplay } from './replay.ts';
import { REWARD } from './reward.ts';

export interface DuelSeatRecord {
  readonly actions: readonly (readonly number[])[];
  readonly outcome: ArenaOutcome;
  readonly total: number;
}

export interface DuelReplay {
  readonly situation: 'duel';
  readonly version: number;
  readonly fingerprint: string;
  readonly options: DuelOptions;
  readonly seats: readonly DuelSeatRecord[];
  readonly label: string;
}

export type KeptReplay = Replay | DuelReplay;

export interface DuelReplayer {
  readonly duel: Duel;
  readonly replay: DuelReplay;
  readonly rewards: number[];
  ticks: number;
  decision: number;
}

export function recordDuelReplay(duel: Duel, actions: readonly (readonly (readonly number[])[])[], label: string): DuelReplay {
  const shape = contractShape();
  const seats: DuelSeatRecord[] = duel.seats.map((seat: DuelSeat, index: number): DuelSeatRecord => ({ actions: actions[index] ?? [], outcome: seat.outcome, total: Math.round(seat.total * 1000) / 1000 }));
  return { situation: 'duel', version: shape.version, fingerprint: shape.fingerprint, options: duel.options, seats, label };
}

function seatCommands(duel: Duel, seat: DuelSeat, list: readonly number[]): Command[] {
  const seen: Observation = duelObservation(duel, seat);
  const action: Action = actionFrom(list);
  rememberDecision(seat.recall, action);
  return commandsFor(duel.world, action, seen.view);
}

function decisionCommands(duel: Duel, replay: DuelReplay, decision: number): Command[][] {
  return duel.seats.map((seat: DuelSeat, index: number): Command[] => {
    const list: readonly number[] | undefined = replay.seats[index]?.actions[decision];
    return list === undefined ? [] : seatCommands(duel, seat, list);
  });
}

function decisionsIn(replay: DuelReplay): number {
  if (replay.seats.length === 0) return 0;
  return Math.min(...replay.seats.map((seat: DuelSeatRecord): number => seat.actions.length));
}

export function replayDuel(content: Content, replay: DuelReplay): Duel {
  const duel: Duel = createDuel(content, playableReplay(replay).options);
  const decisions: number = decisionsIn(replay);
  for (let decision: number = 0; decision < decisions && duelRunning(duel); decision += 1) stepDuel(duel, decisionCommands(duel, replay, decision));
  return duel;
}

export function createDuelReplayer(content: Content, replay: DuelReplay): DuelReplayer {
  return { duel: createDuel(content, playableReplay(replay).options), replay, rewards: [], ticks: 0, decision: 0 };
}

export function duelReplayerDone(replayer: DuelReplayer): boolean {
  if (!duelRunning(replayer.duel)) return true;
  return replayer.ticks % RL.ticksPerDecision === 0 && replayer.decision >= decisionsIn(replayer.replay);
}

function nextDuelCommands(replayer: DuelReplayer): Command[] {
  if (replayer.ticks % RL.ticksPerDecision !== 0) return [];
  const decision: number = replayer.decision;
  replayer.decision += 1;
  for (const seat of replayer.duel.seats) seat.total -= REWARD.step;
  replayer.duel.decisions += 1;
  return decisionCommands(replayer.duel, replayer.replay, decision).flat();
}

export function duelReplayTick(replayer: DuelReplayer): WorldEvent[] {
  if (duelReplayerDone(replayer)) return [];
  const commands: Command[] = nextDuelCommands(replayer);
  const events: WorldEvent[] = stepWorld(replayer.duel.world, commands, RL.tick);
  afterDuelTick(replayer.duel, events, replayer.rewards);
  replayer.ticks += 1;
  return events;
}

function seatRecord(raw: unknown): DuelSeatRecord {
  const source: Fields = fields(raw, 'duel replay seat');
  return { actions: actionLists(source['actions']), outcome: outcomeOf(source['outcome']), total: numberField(source, 'total') };
}

function seatBuilds(raw: unknown): (Build | null)[] {
  return items(raw, 'duel replay builds').map((entry: unknown, index: number): Build | null => (entry === null ? null : readBuild(entry, `duel replay build ${index + 1}`)));
}

export function readDuelReplay(raw: unknown): DuelReplay {
  const source: Fields = fields(raw, 'duel replay');
  if (source['situation'] !== 'duel') throw new Error('replay is not of a duel');
  const options: Fields = fields(source['options'], 'duel replay options');
  const seats: DuelSeatRecord[] = items(source['seats'], 'duel replay seats').map(seatRecord);
  if (seats.length !== DUEL.seats) throw new Error(`a duel replay has ${DUEL.seats} seats, this one has ${seats.length}`);
  if (seats.some((seat: DuelSeatRecord): boolean => seat.actions.length !== seats[0]?.actions.length)) throw new Error('every seat of a duel replay decides the same number of times');
  return {
    situation: 'duel',
    version: numberField(source, 'version'),
    fingerprint: text(source, 'fingerprint', 'duel replay'),
    options: { seed: numberField(options, 'seed'), jitter: numberField(options, 'jitter'), ...(options['builds'] === undefined ? {} : { builds: seatBuilds(options['builds']) }) },
    seats,
    label: text(source, 'label', 'duel replay'),
  };
}

export function readKeptReplay(raw: unknown): KeptReplay {
  return fields(raw, 'replay')['situation'] === 'duel' ? readDuelReplay(raw) : readReplay(raw);
}
