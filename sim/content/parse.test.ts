import assert from 'node:assert/strict';
import { test } from 'node:test';
import attachments from '../../data/attachments.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import props from '../../data/props.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skillTree from '../../data/skill-tree.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import world from '../../data/world.json' with { type: 'json' };
import bastion from '../../data/zones/drowned_bastion.json' with { type: 'json' };
import stillhold from '../../data/zones/stillhold.json' with { type: 'json' };
import { must, worldIn } from '../../test/support.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { canAllocate } from '../progression.ts';
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { Content, MonsterDef, ZoneDef } from './types.ts';

const shipped: RawContent = { skills, monsters, items, skillTree, rigs, attachments, wearables, props, zones: [stillhold, bastion], world, player };

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
    zones: [stillhold, { ...bastion, packs: [...bastion.packs, { x: 28, z: 22, members: [{ monster: 'ash_wraith', count: 3 }] }] }],
  };
}

function withZone(zone: unknown): RawContent {
  return { ...shipped, zones: [stillhold, zone] };
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

  const arena = worldIn(content, 'drowned_bastion', 7);
  const spawned = arena.monsters.filter((monster): boolean => monster.def.id === 'ash_wraith');
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

void test('a zone parses with its kind, level, exits, checkpoints, surge rules and ambience', (): void => {
  const content: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, checkpoints: [{ id: 'grate', x: 28, z: 22, radius: 2 }] }] });
  const town: ZoneDef = must(content.zones.get('stillhold'), 'town');
  const arena: ZoneDef = must(content.zones.get('drowned_bastion'), 'arena');
  assert.equal(town.kind, 'town');
  assert.equal(town.surge, null);
  assert.equal(arena.kind, 'wild');
  assert.equal(arena.level, 1);
  assert.deepEqual(arena.surge, { delay: 5, surgesPerExtraMonster: 2, maxExtraMonsters: 3 });
  assert.deepEqual(arena.checkpoints, [{ id: 'grate', x: 28, z: 22, radius: 2 }]);
  assert.deepEqual(arena.exits, [{ id: 'stair', x: 28, z: 41.6, radius: 1.5, to: 'stillhold', toExit: 'bastion_stair', arrival: { x: 28, z: 37 } }]);
  assert.equal(arena.ambience.background, '#06090f');
  assert.equal(content.world.start, 'stillhold');
  assert.deepEqual(content.world.scaling, { lifePerLevel: 0.22, damagePerLevel: 0.12, xpPerLevel: 0.15 });
  assert.deepEqual(contentProblems(content), []);
});

void test('a malformed zone is rejected: ragged tiles, a town with packs, bad exits, duplicate ids', (): void => {
  assert.throws((): Content => parseContent(withZone({ ...bastion, tiles: ['....', '..'] })), (error: unknown): boolean => problem(error, 'zones[1].tiles'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, kind: 'town' })), (error: unknown): boolean => problem(error, 'a town is safe'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, kind: 'swamp' })), (error: unknown): boolean => problem(error, 'zones[1].kind'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, level: 0 })), (error: unknown): boolean => problem(error, 'zones[1].level'));
  const { surge: _surge, ...noSurgeKey } = bastion;
  assert.throws((): Content => parseContent(withZone(noSurgeKey)), (error: unknown): boolean => problem(error, 'zones[1].surge'));
  assert.equal(must(parseContent(withZone({ ...bastion, surge: null })).zones.get('drowned_bastion'), 'arena').surge, null);
  const [stair] = bastion.exits;
  assert.throws((): Content => parseContent(withZone({ ...bastion, exits: [{ ...stair, radius: 0 }] })), (error: unknown): boolean => problem(error, 'exits[0].radius'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, exits: [{ ...stair, arrival: 'door' }] })), (error: unknown): boolean => problem(error, 'exits[0].arrival'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, exits: [stair, stair] })), (error: unknown): boolean => problem(error, 'duplicate id stair'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, checkpoints: [{ id: 'a', x: 1, z: 1 }] })), (error: unknown): boolean => problem(error, 'checkpoints[0].radius'));
  assert.throws((): Content => parseContent({ ...shipped, zones: [stillhold, bastion, bastion] }), (error: unknown): boolean => problem(error, 'duplicate id drowned_bastion'));
  assert.throws((): Content => parseContent({ ...shipped, world: { start: 'stillhold' } }), (error: unknown): boolean => problem(error, 'world.scaling'));
});

void test('contentProblems reports an unknown start zone and exits that lead nowhere or are not matched', (): void => {
  const [stair] = bastion.exits;
  const lost: Content = parseContent({ ...shipped, world: { ...world, start: 'nowhere' } });
  assert.ok(contentProblems(lost).some((found: string): boolean => found.includes('unknown zone nowhere')));
  const noZone: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, exits: [{ ...stair, to: 'the_moon' }] }] });
  assert.ok(contentProblems(noZone).some((found: string): boolean => found.includes('unknown exit the_moon.bastion_stair')));
  const noExit: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, exits: [{ ...stair, toExit: 'trapdoor' }] }] });
  assert.ok(contentProblems(noExit).some((found: string): boolean => found.includes('unknown exit stillhold.trapdoor')));
  const oneWay: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, exits: [{ ...stair, id: 'ladder' }] }] });
  assert.ok(contentProblems(oneWay).some((found: string): boolean => found.includes('exit ladder is not matched by stillhold.bastion_stair')));
  const badPack: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, packs: [{ x: 1, z: 1, members: [{ monster: 'nobody', count: 1 }] }] }] });
  assert.ok(contentProblems(badPack).some((found: string): boolean => found.includes('zone drowned_bastion pack uses unknown monster nobody')));
});
