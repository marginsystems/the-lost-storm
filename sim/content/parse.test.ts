import assert from 'node:assert/strict';
import { test } from 'node:test';
import arena from '../../data/arena.json' with { type: 'json' };
import attachments from '../../data/attachments.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import props from '../../data/props.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skillTree from '../../data/skill-tree.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import { must } from '../../test/support.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { canAllocate } from '../progression.ts';
import { createWorld } from '../world/create.ts';
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { Content, MonsterDef } from './types.ts';

const shipped: RawContent = { skills, monsters, items, skillTree, rigs, attachments, wearables, props, arena, player };

const extraSkill = {
  id: 'ember_lash',
  name: 'Ember Lash',
  description: 'A whip of embers.',
  icon: 'cleave',
  animation: 'attack',
  manaCost: 0,
  cooldown: 0.8,
  windup: 0.3,
  recovery: 0.3,
  scalesWithAttackSpeed: false,
  engageRange: 2.5,
  delivery: { type: 'arc', reach: 2.8, arcDegrees: 60 },
  damage: { weaponPercent: 1, flatMin: 0, flatMax: 0 },
  knockback: 3,
  stagger: 0,
  shake: 0.2,
  hitStop: 0,
  vfx: { style: 'slash', color: '#ff8844' },
};

const extraMonster = {
  id: 'ash_wraith',
  name: 'Ash Wraith',
  rig: 'skeleton_thrall',
  scale: 1.2,
  radius: 0.5,
  life: 45,
  damageMin: 5,
  damageMax: 8,
  moveSpeed: 4.4,
  xp: 14,
  aggroRadius: 10,
  behaviour: { type: 'chaser' },
  skill: 'ember_lash',
  loot: { goldChance: 0.5, goldMin: 1, goldMax: 3, itemChance: 0.1 },
  color: '#ff8844',
  tint: '#553322',
  gear: ['ash_brand'],
  wear: ['ash_shroud'],
};

const extraWearable = { id: 'ash_shroud', model: 'models/wear/peasant_shirt.glb', region: 'chest', tint: '#33302c', hides: [] };

const extraAttachment = { id: 'ash_brand', model: 'models/weapons/rusted_blade.glb', socket: 'hand_l' };

const extraBase = {
  id: 'obsidian_blade',
  name: 'Obsidian Blade',
  slot: 'weapon',
  icon: 'sword',
  dropWeight: 5,
  minLevel: 1,
  visual: 'sword_1h',
  wear: [],
  implicit: [
    { stat: 'damageMin', op: 'add', value: 7 },
    { stat: 'damageMax', op: 'add', value: 11 },
  ],
};

const extraNode = {
  id: 'ember_heart',
  name: 'Ember Heart',
  description: '+10 Maximum Life.',
  icon: 'life',
  column: 3,
  row: 3,
  requires: ['eye_of_the_storm'],
  requireMode: 'all',
  statMods: [{ stat: 'maxLife', op: 'add', value: 10 }],
  skillMods: [],
};

function extended(): RawContent {
  return {
    ...shipped,
    skills: [...skills, extraSkill],
    monsters: [...monsters, extraMonster],
    attachments: [...attachments, extraAttachment],
    wearables: [...wearables, extraWearable],
    items: { ...items, bases: [...items.bases, extraBase] },
    skillTree: [...skillTree, extraNode],
    arena: { ...arena, packs: [...arena.packs, { x: 28, z: 22, members: [{ monster: 'ash_wraith', count: 3 }] }] },
  };
}

function problem(error: unknown, text: string): boolean {
  return error instanceof ContentError && error.message.includes(text);
}

void test('a wrong field type throws a ContentError naming the field', (): void => {
  const broken: RawContent = { ...shipped, monsters: [{ ...must(monsters[0], 'monster'), life: 'lots' }] };
  assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, 'monsters[0].life'));
});

void test('a missing field throws a ContentError naming the field', (): void => {
  const { damage: _damage, ...incomplete } = must(skills[1], 'skill');
  const broken: RawContent = { ...shipped, skills: [incomplete] };
  assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, 'skills[0].damage'));
  const noRarities: RawContent = { ...shipped, items: { scaling: items.scaling, bases: [], affixes: [] } };
  assert.throws((): Content => parseContent(noRarities), (error: unknown): boolean => problem(error, 'items.rarities'));
});

void test('an unknown enum value and a duplicate id are rejected', (): void => {
  const badBehaviour: RawContent = { ...shipped, monsters: [{ ...extraMonster, behaviour: { type: 'dancer' } }] };
  assert.throws((): Content => parseContent(badBehaviour), (error: unknown): boolean => problem(error, 'behaviour.type'));
  const duplicate: RawContent = { ...shipped, attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [extraMonster, extraMonster] };
  assert.throws((): Content => parseContent(duplicate), (error: unknown): boolean => problem(error, 'duplicate id ash_wraith'));
});

