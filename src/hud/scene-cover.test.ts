import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INITIAL_OVERLAYS, stepOverlays } from './overlay-core.ts';
import type { OverlayEvent, OverlayState } from './overlay-core.ts';
import { sceneCovered } from './scene-cover.ts';

function after(events: readonly OverlayEvent[]): OverlayState {
  let state: OverlayState = { ...INITIAL_OVERLAYS, phase: { ...INITIAL_OVERLAYS.phase } };
  for (const event of events) state = stepOverlays(state, event).state;
  return state;
}

void test('the 3D scene is covered only once the skill tree is fully open', (): void => {
  assert.equal(sceneCovered(INITIAL_OVERLAYS), false);
  const opening: OverlayState = after([{ type: 'present' }, { type: 'toggle', id: 'chart' }]);
  assert.equal(opening.phase.chart, 'opening');
  assert.equal(sceneCovered(opening), false);
  const open: OverlayState = after([{ type: 'present' }, { type: 'toggle', id: 'chart' }, { type: 'settled', id: 'chart' }]);
  assert.equal(sceneCovered(open), true);
  const closing: OverlayState = after([{ type: 'present' }, { type: 'toggle', id: 'chart' }, { type: 'settled', id: 'chart' }, { type: 'toggle', id: 'chart' }]);
  assert.equal(closing.phase.chart, 'closing');
  assert.equal(sceneCovered(closing), false);
});

void test('a panel that does not hide the whole screen never covers the scene', (): void => {
  const open: OverlayState = after([{ type: 'present' }, { type: 'toggle', id: 'inventory' }, { type: 'settled', id: 'inventory' }]);
  assert.equal(open.phase.inventory, 'open');
  assert.equal(sceneCovered(open), false);
});
