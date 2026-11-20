import type { Content } from '../content/types.ts';
import { fields, items, text } from '../content/read.ts';
import type { Fields } from '../content/read.ts';
import { commandsFor } from './act.ts';
import type { Arena, ArenaOptions, ArenaOutcome } from './arena.ts';
import { arenaObservation, createArena, stepArena } from './arena.ts';
import { readBuild } from './build.ts';
import type { Action } from './contract.ts';
import { rememberDecision } from './recall.ts';
import { contractShape, RL } from './contract.ts';
import type { Observation } from './observe.ts';

export interface Replay {
  readonly situation: 'arena';
  readonly version: number;
  readonly fingerprint: string;
  readonly options: ArenaOptions;
  readonly actions: readonly (readonly number[])[];
  readonly outcome: ArenaOutcome;
  readonly total: number;
  readonly waves: number;
  readonly label: string;
}

export function actionList(action: Action): number[] {
  return [action.move, action.skill, action.target, action.use];
}

export function actionFrom(list: readonly number[]): Action {
  return { move: list[0] ?? 0, skill: list[1] ?? 0, target: list[2] ?? 0, use: list[3] ?? 0 };
}

export function recordReplay(arena: Arena, actions: readonly (readonly number[])[], label: string): Replay {
  const shape = contractShape();
  return { situation: 'arena', version: shape.version, fingerprint: shape.fingerprint, options: arena.options, actions, outcome: arena.outcome, total: Math.round(arena.total * 1000) / 1000, waves: arena.tally.waves, label };
}

export function playStep(arena: Arena, action: Action): Observation {
  const seen: Observation = arenaObservation(arena);
  stepArena(arena, commandsFor(arena.world, action, seen.view));
  rememberDecision(arena.recall, action);
  return seen;
}

export function playableReplay<Kept extends { readonly fingerprint: string }>(replay: Kept): Kept {
  const shape = contractShape();
  if (replay.fingerprint !== shape.fingerprint) throw new Error(`replay was recorded under contract ${replay.fingerprint}, the game now plays ${shape.fingerprint}`);
  return replay;
}

export function replayArena(content: Content, replay: Replay): Arena {
  const arena: Arena = createArena(content, playableReplay(replay).options);
  for (const list of replay.actions) {
    if (arena.outcome !== 'running') break;
    playStep(arena, actionFrom(list));
  }
  return arena;
}

const OUTCOMES: readonly ArenaOutcome[] = ['running', 'won', 'died', 'timeout'];

export function numberField(source: Fields, key: string): number {
  const value: unknown = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`replay field ${key} is not a number`);
  return value;
}

export function outcomeOf(value: unknown): ArenaOutcome {
  const found: ArenaOutcome | undefined = OUTCOMES.find((outcome: ArenaOutcome): boolean => outcome === value);
  if (found === undefined) throw new Error('replay outcome is unknown');
  return found;
}

export function actionLists(raw: unknown): number[][] {
  const actions: number[][] = items(raw, 'replay actions').map((entry: unknown): number[] => items(entry, 'replay action').map((value: unknown): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('replay action is not a choice');
    return value;
  }));
  if (actions.some((entry: number[]): boolean => entry.length !== RL.actionParts)) throw new Error(`replay actions must have ${RL.actionParts} parts`);
  return actions;
}

export function readReplay(raw: unknown): Replay {
  const source: Fields = fields(raw, 'replay');
  if (source['situation'] !== undefined && source['situation'] !== 'arena') throw new Error('replay is not of an arena');
  const options: Fields = fields(source['options'], 'replay options');
  const actions: number[][] = actionLists(source['actions']);
  return {
    situation: 'arena',
    version: numberField(source, 'version'),
    fingerprint: text(source, 'fingerprint', 'replay'),
    options: { seed: numberField(options, 'seed'), jitter: numberField(options, 'jitter'), waves: numberField(options, 'waves'), ...(options['level'] === undefined ? {} : { level: numberField(options, 'level') }), ...(options['build'] === undefined ? {} : { build: readBuild(options['build'], 'replay build') }) },
    actions,
    outcome: outcomeOf(source['outcome']),
    total: numberField(source, 'total'),
    waves: numberField(source, 'waves'),
    label: text(source, 'label', 'replay'),
  };
}