void test('contentProblems reports dangling references', (): void => {
  const content: Content = parseContent({ ...shipped, attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [...monsters, { ...extraMonster, skill: 'no_such_skill', rig: 'no_such_rig' }] });
  const problems: string[] = contentProblems(content);
  assert.ok(problems.some((line: string): boolean => line.includes('ash_wraith') && line.includes('no_such_skill')));
  assert.ok(problems.some((line: string): boolean => line.includes('ash_wraith') && line.includes('no_such_rig')));
  const danglingNode: Content = parseContent({ ...shipped, skillTree: [...skillTree, { ...extraNode, requires: ['nothing'] }] });
  assert.ok(contentProblems(danglingNode).some((line: string): boolean => line.includes('nothing')));
});

void test('a new skill, monster, item base and tree node are data only', (): void => {
  const content: Content = parseContent(extended());
  assert.deepEqual(contentProblems(content), []);
  const wraith: MonsterDef = must(content.monsters.get('ash_wraith'), 'ash_wraith');
  assert.equal(wraith.skill, 'ember_lash');

  const world = createWorld(content, { seed: 7, save: null });
  const spawned = world.monsters.filter((monster): boolean => monster.def.id === 'ash_wraith');
  assert.equal(spawned.length, 3);
  assert.ok(spawned.every((monster): boolean => monster.life === 45));

  const item = must(generateItem(content, createRng(3), 1, 1, 'obsidian_blade', 'common'), 'item');
  assert.equal(item.base, 'obsidian_blade');

  assert.equal(canAllocate(content, ['eye_of_the_storm'], 1, 'ember_heart'), true);
  assert.equal(canAllocate(content, [], 1, 'ember_heart'), false);
});

void test('held gear is data: a missing attachment or socket is reported', (): void => {
  const geared: RawContent = { ...shipped, skills: [...skills, extraSkill], attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [...monsters, extraMonster] };
  const withGear: Content = parseContent(geared);
  assert.deepEqual(contentProblems(withGear), []);
  assert.deepEqual(must(withGear.monsters.get('ash_wraith'), 'ash_wraith').gear, ['ash_brand']);

  const unknownAttachment: Content = parseContent({ ...geared, attachments });
  assert.ok(contentProblems(unknownAttachment).some((found: string): boolean => found.includes('unknown attachment ash_brand')));

  const noSocket: Content = parseContent({ ...geared, attachments: [...attachments, { ...extraAttachment, socket: 'tail' }] });
  assert.ok(contentProblems(noSocket).some((found: string): boolean => found.includes('no socket tail')));

  const badVisual: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...items.bases[0], id: 'ghost_blade', visual: 'no_such_model' }] } });
  assert.ok(contentProblems(badVisual).some((found: string): boolean => found.includes('item ghost_blade uses unknown attachment no_such_model')));
});

void test('worn gear is data: unknown wearables, doubled regions and unknown body parts are reported', (): void => {
  const dressed: RawContent = { ...shipped, skills: [...skills, extraSkill], attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [...monsters, extraMonster] };
  const withWear: Content = parseContent(dressed);
  assert.deepEqual(contentProblems(withWear), []);
  assert.deepEqual(must(withWear.monsters.get('ash_wraith'), 'ash_wraith').wear, ['ash_shroud']);
  assert.equal(must(withWear.wearables.get('ash_shroud'), 'ash_shroud').region, 'chest');

  const unknownWearable: Content = parseContent({ ...dressed, wearables });
  assert.ok(contentProblems(unknownWearable).some((found: string): boolean => found.includes('monster ash_wraith wears unknown wearable ash_shroud')));

  const badRegion: RawContent = { ...shipped, wearables: [...wearables, { ...extraWearable, region: 'tail' }] };
  assert.throws((): Content => parseContent(badRegion), (error: unknown): boolean => problem(error, 'region'));

  const doubled: Content = parseContent({ ...shipped, wearables: [...wearables, extraWearable], player: { ...player, wear: ['dirty_shirt', 'ash_shroud'] } });
  assert.ok(contentProblems(doubled).some((found: string): boolean => found.includes('player wears two pieces on its chest')));

  const hidesNothing: Content = parseContent({ ...shipped, wearables: [...wearables, { ...extraWearable, hides: ['tail'] }] });
  assert.ok(contentProblems(hidesNothing).some((found: string): boolean => found.includes('wearable ash_shroud') && found.includes('no body part tail')));

  const badItem: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'ghost_coat', slot: 'chest', visual: null, wear: ['no_such_coat'] }] } });
  assert.ok(contentProblems(badItem).some((found: string): boolean => found.includes('item ghost_coat wears unknown wearable no_such_coat')));
});
