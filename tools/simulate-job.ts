import type { Fields } from '../sim/content/read.ts';
import { fields, numeric, text } from '../sim/content/read.ts';
import type { Job, Scenario } from './simulate-run.ts';

export interface JobMessage {
  readonly index: number;
  readonly job: Job;
}

export interface DoneMessage {
  readonly index: number;
  readonly stream: string;
}

function readScenario(value: unknown): Scenario {
  const source: Fields = fields(value, 'scenario');
  const kind: string = text(source, 'kind', 'scenario');
  switch (kind) {
    case 'slice':
      return { kind };
    case 'farm':
      return { kind, minutes: numeric(source, 'minutes', 'scenario') };
    case 'fight':
      return { kind, moment: text(source, 'moment', 'scenario'), repeats: numeric(source, 'repeats', 'scenario') };
    case 'level':
      return { kind, level: numeric(source, 'level', 'scenario'), minutes: numeric(source, 'minutes', 'scenario') };
    default:
      throw new Error(`unknown scenario ${kind}`);
  }
}

export function readJobMessage(value: unknown): JobMessage {
  const source: Fields = fields(value, 'message');
  const job: Fields = fields(source['job'], 'message.job');
  return {
    index: numeric(source, 'index', 'message'),
    job: { scenario: readScenario(job['scenario']), skill: text(job, 'skill', 'job'), build: text(job, 'build', 'job'), seed: numeric(job, 'seed', 'job') },
  };
}

export function readDoneMessage(value: unknown): DoneMessage {
  const source: Fields = fields(value, 'message');
  return { index: numeric(source, 'index', 'message'), stream: text(source, 'stream', 'message') };
}
