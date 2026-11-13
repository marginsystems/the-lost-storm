import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { revealAround } from '../../sim/world/exploration.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { World } from '../../sim/world/types.ts';
import { createLayerPixels } from './layer.ts';
import type { LayerPixels, LayerRect } from './layer.ts';

function freshWorld(): World {
  return createWorld(loadContent(), { seed: 1, save: null, opening: true });
}

void test('a layer paints the whole grid once, then nothing until more is explored', () => {
  const world: World = freshWorld();
  const pixels: LayerPixels = createLayerPixels();
  const first: LayerRect | null = pixels.update(world);
  assert.deepEqual(first, { column: 0, row: 0, columns: world.grid.columns, rows: world.grid.rows });
  assert.equal(pixels.update(world), null);
  world.exploredRevision += 1;
  assert.equal(pixels.update(world), null);
});

void test('a step into new ground repaints only the cells around it, and matches a full repaint', () => {
  const world: World = freshWorld();
  const pixels: LayerPixels = createLayerPixels();
  pixels.update(world);
  const start = { x: world.player.pos.x, z: world.player.pos.z };
  const rects: LayerRect[] = [];
  for (let step: number = 0; step < 12; step += 1) {
    if (!revealAround(world, { x: start.x + step * 1.5, z: start.z + step * 0.5 })) continue;
    const rect: LayerRect | null = pixels.update(world);
    assert.notEqual(rect, null);
    if (rect !== null) rects.push(rect);
  }
  assert.ok(rects.length > 2);
  for (const rect of rects) assert.ok(rect.columns * rect.rows < (world.grid.columns * world.grid.rows) / 10);
  const whole: LayerPixels = createLayerPixels();
  whole.update(world);
  assert.deepEqual(pixels.data, whole.data);
  assert.ok(pixels.data.some((value: number): boolean => value > 0));
});

void test('a new grid repaints in full', () => {
  const world: World = freshWorld();
  const pixels: LayerPixels = createLayerPixels();
  pixels.update(world);
  world.grid = { ...world.grid };
  assert.deepEqual(pixels.update(world), { column: 0, row: 0, columns: world.grid.columns, rows: world.grid.rows });
});
