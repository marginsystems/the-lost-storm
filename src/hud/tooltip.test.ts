import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box } from './tooltip.ts';
import { tooltipSpot } from './tooltip.ts';

const VIEW: Box = { left: 0, top: 0, right: 1440, bottom: 900 };

void test('beside a panel on the right the tooltip opens to its left, so the panel stays in view', (): void => {
  const panel: Box = { left: 1110, top: 30, right: 1430, bottom: 530 };
  const spot = tooltipSpot(1190, 350, 300, 280, VIEW, panel);
  assert.ok(spot.left + 300 <= panel.left);
  assert.equal(spot.top, 366);
});

void test('beside a panel on the left the tooltip opens to its right', (): void => {
  const panel: Box = { left: 10, top: 30, right: 330, bottom: 530 };
  assert.ok(tooltipSpot(200, 350, 300, 280, VIEW, panel).left >= panel.right);
});

void test('away from any panel it follows the pointer and flips at the screen edge', (): void => {
  assert.deepEqual(tooltipSpot(100, 100, 300, 200, VIEW, null), { left: 116, top: 116 });
  assert.deepEqual(tooltipSpot(1300, 800, 300, 200, VIEW, null), { left: 984, top: 584 });
});
