import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { leanOf, leanProblems } from './lean-rules.ts';
import { dropLean } from './parse-items.ts';
import type { Content, DropLean } from './types.ts';

const content: Content = loadContent();
const leaning: Content = { ...content, leaning: true };

const ODD: DropLean = { id: 'odd', name: 'Odd', zones: ['nowhere', 'under_hall'], share: 2, weapons: ['wand'], slots: [], families: ['ghosts'], legendary: 1 };

void test('the shipped leans check out, and each Act I area and the boss court has one', (): void => {
  assert.deepEqual(leanProblems(content), []);
  for (const zone of ['under_hall', 'lava_depths_2', 'ledger_hall_3', 'ledger_court']) assert.notEqual(leanOf(leaning, zone), null, zone);
  assert.equal(leanOf(leaning, 'hideout'), null);
  assert.equal(leanOf(leaning, null), null);
  assert.equal(leanOf({ ...content, leaning: false }, 'under_hall'), null);
});

void test('a lean naming things that do not exist, sharing a zone, or favouring nothing is reported', (): void => {
  const idle: DropLean = { id: 'idle', name: 'Idle', zones: ['hideout'], share: 1, weapons: ['blade'], slots: [], families: [], legendary: 1 };
  const problems: string[] = leanProblems({ ...content, leans: [...content.leans, ODD, idle] });
  for (const expected of ['unknown zone nowhere', 'unknown weapon group wand', 'unknown family ghosts', 'zone under_hall is in two drop leans', 'drop lean idle favours nothing']) {
    assert.ok(problems.some((problem: string): boolean => problem.includes(expected)), expected);
  }
});

void test('a lean that would lower a share is refused when it is read', (): void => {
  const raw = { id: 'low', name: 'Low', zones: ['hideout'], share: 0.5, weapons: [], slots: [], families: [], legendary: 1 };
  assert.throws((): DropLean => dropLean(raw, 'lean'), /share/);
  assert.throws((): DropLean => dropLean({ ...raw, share: 2, legendary: 0.5 }, 'lean'), /legendary/);
  assert.deepEqual(dropLean({ ...raw, share: 2, slots: ['feet'] }, 'lean').slots, ['feet']);
});
