import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Content } from '../sim/content/types.ts';
import { loadContent } from '../sim/content/content.ts';
import { leavingColour } from './transition.ts';

const content: Content = loadContent();

void test('leaving the In-Between fades through its own white, and leaving the Hall through its night', (): void => {
  assert.equal(leavingColour(content.zones, [{ type: 'zone_changed', from: 'between', to: 'hall_of_time' }]), '#d9dcdf');
  assert.equal(leavingColour(content.zones, [{ type: 'zone_changed', from: 'hall_of_time', to: 'between' }]), '#06080d');
});

void test('with no zone change, or one from an unknown zone, the fade keeps its own colour', (): void => {
  assert.equal(leavingColour(content.zones, []), null);
  assert.equal(leavingColour(content.zones, [{ type: 'zone_changed', from: 'nowhere', to: 'between' }]), null);
});
