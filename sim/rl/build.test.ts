import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Build } from './build.ts';
import { BUILD, buildBar, buildPoints, buildProblems, legalBuild, readBuild } from './build.ts';
import { RL } from './contract.ts';
import { DUEL_KIT } from './kit.ts';

const CONTENT: Content = loadContent();

const LEGAL: Build = {
  name: 'Spin',
  weapon: 'warden_broadsword',
  skills: ['thunderhead'],
  route: ['blade_thunderhead', 'heavy_hands', 'blade_1', 'whetstone'],
  hero: null,
};

function problems(change: Partial<Build>): readonly string[] {
  return buildProblems(CONTENT, DUEL_KIT, { ...LEGAL, ...change });
}

function oneProblem(change: Partial<Build>, pattern: RegExp): void {
  const found: readonly string[] = problems(change);
  assert.equal(found.length, 1, found.join('\n'));
  assert.match(found[0] ?? '', pattern);
}

void test('a build file reads its name, weapon, bar skills, route and optional hero', (): void => {
  const read: Build = readBuild({ name: ' Spin ', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead'] }, 'build');
  assert.deepEqual(read, { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead'], hero: null });
  assert.equal(readBuild({ ...read, hero: 'woman' }, 'build').hero, 'woman');
});

void test('a build file with a wrong shape or an unknown field is refused', (): void => {
  assert.throws((): unknown => readBuild('Spin', 'build'), /expected an object/);
  assert.throws((): unknown => readBuild({ ...LEGAL, skils: [] }, 'build'), /unknown field skils/);
  assert.throws((): unknown => readBuild({ ...LEGAL, route: 'blade_1' }, 'build'), /expected an array/);
  assert.throws((): unknown => readBuild({ ...LEGAL, weapon: 3 }, 'build'), /expected a string/);
});

void test('a legal build has no problems and the duel level gives every build the same points', (): void => {
  assert.deepEqual(problems({}), []);
  assert.equal(BUILD.level, 12);
  assert.equal(buildPoints(CONTENT), (BUILD.level - 1) * CONTENT.chart.pointsPerLevel);
});

void test('a route must start at a starting place and join each place to the ones before it', (): void => {
  oneProblem({ route: ['heavy_hands', 'blade_thunderhead'], skills: [] }, /route place 1 \(heavy_hands\) is not a starting place/);
  oneProblem({ route: ['blade_thunderhead', 'whetstone'], skills: [] }, /route place 2 \(whetstone\) does not join/);
  oneProblem({ route: ['blade_thunderhead', 'nowhere'] }, /route place 2 \(nowhere\) is not in the skill tree/);
  oneProblem({ route: ['blade_thunderhead', 'blade_thunderhead'] }, /route place 2 \(blade_thunderhead\) is already taken/);
});

void test('a route that takes more points than the duel level gives is refused', (): void => {
  const long: readonly string[] = Array.from({ length: buildPoints(CONTENT) + 1 }, (): string => 'blade_thunderhead');
  assert.ok(problems({ route: long }).some((problem: string): boolean => /takes \d+ points, but level 12 gives 22/.test(problem)));
});

void test('bar skills must exist, be unlocked, appear once and fit the four free slots', (): void => {
  oneProblem({ skills: ['storm_bolt'] }, /storm_bolt is not unlocked by the route or the skill book/);
  oneProblem({ skills: ['no_such_skill'] }, /no_such_skill does not exist/);
  oneProblem({ skills: ['thunderhead', 'thunderhead'] }, /thunderhead is on the bar twice/);
  oneProblem({ skills: ['cleave'] }, /cleave is always on the bar/);
  assert.ok(problems({ skills: ['thunderhead', 'a', 'b', 'c', 'd'] }).some((problem: string): boolean => /holds 4 skills/.test(problem)));
});

void test('the weapon must be a standard one, the hero must exist and the build must be named', (): void => {
  oneProblem({ weapon: 'gullwing_blade' }, /gullwing_blade is not a standard weapon/);
  oneProblem({ hero: 'giant' }, /hero giant is not one of/);
  oneProblem({ name: '' }, /needs a name/);
});

void test('an illegal build file fails with every problem it has', (): void => {
  assert.throws((): unknown => legalBuild(CONTENT, DUEL_KIT, { ...LEGAL, weapon: 'gullwing_blade', skills: ['storm_bolt'] }, 'a.json'), (error: unknown): boolean => error instanceof Error && /a\.json "Spin" is not a legal build/.test(error.message) && /gullwing_blade/.test(error.message) && /storm_bolt/.test(error.message));
  assert.deepEqual(legalBuild(CONTENT, DUEL_KIT, LEGAL, 'a.json'), LEGAL);
});

void test('the bar keeps the basic attack first, the roll last and the build skills between', (): void => {
  const bar: readonly (string | null)[] = buildBar(CONTENT, { ...LEGAL, skills: ['thunderhead', 'downdraught'] });
  assert.equal(bar.length, RL.slots);
  assert.deepEqual(bar, ['cleave', 'thunderhead', 'downdraught', null, null, 'dodge_roll']);
});
