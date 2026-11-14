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
  const over: Command = parse(['over', '9', '--zone', '1', '--minutes', '20']);
  assert.ok(over.kind === 'simulate');
  assert.deepEqual(over.scenario, { kind: 'over', hero: 9, zone: 1, minutes: 20 });
  assert.deepEqual(parse(['replay', 'a.jsonl', 'b.jsonl']), { kind: 'replay', files: ['a.jsonl', 'b.jsonl'], out: null });
});

void test('bad input explains itself instead of running', (): void => {
  for (const args of [[], ['fight'], ['fight', 'nowhere'], ['level', '1'], ['farm', '--runs', 'x'], ['farm', '--skill', 'expert'], ['dance'], ['replay'], ['farm', '--runs'], ['fight', 'campfire', '--repeats'], ['farm', '--skill', '--runs', '2'], ['farm', '--run', '20'], ['over'], ['over', '9', '--zone', '0']]) {
    assert.equal(parse(args).kind, 'help', args.join(' '));
  }
});

void test('a danger factor reaches every job, and a bad one is refused', (): void => {
  const normal: Command = parse(['level', '5']);
  assert.ok(normal.kind === 'simulate' && normal.jobs.every((job): boolean => job.danger === 1));
  const hard: Command = parse(['level', '5', '--danger', '2.5']);
  assert.ok(hard.kind === 'simulate' && hard.jobs.every((job): boolean => job.danger === 2.5));
  for (const bad of ['0', '-1', 'x']) assert.equal(parse(['level', '5', '--danger', bad]).kind, 'help', bad);
  assert.equal(parse(['level', '5', '--danger']).kind, 'help');
});

void test('a toughness factor reaches every job beside the danger factor, and a bad one is refused', (): void => {
  const both: Command = parse(['level', '5', '--danger', '2', '--toughness', '0.5']);
  assert.ok(both.kind === 'simulate' && both.jobs.every((job): boolean => job.danger === 2 && job.toughness === 0.5));
  const plain: Command = parse(['level', '5']);
  assert.ok(plain.kind === 'simulate' && plain.jobs.every((job): boolean => job.toughness === 1));
  for (const bad of ['0', '-2', 'x']) assert.equal(parse(['level', '5', '--toughness', bad]).kind, 'help', bad);
  assert.equal(parse(['level', '5', '--toughness']).kind, 'help');
});
