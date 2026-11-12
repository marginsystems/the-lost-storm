import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { modelFootprints, outlineArea, SOLID, solidByShape, withFootprints } from './footprints.ts';
import type { ModelFootprint } from './footprints.ts';
import type { PropDef } from './prop-types.ts';
import { must } from '../../test/support.ts';

const content = loadContent();
const square: ModelFootprint = { height: 1, outline: [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }] };

void test('footprint data reads corner pairs and refuses a shape with fewer than three corners', (): void => {
  const read = modelFootprints({ 'models/a.glb': { height: 2, outline: [[0, 0], [1, 0], [0, 1]] } }, 'footprints');
  assert.equal(must(read.get('models/a.glb'), 'a').outline.length, 3);
  assert.throws((): unknown => modelFootprints({ 'models/b.glb': { height: 2, outline: [[0, 0], [1, 0]] } }, 'footprints'));
  assert.throws((): unknown => modelFootprints({ 'models/c.glb': { height: 2, outline: [[0, 'x'], [1, 0], [0, 1]] } }, 'footprints'));
});

void test('a prop is solid when it stands above the knee over enough ground, and the data can say otherwise', (): void => {
  assert.equal(outlineArea(square.outline), 4);
  assert.equal(solidByShape(1, square), true);
  assert.equal(solidByShape(SOLID.knee / 2, square), false);
  assert.equal(solidByShape(1, { height: SOLID.knee / 2, outline: square.outline }), false);
  const base: PropDef = must(content.props.get('dead_log'), 'dead_log');
  const footprints: ReadonlyMap<string, ModelFootprint> = new Map<string, ModelFootprint>([[base.model, square]]);
  const scaled: PropDef = must(withFootprints(new Map<string, PropDef>([['log', { ...base, scale: 2, solid: null }]]), footprints).get('log'), 'log');
  assert.deepEqual(scaled.footprint[2], { x: 2, z: 2 });
  const walkable: PropDef = must(withFootprints(new Map<string, PropDef>([['log', { ...base, solid: false }]]), footprints).get('log'), 'log');
  assert.equal(walkable.footprint.length, 0);
});

void test('every prop model the zones place has a measured footprint, and the big Hall rubble blocks', (): void => {
  for (const zone of content.zones.values()) for (const placed of zone.props) assert.ok(content.props.has(placed.prop));
  assert.ok(must(content.props.get('castle_rubble_large'), 'rubble').footprint.length >= 3);
  assert.ok(must(content.props.get('crag_b'), 'crag').footprint.length >= 3);
});
