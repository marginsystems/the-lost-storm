import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { Build } from '../../sim/rl/build.ts';
import { buildPoints, buildProblems } from '../../sim/rl/build.ts';
import { DUEL_KIT } from '../../sim/rl/kit.ts';
import type { SearchAnswer } from './build-search.ts';
import { answerSearch, readSearchRequest } from './build-search.ts';

const CONTENT: Content = loadContent();

function builds(answer: SearchAnswer): readonly Build[] {
  assert.ok('builds' in answer);
  return answer.builds;
}

void test('random builds come back legal and full, one for each seed', (): void => {
  const drawn: readonly Build[] = builds(answerSearch(CONTENT, readSearchRequest({ action: 'random', level: 30, seeds: [1, 2, 3] })));
  assert.equal(drawn.length, 3);
  for (const build of drawn) {
    assert.deepEqual(buildProblems(CONTENT, DUEL_KIT, build, 30), []);
    assert.equal(build.route.length, buildPoints(CONTENT, 30));
  }
});

void test('mutated builds come back legal, and the same seed mutates the same way', (): void => {
  const start: readonly Build[] = builds(answerSearch(CONTENT, readSearchRequest({ action: 'random', level: 20, seeds: [5, 6] })));
  const once: readonly Build[] = builds(answerSearch(CONTENT, readSearchRequest({ action: 'mutate', level: 20, seed: 11, builds: start })));
  const again: readonly Build[] = builds(answerSearch(CONTENT, readSearchRequest({ action: 'mutate', level: 20, seed: 11, builds: start })));
  assert.deepEqual(once, again);
  for (const build of once) assert.deepEqual(buildProblems(CONTENT, DUEL_KIT, build, 20), []);
});

void test('check names what is wrong with each build', (): void => {
  const answer: SearchAnswer = answerSearch(CONTENT, readSearchRequest({ action: 'check', level: 20, builds: [{ name: 'Bad', weapon: 'nothing', skills: [], route: [] }] }));
  assert.ok('problems' in answer);
  assert.match(answer.problems[0]?.join() ?? '', /not a standard weapon/);
});

void test('a request with an unknown action, a bad level or a bad seed is refused', (): void => {
  assert.throws((): unknown => readSearchRequest({ action: 'grow', level: 20 }));
  assert.throws((): unknown => answerSearch(CONTENT, readSearchRequest({ action: 'random', level: CONTENT.player.xp.maxLevel + 1, seeds: [1] })));
  assert.throws((): unknown => readSearchRequest({ action: 'random', level: 20, seeds: [-1] }));
});
