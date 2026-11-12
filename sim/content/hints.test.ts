import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import type { HintDef, HintsDef, HintSegment } from './hints.ts';
import { DESK_WORDS, hintProblems, hintSegments, hintWording, loadHints, parseHints } from './hints.ts';
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
    hints: [{ id: 'a', trigger: { type: 'game_started' }, text: 'Use {nothing} and {slot_9}', touch: 'Tap {slot_1}', done: { type: 'skills_used', slots: [7] }, after: [], forNewPlayers: true }],
  });
  assert.equal(hintProblems(defs, loadContent()).length, 3);
});

void test('a hint may only come after an earlier one', (): void => {
  assert.throws(
    (): HintsDef => parseHints({ hints: [{ id: 'a', trigger: { type: 'game_started' }, text: 'x', touch: 'x', done: { type: 'alive' }, after: ['b'], forNewPlayers: true }] }),
    ContentError,
  );
});

void test('every shipped hint has touch wording that names no mouse or keyboard action', (): void => {
  for (const hint of loadHints(loadContent()).hints) {
    assert.ok(hint.touch.length > 0, hint.id);
    assert.ok(!DESK_WORDS.test(hint.touch), `${hint.id}: ${hint.touch}`);
  }
});

void test('touch devices get the touch wording and everything else the desktop wording', (): void => {
  const move: HintDef | undefined = loadHints(loadContent()).hints.find((hint: HintDef): boolean => hint.id === 'move');
  assert.ok(move !== undefined);
  assert.equal(hintWording(move, false), 'Click the ground to move');
  assert.match(hintWording(move, true), /^Drag/);
});

void test('touch wording that says click or press, or names an unknown button, is a problem', (): void => {
  const defs: HintsDef = parseHints({
    hints: [{ id: 'a', trigger: { type: 'game_started' }, text: 'Press {map}', touch: 'Click {nowhere}', done: { type: 'alive' }, after: [], forNewPlayers: true }],
  });
  const problems: string[] = hintProblems(defs, loadContent());
  assert.ok(problems.some((problem: string): boolean => problem.includes('mouse or keyboard')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('{nowhere}')));
});
