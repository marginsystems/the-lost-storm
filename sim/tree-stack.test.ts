import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef } from './content/types.ts';
import { canAllocate, findNode } from './progression.ts';
import { heldSpecialties, specialtyPlaces } from './specialty.ts';
import type { StatStack, TreeBudgets } from './tree-stack.ts';
import { bestStack, describeMiss, heroPoints, overBudget, readBudgetLevels, readBudgets, skillModValue, statStack, unbudgeted } from './tree-stack.ts';

const content: Content = loadContent();
const POINTS: number = heroPoints(content, 30);

function legal(route: readonly string[]): boolean {
  return route.every((id: string, index: number): boolean => canAllocate(content, route.slice(0, index), POINTS - index, id));
}

function placeOf(id: string): SkillTreeNodeDef {
  const node: SkillTreeNodeDef | null = findNode(content, id);
  if (node === null) throw new Error(`no place ${id}`);
  return node;
}

void test('a level-30 hero spends every point a level gives plus every point a quest grants', (): void => {
  const granted: number = content.chart.grants.reduce((sum: number, grant): number => sum + grant.points, 0);
  assert.equal(heroPoints(content, 1), granted);
  assert.equal(heroPoints(content, 30) - heroPoints(content, 29), content.chart.pointsPerLevel);
});

void test('a stack that values every place spends every point on a route the hero could take in that order', (): void => {
  const found = bestStack(content, (): number => 1, POINTS);
  assert.equal(found.route.length, POINTS);
  assert.equal(found.total, POINTS);
  assert.ok(legal(found.route));
});

void test('a stack never follows more specialties than the chart allows, however much they are worth', (): void => {
  const found = bestStack(content, (node: SkillTreeNodeDef): number => (node.specialty === null ? 0 : 1), POINTS);
  assert.ok(found.total > 0);
  assert.ok(heldSpecialties(content, found.route).length <= content.chart.specialtyLimit);
  assert.ok(legal(found.route));
});

void test('with three specialties held a stack never opens a fourth, and still finds every place it values outside them', (): void => {
  const three: readonly string[] = content.chart.specialties.slice(0, content.chart.specialtyLimit).map((entry): string => entry.id);
  const held = bestStack(content, (node: SkillTreeNodeDef): number => (node.specialty !== null && three.includes(node.specialty) && node.kind !== 'minor' ? 1 : 0), POINTS);
  assert.deepEqual(heldSpecialties(content, held.route).toSorted(), [...three].toSorted());
  const start: readonly string[] = held.route.slice(0, held.route.length - 10);
  const opened: ReadonlySet<string> = new Set<string>(heldSpecialties(content, start));
  const fourth = bestStack(content, (node: SkillTreeNodeDef): number => (node.specialty === null || opened.has(node.specialty) ? 0 : 1), POINTS, start);
  assert.ok(heldSpecialties(content, fourth.route).length <= content.chart.specialtyLimit);
  assert.ok(legal(fourth.route));
  const plain = bestStack(content, (node: SkillTreeNodeDef): number => (node.specialty === null ? 1 : 0), POINTS, start);
  assert.equal(plain.route.length, POINTS);
  assert.ok(heldSpecialties(content, plain.route).length <= content.chart.specialtyLimit);
  assert.ok(legal(plain.route));
});

void test('a stack reaches one valuable place behind worthless ones by the shortest way', (): void => {
  const target: SkillTreeNodeDef | undefined = specialtyPlaces(content, 'kiln').find((node: SkillTreeNodeDef): boolean => node.kind === 'keystone');
  assert.ok(target !== undefined);
  const found = bestStack(content, (node: SkillTreeNodeDef): number => (node.id === target.id ? 1 : 0), POINTS);
  assert.equal(found.total, 1);
  assert.equal(found.route.at(-1), target.id);
  assert.ok(legal(found.route));
  const near = bestStack(content, (node: SkillTreeNodeDef): number => (node.id === target.id ? 1 : 0), found.route.length - 1);
  assert.equal(near.total, 0);
});

void test('a stack grown from a route keeps that route as its start', (): void => {
  const start: readonly string[] = bestStack(content, (node: SkillTreeNodeDef): number => (node.path === 'stone' ? 1 : 0), 10).route;
  const found = bestStack(content, (node: SkillTreeNodeDef): number => node.statMods.length, POINTS, start);
  assert.deepEqual(found.route.slice(0, start.length), start);
  assert.ok(found.route.length <= POINTS);
  assert.ok(legal(found.route));
});

void test('a skill stack counts a reduction of a cost or a cooldown as a gain', (): void => {
  const place: SkillTreeNodeDef = placeOf('static_step');
  assert.ok(skillModValue(content, place, 'dodge_roll', 'cooldownPercent') > 0);
  assert.equal(skillModValue(content, place, 'storm_bolt', 'cooldownPercent'), 0);
});

void test('a stat stack names the weapon held, the stance it needs and a legal route', (): void => {
  const found: StatStack | null = statStack(content, 'damagePercent add', POINTS);
  assert.ok(found !== null);
  assert.ok(found.total > 0);
  assert.ok(content.chart.weaponGroups.some((group): boolean => group.id === found.held));
  assert.ok(legal(found.route));
});

void test('budgets are read from data and a stack over one is described by its stat, total and route', (): void => {
  const budgets = readBudgets({ level: 30, stats: { 'maxLife add': 10 }, skills: { chains: 2 } }, 'budgets');
  assert.equal(budgets.limits.get('maxLife add'), 10);
  assert.equal(budgets.limits.get('skill chains'), 2);
  assert.throws((): unknown => readBudgets({ level: 30, stats: { maxLife: 10 }, skills: {} }, 'budgets'), /maxLife/);
  assert.throws((): unknown => readBudgets({ level: 30, stats: {}, skills: { reach: 1 } }, 'budgets'), /reach/);
  const stack: StatStack = { key: 'maxLife add', total: 12, route: ['a', 'b'], held: 'blade', situation: { moving: false, life: 'low' }, skill: null };
  const misses = overBudget([stack, { ...stack, key: 'skill chains', total: 2, skill: 'forkline' }], budgets);
  assert.equal(misses.length, 1);
  assert.equal(describeMiss(misses[0] ?? { stack, budget: 0 }), 'maxLife add stacks to 12, over its budget of 10, holding blade at low life, through a, b');
  assert.deepEqual(unbudgeted([stack, { ...stack, key: 'armour add' }], budgets), ['armour add']);
});

function budgetLevel(at: number): unknown {
  return { level: at, stats: { 'maxLife add': at }, skills: {} };
}

void test('budget levels are read in rising order, and an empty or falling list is refused', (): void => {
  assert.deepEqual(readBudgetLevels({ levels: [budgetLevel(30), budgetLevel(50)] }, 'budgets').map((budgets: TreeBudgets): number => budgets.level), [30, 50]);
  assert.throws((): unknown => readBudgetLevels({ levels: [] }, 'budgets'), /at least one/);
  assert.throws((): unknown => readBudgetLevels({ levels: [budgetLevel(50), budgetLevel(30)] }, 'budgets'), /rising/);
});
