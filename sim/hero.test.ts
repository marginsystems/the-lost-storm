import assert from 'node:assert/strict';
import { test } from 'node:test';
import player from '../data/player.json' with { type: 'json' };
import { must } from '../test/support.ts';
import { loadContent, RAW_CONTENT } from './content/content.ts';
import { contentProblems, parseContent } from './content/parse.ts';
import { ContentError } from './content/read.ts';
import type { Content, HeroDef, RigDef } from './content/types.ts';
import { chooseHero, heroFind, heroOf, heroOpen, heroRig } from './hero.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { readSave, toSave } from './save.ts';
import { frameOf, zoneCharacterNeeds } from './wear.ts';
import { addToInventory, equipFromInventory } from './world/character.ts';
import { holds } from './world/conditions.ts';
import { createWorld } from './world/create.ts';
import { stepWorld } from './world/step.ts';
import type { World } from './world/types.ts';

const content: Content = loadContent();
const [man, woman] = content.player.heroes;
const first: HeroDef = must(man, 'first hero');
const second: HeroDef = must(woman, 'second hero');

function fresh(hero: string | null): World {
  return hero === null ? createWorld(content, { seed: 3, save: null, opening: true }) : createWorld(content, { seed: 3, save: null, opening: true, hero });
}

void test('the player lists its heroes, the first is the default, and each stands on a rig of its own', (): void => {
  assert.equal(content.player.hero, first);
  assert.equal(heroOf(content, null), first);
  assert.equal(heroOf(content, 'nobody'), first);
  assert.equal(heroOf(content, second.id), second);
  assert.notEqual(heroRig(content, first.id), heroRig(content, second.id));
  const rigs: RigDef[] = content.player.heroes.map((hero: HeroDef): RigDef => must(content.rigs.get(hero.rig), hero.rig));
  assert.notEqual(must(rigs[0], 'first rig').frame, must(rigs[1], 'second rig').frame);
  for (const rig of rigs) assert.deepEqual(Object.keys(rig.clips.actions), Object.keys(must(rigs[0], 'first rig').clips.actions));
});

void test('a player with no hero is refused, and a doubled hero or a hero on an unknown rig is reported', (): void => {
  assert.throws((): Content => parseContent({ ...RAW_CONTENT, player: { ...player, heroes: [] } }), ContentError);
  const doubled: string[] = contentProblems(parseContent({ ...RAW_CONTENT, player: { ...player, heroes: [...player.heroes, ...player.heroes.slice(0, 1)] } }));
  assert.ok(doubled.includes('the player lists a hero twice'));
  const lost: string[] = contentProblems(parseContent({ ...RAW_CONTENT, player: { ...player, heroes: [{ id: 'ghost', name: 'Ghost', rig: 'no_such_rig' }] } }));
  assert.ok(lost.includes('hero ghost uses unknown rig no_such_rig'));
  assert.ok(lost.some((problem: string): boolean => problem.includes('names unknown hero')));
});

void test('a new world wakes the first hero unless another is asked for, and an unknown one is the first', (): void => {
  assert.equal(fresh(null).player.hero, first.id);
  assert.equal(fresh(second.id).player.hero, second.id);
  assert.equal(fresh('nobody').player.hero, first.id);
});

void test('the hero can be changed until a weapon is in hand, a level is gained or experience is earned, and never to an unknown one', (): void => {
  const world: World = fresh(null);
  assert.equal(heroOpen(world.player), true);
  stepWorld(world, [{ type: 'hero', hero: second.id }], 0);
  assert.equal(world.player.hero, second.id);
  assert.equal(must(world.wake, 'wake').rate, 1);
  assert.equal(chooseHero(world, 'nobody'), false);
  assert.equal(world.player.hero, second.id);
  addToInventory(world.player, must(generateItem(content, createRng(1), 77, 1, 'rusted_blade', 'common'), 'blade'));
  equipFromInventory(world, world.player.inventory.findIndex((item): boolean => item?.base === 'rusted_blade'));
  assert.equal(heroOpen(world.player), false);
  assert.equal(chooseHero(world, first.id), false);
  assert.equal(world.player.hero, second.id);
  assert.equal(heroOpen({ ...fresh(null).player, xp: 1 }), false);
  assert.equal(heroOpen({ ...fresh(null).player, level: 2 }), false);
});

void test('the hero is kept in the save, and a save from before heroes or with an unknown one reads as the first', (): void => {
  const world: World = fresh(second.id);
  const saved = toSave(world);
  assert.equal(saved.hero, second.id);
  assert.equal(must(readSave(content, structuredClone(saved)), 'read back').hero, second.id);
  assert.equal(createWorld(content, { seed: 4, save: saved, hero: first.id }).player.hero, second.id);
  const { hero: _dropped, ...older } = saved;
  assert.equal(must(readSave(content, structuredClone(older)), 'older save').hero, first.id);
  assert.equal(must(readSave(content, { ...structuredClone(saved), hero: 'nobody' }), 'odd save').hero, first.id);
});

void test('a hero condition holds for the chosen hero only, and each hero is laid a weapon of its own in the opening', (): void => {
  const world: World = fresh(second.id);
  assert.equal(holds(world, { type: 'hero', is: second.id, not: false }), true);
  assert.equal(holds(world, { type: 'hero', is: first.id, not: false }), false);
  assert.equal(holds(world, { type: 'hero', is: first.id, not: true }), true);
  const finds: (string | null)[] = content.player.heroes.map((hero: HeroDef): string | null => heroFind(content, hero.id));
  assert.deepEqual(finds, ['rusted_blade', 'worn_crossbow']);
  assert.equal(heroFind(content, 'nobody'), null);
});

void test('the models a zone needs name the chosen hero, not the other', (): void => {
  const opening = must(content.zones.get(must(content.world.opening, 'opening')), 'opening zone');
  const hers = zoneCharacterNeeds(content, opening, null, second.id);
  assert.ok(hers.rigs.has(second.rig));
  assert.ok(!hers.rigs.has(first.rig));
  assert.ok([...hers.wearables].every((key: string): boolean => key.startsWith(`${frameOf(content, second.rig)}/`)));
  assert.ok(zoneCharacterNeeds(content, opening, null).rigs.has(first.rig));
});
