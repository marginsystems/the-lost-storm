import assert from 'node:assert/strict';
import { test } from 'node:test';
import markers from '../../data/markers.json' with { type: 'json' };
import { markerLibrary } from './parse-markers.ts';
import { ContentError } from './read.ts';

const kind = { id: 'stone', model: 'models/world/waypoint.glb', surfaces: { stone: 'ashlar' }, color: '#ffffff', glow: ['glyph'], focal: null, seal: null, veil: null, light: { intensity: 1, distance: 2, height: 1 }, shadow: 0, pick: { radius: 1, height: 1 }, label: 2, facing: 'camera', levels: { dormant: 0, awake: 0.5, aimed: 0.8, used: 1 } };
const roles = { waypoint: 'stone', checkpoint: 'stone', down: 'stone', up: 'stone' };

void test('the shipped marker kinds read and every role names one of them', (): void => {
  const library = markerLibrary(markers, 'markers');
  for (const id of Object.values(library.roles)) assert.ok(library.kinds.has(id), id);
});

void test('a marker must be a model, its levels must rise and every role must be filled', (): void => {
  assert.doesNotThrow((): unknown => markerLibrary({ roles, kinds: [kind] }, 'markers'));
  assert.throws((): unknown => markerLibrary({ roles, kinds: [{ ...kind, model: 'glow' }] }, 'markers'), ContentError);
  assert.throws((): unknown => markerLibrary({ roles, kinds: [{ ...kind, levels: { dormant: 1, awake: 0.5, aimed: 0.8, used: 1 } }] }, 'markers'), ContentError);
  assert.throws((): unknown => markerLibrary({ roles: { ...roles, up: 'arch' }, kinds: [kind] }, 'markers'), ContentError);
  assert.throws((): unknown => markerLibrary({ roles, kinds: [{ ...kind, veil: { node: 'veil', shape: 'ring', flow: 'rise', edge: '#ffffff', core: '#ffffff' } }] }, 'markers'), ContentError);
});
