import assert from 'node:assert/strict';
import test from 'node:test';
import type { HudFit } from './hud-fit.ts';
import { arrangementWidth, HUD_FIT, hudFit } from './hud-fit.ts';

const WIDTHS: readonly number[] = [360, 480, 640, 850, 1024, 1440, 2560, 3440];

function sizes(): [number, number][] {
  const all: [number, number][] = [];
  for (const width of WIDTHS) {
    all.push([width, Math.max(320, Math.round(width * 0.5625))]);
    all.push([width, Math.round(width * 1.78)]);
  }
  all.push([844, 390], [390, 844], [1280, 400], [2560, 1080]);
  return all;
}

void test('a wide screen gets the full bar with names at full size', (): void => {
  for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1440], [3440, 1440]] as const) {
    const fit: HudFit = hudFit(width, height);
    assert.equal(fit.labels, 'names', `${width}x${height}`);
    assert.equal(fit.stacked, false);
    assert.equal(fit.scale, 1);
    assert.equal(fit.sheets, false);
    assert.equal(fit.minimap, HUD_FIT.minimapLargest);
  }
});

void test('names collapse to keys before anything shrinks', (): void => {
  const fit: HudFit = hudFit(1024, 640);
  assert.equal(fit.labels, 'keys');
  assert.equal(fit.scale, 1);
});

void test('a narrow desktop pane keeps the bar beside the globes and scales them together', (): void => {
  const fit: HudFit = hudFit(850, 478);
  assert.equal(fit.labels, 'keys');
  assert.ok(fit.scale < 1 && fit.scale > 0.6);
});

void test('a tall narrow screen stacks the bar above the globes instead of shrinking it away', (): void => {
  const fit: HudFit = hudFit(360, 780);
  assert.equal(fit.stacked, true);
  assert.ok(fit.scale > 0.6, String(fit.scale));
});

void test('a short screen never stacks, so the cluster stays low', (): void => {
  const fit: HudFit = hudFit(640, 320);
  assert.equal(fit.stacked, false);
});

void test('at every size the bottom cluster fits the width and its height budget', (): void => {
  for (const [width, height] of sizes()) {
    const fit: HudFit = hudFit(width, height);
    const where: string = `${width}x${height}`;
    assert.ok(arrangementWidth(fit) <= width - HUD_FIT.margin * 2 + 0.5, where);
    assert.ok(fit.clusterHeight - HUD_FIT.margin <= height * HUD_FIT.heightShare + 1, where);
    assert.ok(fit.scale > 0 && fit.scale <= 1, where);
  }
});

void test('panels become sheets on small screens, and the minimap and quests shrink within bounds', (): void => {
  assert.equal(hudFit(640, 360).sheets, true);
  assert.equal(hudFit(1440, 480).sheets, true);
  assert.equal(hudFit(1024, 768).sheets, false);
  for (const [width, height] of sizes()) {
    const fit: HudFit = hudFit(width, height);
    assert.ok(fit.minimap >= HUD_FIT.minimapSmallest && fit.minimap <= HUD_FIT.minimapLargest);
    assert.ok(fit.quests >= HUD_FIT.questsNarrowest && fit.quests <= HUD_FIT.questsWidest);
    assert.ok(fit.minimap + fit.quests <= width || fit.minimap <= HUD_FIT.minimapSmallest);
  }
});
