import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { PlayerState, World } from '../world/types.ts';
import { emptyArena } from './arena.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import { readyBuild } from './build-hero.ts';
import { DUEL_KIT } from './kit.ts';

const CONTENT: Content = loadContent();

const BULWARK: Build = {
  name: 'Wall',
  weapon: 'iron_maul',
  skills: ['thunderclap'],
  route: ['stone_thunderclap', 'tempered_body', 'stone_1'],
  hero: 'woman',
};

function readied(build: Build, seed: number): PlayerState {
  const world: World = emptyArena(CONTENT, seed, BUILD.level);
  readyBuild(world, build, DUEL_KIT, seed);
  return world.player;
}

void test('a readied build is the duel level, holds its route and has its skills on the bar', (): void => {
  const hero: PlayerState = readied(BULWARK, 3);
  assert.equal(hero.level, BUILD.level);
  assert.deepEqual(hero.allocated, BULWARK.route);
  assert.equal(hero.skillPoints, 0);
  assert.deepEqual(hero.bar, ['cleave', 'thunderclap', null, null, null, 'dodge_roll']);
  assert.equal(hero.hero, 'woman');
  assert.equal(hero.life, hero.maxLife);
});

void test('a readied build wears the standard kit, plain and at the duel level', (): void => {
  const hero: PlayerState = readied(BULWARK, 3);
  assert.equal(hero.equipped.weapon?.base, 'iron_maul');
  for (const piece of DUEL_KIT.armour) assert.equal(hero.equipped[piece.slot]?.base, piece.base);
  assert.equal(hero.equipped.charm, null);
  for (const item of Object.values(hero.equipped)) {
    if (item === null) continue;
    assert.equal(item.level, BUILD.level);
    assert.equal(item.rarity, DUEL_KIT.rarity);
    assert.deepEqual(item.affixes, []);
  }
});

void test('the same build on any seed gives the same hero', (): void => {
  const first: PlayerState = readied(BULWARK, 3);
  const second: PlayerState = readied(BULWARK, 977);
  assert.equal(first.maxLife, second.maxLife);
  assert.deepEqual(first.stats, second.stats);
  assert.deepEqual(first.bar, second.bar);
});
