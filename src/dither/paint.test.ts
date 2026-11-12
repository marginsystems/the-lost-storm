import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKDROPS, edgeFor } from './backdrops.ts';
import type { ColourStop, LayerUniforms, RadialLayer } from './paint.ts';
import { DITHER_LIMITS, layerUniforms, radii, rgba } from './paint.ts';

void test('a farthest-corner ellipse reaches its last stop exactly at the far corner and keeps the farthest-side shape, as CSS does', (): void => {
  const layer: RadialLayer = { centre: { x: 0.5, y: 0.4 }, size: { kind: 'farthest-corner' }, stops: [] };
  const shape = radii(layer, { width: 1000, height: 600 });
  assert.ok(Math.abs(Math.hypot((0 - shape.cx) / shape.rx, (600 - shape.cy) / shape.ry) - 1) < 1e-9);
  assert.ok(Math.abs(shape.rx / shape.ry - 500 / 360) < 1e-9);
});

void test('a fixed ellipse is sized against the box it covers', (): void => {
  const layer: RadialLayer = { centre: { x: 0.32, y: 0.42 }, size: { kind: 'fixed', rx: 0.42, ry: 0.3 }, stops: [] };
  assert.deepEqual(radii(layer, { width: 1000, height: 500 }), { cx: 320, cy: 210, rx: 420, ry: 150 });
});

void test('the uniforms carry pixel shapes, stop positions and premultiplied colours for the shader', (): void => {
  const uniforms: LayerUniforms = layerUniforms(BACKDROPS.title, { width: 800, height: 600 });
  assert.equal(uniforms.count, 1);
  assert.equal(uniforms.stopCounts[0], 3);
  assert.equal(uniforms.shapes[0], 400);
  assert.equal(uniforms.shapes[1], 240);
  assert.deepEqual(Array.from(uniforms.positions.slice(0, 3)), [0, Math.fround(0.34), Math.fround(0.7)]);
  const first: readonly number[] = Array.from(uniforms.colours.slice(0, 4));
  assert.ok(Math.abs((first[0] ?? 0) - (22 / 255) * 0.9) < 1e-6);
  assert.ok(Math.abs((first[3] ?? 0) - 0.9) < 1e-6);
});

void test('more layers or stops than the shader holds are cut, never written past its arrays', (): void => {
  const many: RadialLayer = { centre: { x: 0.5, y: 0.5 }, size: { kind: 'farthest-corner' }, stops: [0, 0.2, 0.4, 0.6, 0.8, 1].map((at: number) => ({ at, colour: rgba(10, 10, 10, at) })) };
  const uniforms: LayerUniforms = layerUniforms([many, many, many], { width: 10, height: 10 });
  assert.equal(uniforms.count, DITHER_LIMITS.layers);
  assert.equal(uniforms.stopCounts[0], DITHER_LIMITS.stops);
  assert.equal(uniforms.colours.length, DITHER_LIMITS.layers * DITHER_LIMITS.stops * 4);
});

void test('every backdrop fits the shader and its stops rise from the centre outward', (): void => {
  const all: readonly (readonly RadialLayer[])[] = [BACKDROPS.title, BACKDROPS.edge, BACKDROPS.voidEdge, BACKDROPS.voidLit, BACKDROPS.hurt, BACKDROPS.death, BACKDROPS.veilMist];
  for (const layers of all) {
    assert.ok(layers.length >= 1 && layers.length <= DITHER_LIMITS.layers);
    for (const layer of layers) {
      assert.ok(layer.stops.length >= 2 && layer.stops.length <= DITHER_LIMITS.stops);
      layer.stops.forEach((entry: ColourStop, index: number): void => {
        if (index > 0) assert.ok(entry.at > (layer.stops[index - 1]?.at ?? 0));
      });
    }
  }
});

void test('the void zone swaps the edge vignette for its own and every other zone keeps the plain one', (): void => {
  assert.equal(edgeFor('void'), BACKDROPS.voidEdge);
  assert.equal(edgeFor('town'), BACKDROPS.edge);
  assert.equal(edgeFor(undefined), BACKDROPS.edge);
});
