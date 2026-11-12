import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { requestGlitch } from './glitch.ts';
import { hudHidden } from './hud.ts';
import { stepWorld } from './step.ts';
import type { World } from './types.ts';

const shipped: Content = loadContent();

function withHud(hud: ZoneDef['hud']): World {
  const town: ZoneDef = { ...zoneOf(shipped, 'stillhold'), hud };
  const content: Content = { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [town.id, town]]) };
  return worldIn(content, town.id, 1);
}

void test('a zone without a HUD rule shows the HUD', (): void => {
  assert.equal(hudHidden(withHud(null)), false);
});

void test('a HUD rule hides the HUD for as long as its conditions do not all hold', (): void => {
  const world: World = withHud({ until: [{ type: 'quest', quest: 'fallen_in', is: 'done', not: false }] });
  assert.equal(hudHidden(world), true);
  world.quests['fallen_in'] = 2;
  assert.equal(hudHidden(world), false);
});

void test('a HUD rule with no conditions hides the HUD for the whole stay', (): void => {
  const world: World = withHud({ until: [] });
  world.quests['fallen_in'] = 2;
  assert.equal(hudHidden(world), true);
});

void test('the void hides the whole HUD while the hero wakes', (): void => {
  const voidZone: ZoneDef | undefined = [...shipped.zones.values()].find((zone: ZoneDef): boolean => zone.kind === 'void');
  assert.ok(voidZone !== undefined);
  assert.equal(hudHidden(worldIn(shipped, voidZone.id, 1)), true);
});

void test('while a glitch holds the hero in the mist the HUD is hidden, and it returns after', (): void => {
  const world: World = withHud(null);
  world.monsters = [];
  requestGlitch(world, 'hard_cut', 'debug');
  stepWorld(world, [], 1 / 30);
  assert.equal(hudHidden(world), true);
  for (let step: number = 0; step < 120; step += 1) stepWorld(world, [], 1 / 30);
  assert.equal(hudHidden(world), false);
});
