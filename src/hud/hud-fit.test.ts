import assert from 'node:assert/strict';
import test from 'node:test';
import type { BandRect, HudBand, HudFit, HudGauge } from './hud-fit.ts';
import { arrangementWidth, GLOBE_GAUGE, HUD_FIT, hudBand, hudFit } from './hud-fit.ts';

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
  const fit: HudFit = hudFit(1100, 700);
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
  assert.ok(fit.scale > (360 - HUD_FIT.margin * 2) / (GLOBE_GAUGE.width * 2 + HUD_FIT.rowKeys), String(fit.scale));
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

const DESKTOP_WIDTHS: readonly number[] = [800, 850, 900, 950, 1024, 1100, 1200, 1280, 1366, 1400];
const DESKTOP_HEIGHTS: readonly number[] = [700, 768, 800, 900, 950, 1050, 1100];
const VESSEL: HudGauge = { width: 64, height: 120 };

const touches = (a: BandRect, b: BandRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

void test('from 800 to 1400 wide the bottom is one band: gauges at the ends, the bar between them on the same baseline', (): void => {
  for (const gauge of [GLOBE_GAUGE, VESSEL]) {
    for (const width of DESKTOP_WIDTHS) {
      for (const height of DESKTOP_HEIGHTS) {
        const where: string = `${width}x${height} gauge ${gauge.width}x${gauge.height}`;
        const fit: HudFit = hudFit(width, height, gauge);
        assert.equal(fit.stacked, false, where);
        assert.equal(fit.lift, 0, where);
        assert.ok(fit.scale >= HUD_FIT.rowMinScale, where);
        const band: HudBand = hudBand(fit, width, height, gauge);
        const ground: number = height - HUD_FIT.margin;
        for (const rect of [band.life, band.mana, band.bar]) assert.ok(Math.abs(rect.y + rect.h - ground) < 0.5, where);
        assert.equal(touches(band.bar, band.life) || touches(band.bar, band.mana), false, where);
        assert.ok(band.life.x >= 0 && band.mana.x + band.mana.w <= width, where);
      }
    }
  }
});

void test('the 950 by 1050 pane the owner plays in keeps the bar down at the bottom edge', (): void => {
  const fit: HudFit = hudFit(950, 1050);
  const band: HudBand = hudBand(fit, 950, 1050);
  assert.equal(fit.stacked, false);
  assert.ok(band.bar.y >= 1050 - HUD_FIT.margin - HUD_FIT.barHeight, String(band.bar.y));
});

void test('a smaller gauge frees width, so the bar keeps its names on a narrower pane', (): void => {
  assert.equal(hudFit(1100, 900).labels, 'keys');
  assert.equal(hudFit(1100, 900, VESSEL).labels, 'names');
});
