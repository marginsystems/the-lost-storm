import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { GroundItem, ItemInstance } from '../../sim/world/types.ts';
import { findLabel, pickupLine } from './pickup-notes.ts';

const content: Content = loadContent();

function lying(base: string, find: string | null): GroundItem {
  const item: ItemInstance = must(generateItem(content, createRng(1), 1, 1, base, 'common'), base);
  return { id: 1, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content: { kind: 'item', item }, find, age: 0, kept: false };
}

void test('every item picked up is named in a short line', (): void => {
  assert.equal(pickupLine(content, lying('rusted_blade', null)), 'Picked up Rusted Blade');
  assert.equal(pickupLine(content, { id: 2, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content: { kind: 'gold', amount: 5 }, find: null, age: 0, kept: false }), null);
});

void test('a find\'s tag tells the player to click or tap it', (): void => {
  assert.equal(findLabel(false), 'Click to pick up');
  assert.equal(findLabel(true), 'Tap to pick up');
});
