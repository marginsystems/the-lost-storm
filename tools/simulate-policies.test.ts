import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChartPath } from '../sim/content/types.ts';
import type { MilestoneRule } from '../sim/measure.ts';
import { nextPlace } from '../sim/bot-plan.ts';
import { holdingParts } from '../sim/progression.ts';
import { planFor, POLICIES, readPolicies } from './simulate-policies.ts';
import type { SkillPolicy } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';

void test('every build names real chart paths and real skills, and one build follows each path', (): void => {
  const paths: string[] = CONTENT.chart.paths.map((path: ChartPath): string => path.id);
  for (const build of POLICIES.builds.values()) {
    for (const path of build.paths) assert.ok(paths.includes(path), `${build.name} names ${path}`);
    for (const skill of build.skills) assert.ok(CONTENT.skills.has(skill), `${build.name} names ${skill}`);
  }
  for (const path of paths) assert.ok([...POLICIES.builds.values()].some((build): boolean => build.paths.length === 1 && build.paths[0] === path), `no build for ${path}`);
});

void test('the skill policies span careful to poor and the milestones end on the end card', (): void => {
  for (const name of ['careful', 'average', 'poor']) assert.ok(POLICIES.skills.has(name), name);
  assert.equal(POLICIES.skills.get('poor')?.habits.dodges, false);
  assert.ok(CONTENT.rarities.some((rarity): boolean => rarity.id === POLICIES.rare));
  assert.equal(POLICIES.milestones.at(-1)?.name, POLICIES.endCard);
  assert.ok(POLICIES.milestones.some((rule: MilestoneRule): boolean => rule.name === 'found_blade'));
  const careful = POLICIES.skills.get('careful');
  const mixed = POLICIES.builds.get('mixed');
  assert.ok(careful !== undefined && mixed !== undefined);
  assert.equal(planFor(careful, mixed).name, 'careful/mixed');
});

void test('a policy file with a missing field is refused', (): void => {
  assert.throws((): unknown => readPolicies({ skills: { x: { dodges: true } }, builds: {}, milestones: [], endCard: 'e', rare: 'rare', windows: [], sampleMinutes: 5 }));
});

void test('sample minutes and drop windows must be above zero', (): void => {
  const base = { skills: {}, builds: {}, milestones: [], reference: { elite: [], pack: [] }, endCard: 'e', rare: 'rare', windows: [10], sampleMinutes: 5 };
  assert.doesNotThrow((): unknown => readPolicies(base));
  assert.throws((): unknown => readPolicies({ ...base, sampleMinutes: 0 }));
  assert.throws((): unknown => readPolicies({ ...base, windows: [10, -1] }));
});

void test('every route names real places and can be walked to its end from nothing, one joined group', (): void => {
  const skill: SkillPolicy | undefined = POLICIES.skills.get('average');
  assert.ok(skill !== undefined);
  const places: string[] = CONTENT.skillTree.map((node): string => node.id);
  const moments: ReadonlySet<string> = new Set<string>(CONTENT.moments.defs.keys());
  for (const name of [...POLICIES.reference.elite, ...POLICIES.reference.pack]) assert.ok(moments.has(name), name);
  for (const build of POLICIES.builds.values()) {
    for (const place of build.route) assert.ok(places.includes(place), `${build.name} routes through ${place}`);
    if (build.focus !== null) assert.ok(CONTENT.skills.has(build.focus), `${build.name} focuses ${build.focus}`);
    if (build.hero !== null) assert.ok(CONTENT.player.heroes.some((hero): boolean => hero.id === build.hero), `${build.name} hero`);
    const plan = planFor(skill, build);
    const taken: string[] = [];
    for (let pick: number = 0; pick < places.length; pick += 1) {
      const next: string | null = nextPlace(CONTENT, plan, taken, 1);
      if (next === null) break;
      taken.push(next);
    }
    for (const place of build.route) assert.ok(taken.includes(place), `${build.name} never reaches ${place}`);
    assert.equal(holdingParts(CONTENT, taken).length, 1, build.name);
  }
});

void test('a build that keeps range names how far, and a style or weapon kind outside the list is refused', (): void => {
  const base = { skills: {}, milestones: [], reference: { elite: [], pack: [] }, endCard: 'e', rare: 'rare', windows: [10], sampleMinutes: 5 };
  const build = { paths: ['storm'], skills: [] };
  assert.doesNotThrow((): unknown => readPolicies({ ...base, builds: { a: { ...build, style: 'range', keepGap: 5 } } }));
  assert.throws((): unknown => readPolicies({ ...base, builds: { a: { ...build, style: 'range' } } }));
  assert.throws((): unknown => readPolicies({ ...base, builds: { a: { ...build, style: 'fly', keepGap: 5 } } }));
  assert.throws((): unknown => readPolicies({ ...base, builds: { a: { ...build, weapons: 'wand' } } }));
});
