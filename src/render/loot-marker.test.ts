import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { GroundItem, ItemInstance } from '../../sim/world/types.ts';
import { markerFor } from './loot-marker.ts';

const content: Content = loadContent();

function zone(id: string): ZoneDef {
  const found: ZoneDef | undefined = content.zones.get(id);
  assert.ok(found !== undefined);
  return found;
}

function drop(rarity: string, find: string | null = null): GroundItem {
  const item: ItemInstance = { uid: 1, base: 'rusted_blade', rarity, level: 1, affixes: [] };
  return { id: 1, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content: { kind: 'item', item }, age: 0, kept: false, find };
}

void test('common and magic loot carries no marker', (): void => {
  assert.equal(markerFor(content, zone('hall_of_time'), drop('common')).kind, 'none');
  assert.equal(markerFor(content, zone('hall_of_time'), drop('magic')).kind, 'none');
});

void test('rare and stormtouched loot stands in a shaft of its rarity colour, stormtouched one step taller', (): void => {
  const rare = markerFor(content, zone('hall_of_time'), drop('rare'));
  const storm = markerFor(content, zone('hall_of_time'), drop('stormtouched'));
  assert.ok(rare.kind === 'shaft' && storm.kind === 'shaft');
  assert.equal(rare.step, 0);
  assert.equal(storm.step, 1);
  assert.equal(rare.color, content.rarities.find((entry): boolean => entry.id === 'rare')?.color);
});

void test('a story find marked in the zone data gets the held bolt whatever its rarity', (): void => {
  assert.equal(markerFor(content, zone('between'), drop('common', 'blade')).kind, 'bolt');
  assert.equal(markerFor(content, zone('between'), drop('rare', 'journal')).kind, 'bolt');
});

void test('gold and an unknown find carry no marker', (): void => {
  assert.equal(markerFor(content, zone('between'), drop('rare', 'nowhere')).kind, 'none');
  assert.equal(markerFor(content, zone('between'), { ...drop('rare'), content: { kind: 'gold', amount: 5 } }).kind, 'none');
});
