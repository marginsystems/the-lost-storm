import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
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

void test('the route to a place starts beside what is taken and ends on the place, and a taken place needs none', (): void => {
  assert.deepEqual(chartRoute(content, [], 'stormcallers_focus'), ['stormcallers_focus']);
  assert.deepEqual(chartRoute(content, ['stormcallers_focus'], 'stormcallers_focus'), []);
  const far: string[] = chartRoute(content, ['stormcallers_focus'], 'storm_2');
  assert.equal(far.at(-1), 'storm_2');
  assert.ok(!far.includes('stormcallers_focus'));
  const first: string | undefined = far[0];
  assert.ok(first !== undefined && content.skillTree.find((node) => node.id === first)?.requires.includes('stormcallers_focus') === true);
});

void test('you are at the last place you took, and nowhere before the first', (): void => {
  assert.equal(chartHere(content, []), null);
  assert.equal(chartHere(content, ['stormcallers_focus', 'storm_1']), 'storm_1');
  assert.equal(chartHere(content, ['storm_1', 'gone_place']), 'storm_1');
});
