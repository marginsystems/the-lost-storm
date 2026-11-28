import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ItemBaseDef } from '../content/types.ts';
import { must } from '../../test/support.ts';
import type { ItemInstance, PlayerState } from '../world/types.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import { DUEL_KIT, weaponGroupOf } from './kit.ts';
import type { Duel, DuelSeat } from './duel.ts';
import { createDuel } from './duel.ts';
import type { DuelReplay } from './duel-replay.ts';
import { readDuelReplay, recordDuelReplay, replayDuel } from './duel-replay.ts';

const CONTENT: Content = loadContent();

const SPIN: Build = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'], hero: null };
const WALL: Build = { name: 'Wall', weapon: 'iron_maul', skills: ['thunderclap'], route: ['stone_thunderclap', 'tempered_body', 'stone_1'], hero: 'woman' };

function hero(duel: Duel, index: number): PlayerState {
  return must(duel.seats[index], `seat ${index}`).hero;
}

void test('each duel seat plays its own build at the duel level', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 11, jitter: 0, builds: [SPIN, WALL] });
  assert.equal(duel.level, BUILD.level);
  assert.deepEqual(hero(duel, 0).allocated, SPIN.route);
  assert.deepEqual(hero(duel, 1).allocated, WALL.route);
  assert.equal(hero(duel, 0).equipped.weapon?.base, 'the_millwheel');
  assert.equal(hero(duel, 1).equipped.weapon?.base, 'groundbreaker');
  assert.equal(hero(duel, 1).bar[1], 'thunderclap');
  assert.equal(hero(duel, 1).level, BUILD.level);
});

void test('swapping the builds swaps the heroes and nothing else about them', (): void => {
  const one: Duel = createDuel(CONTENT, { seed: 12, jitter: 0, builds: [SPIN, WALL] });
  const two: Duel = createDuel(CONTENT, { seed: 12, jitter: 0, builds: [WALL, SPIN] });
  assert.deepEqual(hero(one, 0).stats, hero(two, 1).stats);
  assert.deepEqual(hero(one, 1).stats, hero(two, 0).stats);
  assert.deepEqual(hero(one, 0).pos, hero(two, 0).pos);
  assert.deepEqual(hero(one, 1).pos, hero(two, 1).pos);
});

void test('a seat with no build is a random bench hero at the duel level', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 13, jitter: 0, builds: [SPIN, null] });
  assert.deepEqual(hero(duel, 0).allocated, SPIN.route);
  assert.equal(hero(duel, 1).level, BUILD.level);
});

void test('a duel replay keeps the builds and plays the same heroes again', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 14, jitter: 0.2, builds: [SPIN, WALL] });
  const record: DuelReplay = readDuelReplay(JSON.parse(JSON.stringify(recordDuelReplay(duel, [[], []], 'test'))));
  const again: Duel = replayDuel(CONTENT, record);
  again.seats.forEach((seat: DuelSeat, index: number): void => {
    assert.deepEqual(seat.hero.allocated, hero(duel, index).allocated);
    assert.deepEqual(seat.hero.stats, hero(duel, index).stats);
  });
});

void test('a duel replay must list one build for each seat', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 15, jitter: 0, builds: [SPIN, WALL] });
  const record: unknown = JSON.parse(JSON.stringify({ ...recordDuelReplay(duel, [[], []], 'test'), options: { seed: 15, jitter: 0, builds: [SPIN] } }));
  assert.throws((): unknown => readDuelReplay(record), /a build for each of the 2 seats/);
});

void test('all four duel families wear three legendary pieces and seeded rares in every other slot', (): void => {
  for (const weapon of DUEL_KIT.weapons) {
    const group = must(weaponGroupOf(CONTENT, must(CONTENT.itemBases.get(weapon), 'base')), 'group');
    const family: string = must(DUEL_KIT.families[group.id], 'family');
    const build: Build = { name: group.name, weapon, route: [], skills: [], hero: null };
    for (const level of [1, 20]) {
      const duel: Duel = createDuel(CONTENT, { seed: 81, jitter: 0, level, builds: [build, build] });
      const reroll: Duel = createDuel(CONTENT, { ...duel.options, seed: 82 });
      for (const seat of duel.seats) {
        const items: ItemInstance[] = Object.values(seat.hero.equipped).map((item: ItemInstance | null): ItemInstance => must(item, 'equipped'));
        const expected: string[] = [...CONTENT.itemBases.values()].filter((base: ItemBaseDef): boolean => base.power?.family === family).map((base: ItemBaseDef): string => base.id);
        assert.equal(expected.length, 3);
        assert.deepEqual(items.filter((item: ItemInstance): boolean => item.rarity === 'stormtouched').map((item: ItemInstance): string => item.base).toSorted(), expected.toSorted());
        assert.equal(items.filter((item: ItemInstance): boolean => item.rarity === 'rare' && item.affixes.length > 0).length, 4);
        assert.ok(items.every((item: ItemInstance): boolean => item.level === level));
        const held = must(CONTENT.itemBases.get(must(seat.hero.equipped.weapon, 'weapon').base), 'weapon base');
        assert.equal(weaponGroupOf(CONTENT, held)?.id, group.id);
      }
      assert.notDeepEqual(hero(duel, 0).equipped, hero(reroll, 0).equipped);
    }
  }
});

void test('old duel records still replay with the original equipment', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 17, jitter: 0, builds: [SPIN, WALL], legendaryGear: false });
  const record: DuelReplay = recordDuelReplay(duel, [[], []], 'old kit');
  const old = { ...record, options: { seed: 17, jitter: 0, builds: [SPIN, WALL] } };
  const restored: Duel = replayDuel(CONTENT, readDuelReplay(old));
  assert.deepEqual(hero(restored, 0).equipped, hero(duel, 0).equipped);
  assert.equal(hero(restored, 0).equipped.weapon?.base, SPIN.weapon);
});
