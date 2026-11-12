import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn, zoneOf } from '../../test/support.ts';
import { TOWN_CONTENT } from '../../test/town-support.ts';
import type { Content, QuestDef } from '../content/types.ts';
import { requestGlitch } from './glitch.ts';
import { loadContent } from '../content/content.ts';
import { toSave } from '../save.ts';
import type { SkillDef } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { createWorld } from './create.ts';
import type { HudPart } from './hud.ts';
import { hudHidden, hudView } from './hud.ts';
import { stepWorld } from './step.ts';
import type { ItemInstance, World } from './types.ts';

const errand: QuestDef = { id: 'errand', name: 'An Errand', requires: [], when: [], objectives: [{ id: 'ask', type: 'talk', npc: 'keeper', text: 'Ask', when: [], sets: {} }] };
const shipped: Content = { ...TOWN_CONTENT, quests: new Map<string, QuestDef>([[errand.id, errand]]) };

function town(): World {
  return worldIn(shipped, zoneOf(shipped, 'hub').id, 1);
}

void test('while a glitch holds the hero in the mist the HUD is hidden, and it returns after', (): void => {
  const world: World = town();
  world.monsters = [];
  requestGlitch(world, 'hard_cut', 'debug');
  stepWorld(world, [], 1 / 30);
  assert.equal(hudHidden(world), true);
  for (let step: number = 0; step < 120; step += 1) stepWorld(world, [], 1 / 30);
  assert.equal(hudHidden(world), false);
});

const real: Content = loadContent();

function newHero(): World {
  return createWorld(real, { seed: 2, save: null, opening: true });
}

function item(world: World, base: string): ItemInstance {
  const made: ItemInstance | null = generateItem(world.content, world.rng, world.nextItemUid, 1, base, null);
  if (made === null) throw new Error(`no item ${base}`);
  world.nextItemUid += 1;
  return made;
}

function parts(world: World): readonly HudPart[] {
  return hudView(world).parts;
}

function weaponBase(): string {
  const base = [...real.itemBases.values()].find((entry): boolean => entry.slot === 'weapon');
  if (base === undefined) throw new Error('no weapon base');
  return base.id;
}

function spender(): SkillDef {
  const skill: SkillDef | undefined = [...real.skills.values()].find((entry: SkillDef): boolean => entry.manaCost > 0);
  if (skill === undefined) throw new Error('no mana skill');
  return skill;
}

void test('a hero with nothing has no HUD parts and no skill slots, so the whole HUD stays hidden while he wakes', (): void => {
  const world: World = newHero();
  assert.notEqual(world.wake, null);
  assert.deepEqual(hudView(world), { parts: [], slots: [] });
  assert.equal(hudHidden(world), true);
});

void test('his first item brings the life globe and the bag, and nothing else', (): void => {
  const world: World = newHero();
  world.player.inventory[0] = item(world, 'worn_journal');
  assert.deepEqual(parts(world), ['life', 'inventory']);
  assert.deepEqual(hudView(world).slots, []);
});

void test('a weapon skill gets its slot only once he holds a weapon, and equipping one opens the character sheet', (): void => {
  const world: World = newHero();
  world.player.equipped.weapon = item(world, weaponBase());
  assert.deepEqual(hudView(world).slots, [0]);
  assert.deepEqual(parts(world), ['life', 'character']);
});

void test('each ability on the bar adds its own slot, and empty slots never show', (): void => {
  const world: World = newHero();
  world.player.equipped.weapon = item(world, weaponBase());
  world.player.skills[3] = spender();
  assert.deepEqual(hudView(world).slots, [0, 3]);
});

void test('the mana globe shows only while an ability on the bar spends mana', (): void => {
  const world: World = newHero();
  world.player.inventory[0] = item(world, 'worn_journal');
  assert.equal(parts(world).includes('mana'), false);
  world.player.skills[2] = spender();
  assert.equal(parts(world).includes('mana'), true);
  world.player.skills[2] = null;
  assert.equal(parts(world).includes('mana'), false);
});

void test('XP, gold, the chart, the character sheet, the map and the quest line each come with what they are for', (): void => {
  const world: World = newHero();
  world.player.xp = 5;
  world.player.gold = 3;
  world.player.skillPoints = 1;
  world.visited.push('hall_of_time');
  assert.deepEqual(parts(world), ['xp', 'gold', 'chart', 'map', 'minimap']);
  world.player.level = 2;
  assert.equal(parts(world).includes('character'), true);
  const quest: string | undefined = [...real.quests.keys()][0];
  if (quest === undefined) throw new Error('no quest');
  world.quests[quest] = 0;
  assert.equal(parts(world).includes('quests'), true);
});

void test('a returning character shows exactly what that character has earned', (): void => {
  const world: World = newHero();
  world.player.equipped.weapon = item(world, weaponBase());
  world.player.inventory[0] = item(world, 'worn_journal');
  world.visited.push('hall_of_time');
  const back: World = createWorld(real, { seed: 3, save: toSave(world), opening: true });
  assert.deepEqual(hudView(back), hudView(world));
});
