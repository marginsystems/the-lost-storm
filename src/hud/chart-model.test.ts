import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { chartBounds, chartFocus, chartMatches, pathLabels, pathTint } from './chart-model.ts';

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
