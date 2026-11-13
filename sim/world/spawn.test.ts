import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../../test/road-support.ts';
import { must } from '../../test/support.ts';
import type { Content, MonsterDef, ZoneDef } from '../content/types.ts';
import { createWorld } from './create.ts';
import { areaLevel, monsterLevel, spawnMonster } from './spawn.ts';
import type { MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

function worldAt(zone: ZoneDef, heroLevel: number): World {
  const content: Content = { ...OUTPOST_CONTENT, zones: new Map<string, ZoneDef>([...OUTPOST_CONTENT.zones, [zone.id, zone]]) };
  const world: World = createWorld(content, { seed: 4, save: null });
  enterZone(world, zone, { type: 'start' });
  world.player.level = heroLevel;
  return world;
}

const FOLLOWING: ZoneDef = { ...OUTPOST_ZONE, id: 'following', level: 2, levelUpTo: 8, surge: null };

void test('a zone that follows the hero meets the hero level between its own level and its cap', (): void => {
  assert.equal(areaLevel(worldAt(FOLLOWING, 1)), 2);
  assert.equal(areaLevel(worldAt(FOLLOWING, 5)), 5);
  assert.equal(areaLevel(worldAt(FOLLOWING, 12)), 8);
});

void test('a zone without a cap keeps its own level whatever the hero level', (): void => {
  const fixed: ZoneDef = { ...FOLLOWING, id: 'fixed', levelUpTo: 2 };
  assert.equal(areaLevel(worldAt(fixed, 9)), 2);
});

void test('a monster that spawns in a following zone has the hero level and the life and damage of it', (): void => {
  const def: MonsterDef = must(OUTPOST_CONTENT.monsters.get('mended'), 'mended');
  const low: World = worldAt(FOLLOWING, 2);
  const high: World = worldAt(FOLLOWING, 6);
  const weak: MonsterState = spawnMonster(low, def, 0, { x: 28, z: 30 }, { summonerId: null, scatter: 0, revived: false });
  const strong: MonsterState = spawnMonster(high, def, 0, { x: 28, z: 30 }, { summonerId: null, scatter: 0, revived: false });
  assert.equal(weak.level, 2);
  assert.equal(strong.level, monsterLevel(high));
  assert.equal(strong.level, 6);
  assert.ok(strong.maxLife > weak.maxLife);
  assert.ok(strong.damageMax > weak.damageMax);
});
