import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Content } from '../sim/content/types.ts';
import { loadContent } from '../sim/content/content.ts';
import { must } from '../test/support.ts';
import { isLight, veilColour } from './transition.ts';

const content: Content = loadContent();

void test('the flash tears into the white through white, never through the dark of the street', (): void => {
  const colour: string | null = veilColour(content.zones, [{ type: 'zone_changed', from: 'next_moment', to: 'between' }]);
  assert.equal(colour, must(content.zones.get('between'), 'between').ambience.background);
  assert.equal(isLight(colour), true);
});

void test('the fire opens onto the dusk street through the dusk', (): void => {
  assert.equal(veilColour(content.zones, [{ type: 'zone_changed', from: 'hideout', to: 'next_moment' }]), must(content.zones.get('next_moment'), 'flash').ambience.background);
});
