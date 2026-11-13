import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { canAllocate } from '../../sim/progression.ts';
import { chartBounds, chartFocus, chartHere, chartMatches, chartRoute, pathLabels, pathTint } from './chart-model.ts';

const content: Content = loadContent();

void test('a search finds places by name, effect, path or the skill a place changes, and a short query finds nothing to dim', (): void => {
  assert.equal(chartMatches(content, ''), null);
  assert.equal(chartMatches(content, 'a'), null);
  assert.equal(chartMatches(content, 'Forked')?.has('forked_bolt'), true);
  assert.equal(chartMatches(content, 'storm bolt')?.has('storm_lance'), true);
  assert.equal(chartMatches(content, 'the edge')?.has('heavy_hands'), true);
  const life: ReadonlySet<string> | null = chartMatches(content, 'maximum life');
  assert.ok(life !== null && life.has('tempered_body') && !life.has('forked_bolt'));
  assert.equal(chartMatches(content, 'zzzz')?.size, 0);
});

void test('the chart opens on the middle of what was taken, or on its centre', (): void => {
  const bounds = chartBounds(content.skillTree);
  assert.deepEqual(chartFocus(content, []), { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 });
  const one = content.skillTree.find((node): boolean => node.id === 'tempered_body');
  assert.ok(one !== undefined);
  assert.deepEqual(chartFocus(content, ['tempered_body']), { x: one.column, y: one.row });
});

void test('every path is named past its farthest place, in its own tint', (): void => {
  const labels = pathLabels(content);
  assert.equal(labels.length, content.chart.paths.length);
  for (const label of labels) {
    assert.ok(Math.hypot(label.at.x, label.at.y) > 14);
    assert.equal(pathTint(content, label.path.id), label.path.tint);
  }
});

void test('the route to a place starts beside what is held and ends on the place, and a held place needs none', (): void => {
  assert.deepEqual(chartRoute(content, [], 'storm_storm_bolt'), ['storm_storm_bolt']);
  assert.deepEqual(chartRoute(content, [], 'stormcallers_focus'), ['storm_storm_bolt', 'stormcallers_focus']);
  const held: readonly string[] = ['storm_storm_bolt', 'stormcallers_focus'];
  assert.deepEqual(chartRoute(content, held, 'stormcallers_focus'), []);
  const far: string[] = chartRoute(content, held, 'storm_2');
  assert.equal(far.at(-1), 'storm_2');
  assert.ok(!far.some((id: string): boolean => held.includes(id)));
});

void test('a route walks links either way, so it crosses a ring and turns inward to another centre, each step joined to the last', (): void => {
  const held: readonly string[] = ['storm_storm_bolt', 'stormcallers_focus', 'storm_1'];
  assert.deepEqual(chartRoute(content, held, 'blade_thunderhead'), ['storm_blade_near', 'blade_1', 'heavy_hands', 'blade_thunderhead']);
  assert.deepEqual(chartRoute(content, held, 'forked_bolt'), ['forked_bolt']);
  const taken: string[] = [...held];
  for (const id of chartRoute(content, held, 'storm_lance')) {
    assert.ok(canAllocate(content, taken, 1, id), id);
    taken.push(id);
  }
});

void test('a legacy holding routes from its trunk and counts its other held parts as already paid', (): void => {
  const legacy: readonly string[] = ['storm_storm_bolt', 'blade_thunderhead', 'heavy_hands'];
  const route: string[] = chartRoute(content, legacy, 'stormcallers_focus');
  assert.equal(route.at(-1), 'stormcallers_focus');
  assert.ok(route.includes('blade_1'));
  assert.ok(!route.includes('storm_storm_bolt'));
});

void test('you are at the last place you took, and nowhere before the first', (): void => {
  assert.equal(chartHere(content, []), null);
  assert.equal(chartHere(content, ['stormcallers_focus', 'storm_1']), 'storm_1');
  assert.equal(chartHere(content, ['storm_1', 'gone_place']), 'storm_1');
});
