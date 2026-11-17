import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterElement } from '../content/combat-types.ts';
import type { MonsterModDef } from '../content/combat-types.ts';
import type { StatBlock } from '../content/types.ts';
import { damageTakenScale } from '../stats.ts';
import { withMods } from './elites.ts';
import { elementOf, heroTaken, monsterTaken } from './element.ts';
import type { MonsterState, World } from './types.ts';

const STORM: MonsterElement = { type: 'storm', share: 0.6, resist: 0.6 };

function resisting(world: World, storm: number): StatBlock {
  return { ...world.player.stats, stormResist: storm, frostResist: 0 };
}

void test('a storm-touched hit deals its share as storm, so storm resistance takes that share off and nothing else', (): void => {
  const world: World = arena(3, ARENA_CONTENT);
  const rules = world.content.player.resistance;
  const bare: StatBlock = resisting(world, 0);
  const warded: StatBlock = resisting(world, 0.5);
  assert.equal(heroTaken(bare, 'physical', null, rules, 0), damageTakenScale(bare, 'physical', rules, 0));
  const plain: number = heroTaken(warded, 'physical', null, rules, 0);
  const charged: number = heroTaken(warded, 'physical', STORM, rules, 0);
  assert.ok(charged < plain, 'storm resistance now counts against a storm-touched monster');
  const expected: number = damageTakenScale(warded, 'physical', rules, 0) * (1 - STORM.share) + damageTakenScale(warded, 'storm', rules, 0) * STORM.share;
  assert.ok(Math.abs(charged - expected) < 1e-12);
  assert.equal(heroTaken(bare, 'physical', STORM, rules, 0), heroTaken(bare, 'physical', null, rules, 0));
});

void test('a storm-touched monster resists storm and nothing else, and only a monster carries an element', (): void => {
  assert.ok(Math.abs(monsterTaken(STORM, 'storm') - (1 - STORM.resist)) < 1e-12);
  assert.equal(monsterTaken(STORM, 'frost'), 1);
  assert.equal(monsterTaken(STORM, 'physical'), 1);
  assert.equal(monsterTaken(null, 'storm'), 1);
  const world: World = arena(3, ARENA_CONTENT);
  const stormlit: MonsterModDef = must(ARENA_CONTENT.monsterMods.get('stormlit'), 'stormlit');
  const placed: MonsterState = place(world, 'unfinished_brute', ARENA_CENTRE);
  const monster: MonsterState = { ...placed, def: withMods(placed.def, [stormlit]) };
  assert.deepEqual(elementOf(monster), stormlit.element);
  assert.equal(elementOf(placed), null);
  assert.equal(elementOf(world.player), null);
  assert.equal(elementOf(null), null);
});
