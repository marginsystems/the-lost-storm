import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { revealAround } from '../../sim/world/exploration.ts';
import { stepWorld } from '../../sim/world/step.ts';
import { must, worldIn } from '../../test/support.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { World } from '../../sim/world/types.ts';
import { createLayerPixels, LAYER } from './layer.ts';
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

const content = loadContent();
const voidId: string = must([...content.zones.values()].find((zone: ZoneDef): boolean => zone.kind === 'void'), 'void zone').id;

function wallCells(pixels: LayerPixels): number[] {
  const cells: number[] = [];
  for (let at: number = 0; at < pixels.data.length; at += LAYER.channels) {
    if (pixels.data[at + 3] === 0) continue;
    if (pixels.data[at] === LAYER.wall[0] && pixels.data[at + 1] === LAYER.wall[1] && pixels.data[at + 2] === LAYER.wall[2]) cells.push(at / LAYER.channels);
  }
  return cells;
}

void test('the map of a zone shows a wall only where the grid has one, in every zone', () => {
  for (const zone of content.zones.values()) {
    const world: World = worldIn(content, zone.id, 3);
    stepWorld(world, [], 1 / 30);
    const pixels: LayerPixels = createLayerPixels();
    pixels.update(world);
    for (const cell of wallCells(pixels)) assert.equal(world.grid.solid[cell], 1, `${zone.id} cell ${cell}`);
  }
});

void test('walking a void through recentres and a rising shore never leaves a rock on the map that the world has lost', () => {
  const world: World = worldIn(content, voidId, 3);
  world.wake = null;
  world.flags['opening'] = 'read';
  const pixels: LayerPixels = createLayerPixels();
  let rocksSeen: number = 0;
  let recentres: number = 0;
  let lastShift = { ...world.shift };
  for (let step: number = 0; step < 60 * 70; step += 1) {
    stepWorld(world, [{ type: 'move', held: true, dest: { x: world.player.pos.x + world.heading.x * 20, z: world.player.pos.z + world.heading.z * 20 } }], 1 / 60);
    if (world.shift.x !== lastShift.x || world.shift.z !== lastShift.z) recentres += 1;
    lastShift = { ...world.shift };
    if (step % 90 !== 0) continue;
    pixels.update(world);
    const cells: number[] = wallCells(pixels);
    rocksSeen = Math.max(rocksSeen, cells.length);
    for (const cell of cells) assert.equal(world.grid.solid[cell], 1, `step ${step} cell ${cell}`);
    const whole: LayerPixels = createLayerPixels();
    whole.update(world);
    assert.deepEqual(pixels.data, whole.data, `step ${step}`);
  }
  assert.ok(recentres >= 2, `recentred ${recentres} times`);
  assert.ok(rocksSeen > 0);
});
