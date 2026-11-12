import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import type { HintsDef, HintSegment } from './hints.ts';
import { hintProblems, hintSegments, loadHints, parseHints } from './hints.ts';
import { ContentError } from './read.ts';

void test('the shipped hints load against the shipped content', (): void => {
  const defs: HintsDef = loadHints(loadContent());
  assert.ok(defs.hints.length >= 10);
});

void test('text splits into words and keys', (): void => {
  const segments: HintSegment[] = hintSegments('Press {map} to open {tree}');
  assert.deepEqual(segments, [
    { type: 'words', text: 'Press ' },
    { type: 'key', name: 'map' },
    { type: 'words', text: ' to open ' },
    { type: 'key', name: 'tree' },
  ]);
});

void test('an unknown key or slot is a problem', (): void => {
  const defs: HintsDef = parseHints({
    hints: [{ id: 'a', trigger: { type: 'game_started' }, text: 'Use {nothing} and {slot_9}', done: { type: 'skills_used', slots: [7] }, after: [], forNewPlayers: true }],
  });
  assert.equal(hintProblems(defs, loadContent()).length, 3);
});

void test('a hint may only come after an earlier one', (): void => {
  assert.throws(
    (): HintsDef => parseHints({ hints: [{ id: 'a', trigger: { type: 'game_started' }, text: 'x', done: { type: 'alive' }, after: ['b'], forNewPlayers: true }] }),
    ContentError,
  );
});
