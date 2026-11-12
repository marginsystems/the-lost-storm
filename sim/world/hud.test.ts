import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { hiddenHudParts } from './hud.ts';
import type { World } from './types.ts';

const shipped: Content = loadContent();

function withHud(hud: ZoneDef['hud']): World {
  const town: ZoneDef = { ...zoneOf(shipped, 'stillhold'), hud };
  const content: Content = { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [town.id, town]]) };
  return worldIn(content, town.id, 1);
}

void test('a zone without a HUD rule shows every part', (): void => {
  assert.deepEqual(hiddenHudParts(withHud(null)), []);
});

void test('a HUD rule hides its parts for as long as its conditions do not all hold', (): void => {
  const world: World = withHud({ hide: ['life', 'minimap'], until: [{ type: 'quest', quest: 'fallen_in', is: 'done', not: false }] });
  assert.deepEqual(hiddenHudParts(world), ['life', 'minimap']);
  world.quests['fallen_in'] = 2;
  assert.deepEqual(hiddenHudParts(world), []);
});

void test('a HUD rule with no conditions hides its parts for the whole stay', (): void => {
  const world: World = withHud({ hide: ['bar'], until: [] });
  world.quests['fallen_in'] = 2;
  assert.deepEqual(hiddenHudParts(world), ['bar']);
});

void test('the void hides the whole HUD while the hero wakes', (): void => {
  const voidZone: ZoneDef | undefined = [...shipped.zones.values()].find((zone: ZoneDef): boolean => zone.kind === 'void');
  assert.ok(voidZone !== undefined);
  assert.deepEqual([...hiddenHudParts(worldIn(shipped, voidZone.id, 1))].toSorted(), ['bar', 'hints', 'life', 'mana', 'minimap', 'quests']);
});
