import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Command } from './simulate-args.ts';
import { DEFAULTS, parseArgs } from './simulate-args.ts';
import { POLICIES } from './simulate-policies.ts';

const MOMENTS: ReadonlySet<string> = new Set<string>(['campfire']);

function parse(args: readonly string[]): Command {
  return parseArgs(args, POLICIES, MOMENTS, 16);
}

void test('a farm runs every default skill policy on the mixed build with half the cores', (): void => {
  const command: Command = parse(['farm', '--minutes', '10', '--runs', '2']);
  assert.equal(command.kind, 'simulate');
  assert.deepEqual(command.scenario, { kind: 'farm', minutes: 10 });
  assert.equal(command.workers, 8);
  assert.equal(command.jobs.length, DEFAULTS.skills.length * 2);
  assert.deepEqual(
    command.jobs.map((job): number => job.seed),
    [1, 2, 1, 2, 1, 2],
  );
});

void test('fight, level and replay take their argument, and all expands to every policy', (): void => {
  const fight: Command = parse(['fight', 'campfire', '--repeats', '3', '--build', 'all', '--skill', 'poor']);
  assert.ok(fight.kind === 'simulate');
  assert.deepEqual(fight.scenario, { kind: 'fight', moment: 'campfire', repeats: 3 });
  assert.equal(fight.jobs.length, POLICIES.builds.size * DEFAULTS.runs);
  const level: Command = parse(['level', '5']);
  assert.ok(level.kind === 'simulate' && level.scenario.kind === 'level' && level.scenario.level === 5);
  assert.deepEqual(parse(['replay', 'a.jsonl', 'b.jsonl']), { kind: 'replay', files: ['a.jsonl', 'b.jsonl'], out: null });
});

void test('bad input explains itself instead of running', (): void => {
  for (const args of [[], ['fight'], ['fight', 'nowhere'], ['level', '1'], ['farm', '--runs', 'x'], ['farm', '--skill', 'expert'], ['dance'], ['replay']]) {
    assert.equal(parse(args).kind, 'help', args.join(' '));
  }
});
