import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { RunCondition } from '../content/run-table-types.ts';
import type { Content } from '../content/types.ts';
import { runTableProblems } from '../content/parse-run-table.ts';
import { kill } from './combat.ts';
import { risesFrom } from './run-rise.ts';
import { setOut } from './run-table.ts';
import type { RunPin } from './run-types.ts';
import type { MonsterState, World } from './types.ts';

const content: Content = loadContent();
const CAVE: string = 'under_hall';
const RESTLESS: RunCondition = must(content.runTable.conditions.find((entry: RunCondition): boolean => entry.shape.rise !== null), 'a condition that raises the slain');
const RAISED: string = must(RESTLESS.shape.rise, 'rise').monster;

function setOutWith(pins: readonly RunPin[], seed: number): World {
  const world: World = worldIn(content, content.world.town, seed);
  world.waypoints.push(CAVE);
  world.visited.push(CAVE);
  world.player.gold = 100000;
  world.service = { kind: 'descent', owner: 'descent_table', anchor: { x: 0, z: 0 } };
  setOut(world, { zone: CAVE, pins });
  return world;
}

function slay(world: World, count: number): { readonly slain: readonly MonsterState[]; readonly risen: readonly MonsterState[] } {
  const slain: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.def.boss === null && monster.summonerId === null && monster.def.id !== RAISED).slice(0, count);
  const before: ReadonlySet<number> = new Set<number>(world.monsters.map((monster: MonsterState): number => monster.id));
  for (const monster of slain) kill(world, monster, { x: 1, z: 0 });
  return { slain, risen: world.monsters.filter((monster: MonsterState): boolean => !before.has(monster.id)) };
}

void test('the restless dead condition names a plain monster and reads cleanly', (): void => {
  assert.ok(content.monsters.has(RAISED));
  assert.ok(must(RESTLESS.shape.rise, 'rise').chance > 0);
  assert.deepEqual(runTableProblems(content), []);
});

void test('in a restless run some of the slain rise again where they fell, awake and worth no loot', (): void => {
  const world: World = setOutWith([{ condition: RESTLESS.id, pick: null }], 7);
  const { slain, risen } = slay(world, 24);
  assert.ok(slain.length === 24);
  assert.ok(risen.length > 0 && risen.length < slain.length, `${risen.length} rose`);
  for (const monster of risen) {
    assert.equal(monster.def.id, RAISED);
    assert.ok(monster.revived && monster.aggro && monster.alive);
    assert.ok(slain.some((fallen: MonsterState): boolean => Math.hypot(fallen.pos.x - monster.pos.x, fallen.pos.z - monster.pos.z) < 3));
  }
});

void test('without the condition nothing rises, and what rose once does not rise again', (): void => {
  const plain: World = setOutWith([], 7);
  assert.equal(slay(plain, 24).risen.length, 0);
  const restless: World = setOutWith([{ condition: RESTLESS.id, pick: null }], 7);
  const risen: MonsterState = must(slay(restless, 24).risen[0], 'one rose');
  assert.equal(risesFrom(risen, must(RESTLESS.shape.rise, 'rise')), false);
});
