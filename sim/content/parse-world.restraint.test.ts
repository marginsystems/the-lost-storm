import assert from 'node:assert/strict';
import { test } from 'node:test';
import shippedWorld from '../../data/world.json' with { type: 'json' };
import { loadContent } from './content.ts';
import { contentProblems } from './parse.ts';
import { worldDef } from './parse-world.ts';
import { ContentError } from './read.ts';
import type { Content, RestraintMark } from './types.ts';

void test('a restraint mark that depends on restraint is rejected when the world is read', (): void => {
  const restraint: unknown[] = [{ when: [{ type: 'restraint', atLeast: 1 }] }];
  assert.throws((): unknown => worldDef({ ...shippedWorld, restraint }, 'world'), ContentError);
});

void test('a restraint mark on a flag is read as written', (): void => {
  const restraint: unknown[] = [{ when: [{ type: 'flag', flag: 'first_choice', is: 'took_journal', not: true }] }];
  assert.equal(worldDef({ ...shippedWorld, restraint }, 'world').restraint.length, 1);
});

void test('a restraint mark on an unknown flag is a content problem', (): void => {
  const restraint: RestraintMark[] = [{ when: [{ type: 'flag', flag: 'no_such_flag', is: 'set', not: false }] }];
  const content: Content = loadContent();
  assert.ok(contentProblems({ ...content, world: { ...content.world, restraint } }).some((problem: string): boolean => problem.startsWith('world restraint mark 0')));
  assert.deepEqual(contentProblems(content).filter((problem: string): boolean => problem.startsWith('world restraint mark')), []);
});
