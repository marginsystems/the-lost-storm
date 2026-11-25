import assert from 'node:assert/strict';
import { test } from 'node:test';
import attachments from '../../data/attachments.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import lines from '../../data/lines.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import { SHALLOWS as shallows, WAYSTATION as waystation } from '../../test/pair-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { canAllocate } from '../progression.ts';
import { RAW_CONTENT } from './content.ts';
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import { ContentError, items as listOf } from './read.ts';
import type { BossDef, Content, MonsterDef, SkillTreeNodeDef } from './types.ts';

import { has, problem, shipped, zones } from '../../test/parse-support.ts';

const extraFaction = { id: 'ashen', name: 'The Ashen', palette: { tints: ['#553322'], glow: '#ff8844' }, wearables: ['ash_shroud'], weapons: ['ash_brand'], regards: { player: 'hostile' } };

const shippedFactions: readonly unknown[] = Array.isArray(RAW_CONTENT.factions) ? RAW_CONTENT.factions : [];

const ashen: readonly unknown[] = [...shippedFactions, extraFaction];

const propDefs: readonly unknown[] = Array.isArray(RAW_CONTENT.props) ? RAW_CONTENT.props : [];

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
  rig: 'human_man',
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
  faction: 'ashen',
};

const extraWearable = { id: 'ash_shroud', model: 'models/wear/wool_tunic.glb', region: 'chest', tint: '#33302c', hides: [] };

const extraAttachment = { id: 'ash_brand', model: 'models/weapons/rusted_blade.glb', socket: 'hand_l' };

const extraBase = {
  id: 'obsidian_blade',
  name: 'Obsidian Blade',
  slot: 'weapon', weaponKind: 'blade',
  material: null,
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

const skillTree: readonly unknown[] = listOf(RAW_CONTENT.skillTree, 'skillTree');

const extraNode = {
  id: 'ember_heart',
  name: 'Ember Heart',
  description: '+10 Maximum Life.',
  icon: 'tempered_body',
  kind: 'minor',
  path: 'storm',
  column: 0,
  row: -15.2,
  requires: ['eye_of_the_storm'],
  statMods: [{ stat: 'maxLife', op: 'add', value: 10 }],
  skillMods: [],
};

function extended(): RawContent {
  return {
    ...shipped,
    skills: [...skills, extraSkill],
    monsters: [...monsters, extraMonster],
    factions: ashen,
    attachments: [...attachments, extraAttachment],
    wearables: [...wearables, extraWearable],
    items: { ...items, bases: [...items.bases, extraBase] },
    skillTree: [...skillTree, extraNode],
    zones: zones(waystation, { ...shallows, packs: [...shallows.packs, { x: 28, z: 22, members: [{ monster: 'ash_wraith', count: 3 }] }] }),
  };
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

void test('a dash whose invulnerable window is negative or longer than its duration is rejected', (): void => {
  const index: number = skills.findIndex((entry): boolean => entry.id === 'dodge_roll');
  const roll = must(skills[index], 'dodge_roll');
  for (const invulnerable of [-0.1, roll.windup + 0.1]) {
    const broken: RawContent = { ...shipped, skills: skills.map((entry, at: number) => (at === index ? { ...roll, delivery: { ...roll.delivery, invulnerable } } : entry)) };
    assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, `skills[${index}].delivery.invulnerable`));
  }
});

void test('an unknown enum value and a duplicate id are rejected', (): void => {
  const badBehaviour: RawContent = { ...shipped, monsters: [{ ...extraMonster, behaviour: { type: 'dancer' } }] };
  assert.throws((): Content => parseContent(badBehaviour), (error: unknown): boolean => problem(error, 'behaviour.type'));
  for (const behaviour of [{ type: 'swarm', ring: 2 }, { type: 'ambush', spring: 4 }] as const) assert.deepEqual(must(parseContent({ ...shipped, monsters: [{ ...extraMonster, behaviour }] }).monsters.get('ash_wraith'), behaviour.type).behaviour, behaviour);
  for (const [behaviour, field] of [[{ type: 'swarm', ring: 0 }, 'ring'], [{ type: 'ambush', spring: 0 }, 'spring']] as const) assert.throws((): Content => parseContent({ ...shipped, monsters: [{ ...extraMonster, behaviour }] }), (error: unknown): boolean => problem(error, `behaviour.${field}`));
  assert.equal(must(parseContent({ ...shipped, monsters: [{ ...extraMonster, scalesLife: false }] }).monsters.get('ash_wraith'), 'fixed life').scalesLife, false);
  assert.throws((): Content => parseContent({ ...shipped, monsters: [{ ...extraMonster, scalesLife: 'no' }] }), (error: unknown): boolean => problem(error, 'scalesLife'));
  const duplicate: RawContent = { ...shipped, attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [extraMonster, extraMonster] };
  assert.throws((): Content => parseContent(duplicate), (error: unknown): boolean => problem(error, 'duplicate id ash_wraith'));
});

void test('contentProblems reports dangling references', (): void => {
  const content: Content = parseContent({ ...shipped, attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], factions: ashen, monsters: [...monsters, { ...extraMonster, skill: 'no_such_skill', rig: 'no_such_rig' }] });
  const problems: string[] = contentProblems(content);
  assert.ok(problems.some((line: string): boolean => line.includes('ash_wraith') && line.includes('no_such_skill')));
  assert.ok(problems.some((line: string): boolean => line.includes('ash_wraith') && line.includes('no_such_rig')));
  const danglingNode: Content = parseContent({ ...shipped, skillTree: [...skillTree, { ...extraNode, requires: ['nothing'] }] });
  assert.ok(contentProblems(danglingNode).some((line: string): boolean => line.includes('nothing')));
});

void test('a tree node needs a known kind and a place of its own', (): void => {
  const firstPlace: SkillTreeNodeDef = must(parseContent(shipped).skillTree[0], 'first place');
  assert.throws((): Content => parseContent({ ...shipped, skillTree: [...skillTree, { ...extraNode, kind: 'huge' }] }), /kind/);
  const stacked: Content = parseContent({ ...shipped, skillTree: [...skillTree, { ...extraNode, column: firstPlace.column, row: firstPlace.row }] });
  assert.ok(contentProblems(stacked).some((line: string): boolean => line.includes('same column and row')));
});

void test('a new skill, monster, item base and tree node are data only', (): void => {
  const content: Content = parseContent(extended());
  assert.deepEqual(contentProblems(content), []);
  const wraith: MonsterDef = must(content.monsters.get('ash_wraith'), 'ash_wraith');
  assert.equal(wraith.skill, 'ember_lash');

  const arena = worldIn(content, 'shallows', 7);
  const spawned = arena.monsters.filter((monster): boolean => monster.def.id === 'ash_wraith');
  assert.equal(spawned.length, 3);
  assert.ok(spawned.every((monster): boolean => monster.life === 45));

  const item = must(generateItem(content, createRng(3), 1, 1, 'obsidian_blade', 'common'), 'item');
  assert.equal(item.base, 'obsidian_blade');

  assert.equal(canAllocate(content, ['eye_of_the_storm'], 1, 'ember_heart'), true);
  assert.equal(canAllocate(content, [], 1, 'ember_heart'), false);
});

void test('held gear is data: a missing attachment or socket is reported', (): void => {
  const geared: RawContent = { ...shipped, skills: [...skills, extraSkill], attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], factions: ashen, monsters: [...monsters, extraMonster] };
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
  const dressed: RawContent = { ...shipped, skills: [...skills, extraSkill], attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], factions: ashen, monsters: [...monsters, extraMonster] };
  const withWear: Content = parseContent(dressed);
  assert.deepEqual(contentProblems(withWear), []);
  assert.deepEqual(must(withWear.monsters.get('ash_wraith'), 'ash_wraith').wear, ['ash_shroud']);
  assert.equal(must(withWear.wearables.get('ash_shroud'), 'ash_shroud').region, 'chest');

  const unknownWearable: Content = parseContent({ ...dressed, wearables });
  assert.ok(contentProblems(unknownWearable).some((found: string): boolean => found.includes('monster ash_wraith wears unknown wearable ash_shroud')));

  const badRegion: RawContent = { ...shipped, wearables: [...wearables, { ...extraWearable, region: 'tail' }] };
  assert.throws((): Content => parseContent(badRegion), (error: unknown): boolean => problem(error, 'region'));

  const doubled: Content = parseContent({ ...dressed, monsters: [...monsters, { ...extraMonster, wear: ['dirty_shirt', 'ash_shroud'] }] });
  assert.ok(contentProblems(doubled).some((found: string): boolean => found.includes('monster ash_wraith wears two pieces on its chest')));

  const hidesNothing: Content = parseContent({ ...shipped, wearables: [...wearables, { ...extraWearable, hides: ['tail'] }] });
  assert.ok(contentProblems(hidesNothing).some((found: string): boolean => found.includes('wearable ash_shroud') && found.includes('no body part tail')));

  const badItem: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'ghost_coat', slot: 'chest', weaponKind: null, material: 'cloth', visual: null, wear: ['no_such_coat'] }] } });
  assert.ok(contentProblems(badItem).some((found: string): boolean => found.includes('item ghost_coat wears unknown wearable no_such_coat')));

  const lookless: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'plain_coat', slot: 'chest', weaponKind: null, material: 'cloth', visual: null, wear: [] }] } });
  assert.ok(contentProblems(lookless).some((found: string): boolean => found.includes('item plain_coat has no look')));
  const wrongRegion: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'boot_coat', slot: 'chest', weaponKind: null, material: 'cloth', visual: null, wear: ['worn_boots'] }] } });
  assert.ok(contentProblems(wrongRegion).some((found: string): boolean => found.includes('item boot_coat in slot chest wears worn_boots, which covers feet')));
  assert.ok(!contentProblems(parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'pauldron_coat', slot: 'chest', weaponKind: null, material: 'cloth', visual: null, wear: ['militia_tunic', 'tunic_pauldron'] }] } })).some((found: string): boolean => found.includes('pauldron_coat')));
  const bareCoat: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'bare_coat', slot: 'chest', weaponKind: null, visual: null }] } });
  assert.ok(contentProblems(bareCoat).some((found: string): boolean => found.includes('item bare_coat in slot chest needs a material')));
  const plateSword: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, material: 'plate' }] } });
  assert.ok(contentProblems(plateSword).some((found: string): boolean => found.includes('item obsidian_blade in slot weapon cannot have a material')));
  const oddCloth: RawContent = { ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, material: 'silk' }] } };
  assert.throws((): Content => parseContent(oddCloth), (error: unknown): boolean => problem(error, 'material'));
});

function bossy(change: (block: Record<string, unknown>) => Record<string, unknown>): RawContent {
  const source = must(monsters.find((entry): boolean => entry.id === 'unfinished_colossus'), 'unfinished_colossus');
  const changed: unknown = { ...source, boss: change({ ...must(source.boss, 'boss block') }) };
  return { ...shipped, monsters: monsters.map((entry): unknown => (entry === source ? changed : entry)) };
}

void test('a boss block parses with its phases, poise, drop and barks, and a pack takes a condition', (): void => {
  const content: Content = parseContent(shipped);
  const boss: BossDef = must(must(content.monsters.get('stormcaller_rival'), 'boss').boss, 'boss block');
  assert.equal(boss.title.length > 0, true);
  assert.deepEqual(boss.phases.map((phase): number => phase.below), [1, 0.5]);
  assert.deepEqual(must(boss.phases[0], 'phase').skills, [
    { skill: 'rival_cleave', weight: 3 },
    { skill: 'rival_bolt', weight: 2 },
  ]);
  assert.deepEqual(must(boss.phases[1], 'phase').barks, []);
  assert.deepEqual(boss.poise, { knockback: 0.2 });
  assert.deepEqual(boss.drop, { items: 1, floor: 'rare', goldMin: 30, goldMax: 50 });
  assert.equal(boss.firstKill, null);
  assert.deepEqual(must(must(content.monsters.get('timekeeper_gatekeeper'), 'gatekeeper').boss, 'gatekeeper block').firstKill, { flag: 'keeper_defeated', xpShare: 0.5, goldMin: 200, goldMax: 260 });
  assert.deepEqual(boss.barks, { aggro: [], death: [] });
  assert.equal(must(content.monsters.get('mended'), 'thrall').boss, null);
  const during = [{ type: 'quest', quest: 'out_of_the_mist', is: 'done' }];
  const gated: Content = parseContent({ ...shipped, zones: [waystation, { ...shallows, packs: [{ ...shallows.packs[0], when: during }] }] });
  assert.deepEqual(must(must(gated.zones.get('shallows'), 'arena').packs[0], 'pack').when, [{ type: 'quest', quest: 'out_of_the_mist', is: 'done', not: false }]);
  assert.deepEqual(must(must(content.zones.get('shallows'), 'arena').packs[0], 'pack').when, []);
});

void test('a malformed boss block is rejected', (): void => {
  const rejects = (change: (block: Record<string, unknown>) => Record<string, unknown>, text: string): void => {
    assert.throws((): Content => parseContent(bossy(change)), (error: unknown): boolean => problem(error, text), text);
  };
  const phase = { below: 1, skills: [{ skill: 'colossus_hammer', weight: 1 }], barks: [] };
  rejects((block) => ({ ...block, phases: [{ ...phase, below: 0.8 }] }), 'the first phase must start at full life');
  rejects((block) => ({ ...block, phases: [phase, { ...phase, below: 0.5 }, { ...phase, below: 0.5 }] }), 'each phase must begin at a lower life fraction');
  rejects((block) => ({ ...block, phases: [{ ...phase, skills: [] }] }), 'a phase needs at least one skill');
  rejects((block) => ({ ...block, phases: [{ ...phase, skills: [{ skill: 'colossus_hammer', weight: 0 }] }] }), 'skills[0].weight');
  rejects((block) => ({ ...block, phases: [phase, { ...phase, below: 0 }] }), 'phases[1].below');
  rejects((block) => ({ ...block, poise: { knockback: 1.5 } }), 'poise.knockback');
  rejects((block) => ({ ...block, drop: { items: -1, floor: 'rare', goldMin: 1, goldMax: 2 } }), 'drop.items');
  rejects((block) => ({ ...block, drop: { items: 1.5, floor: 'rare', goldMin: 1, goldMax: 2 } }), 'drop.items');
  rejects((block) => ({ ...block, drop: { items: 1, floor: 'rare', goldMin: -4, goldMax: 2 } }), 'drop.goldMin');
  rejects((block) => ({ ...block, drop: { items: 1, floor: 'rare', goldMin: 50, goldMax: 30 } }), 'drop.goldMax');
  rejects((block) => ({ ...block, barks: { aggro: [] } }), 'barks.death');
  rejects((block) => ({ ...block, firstKill: { flag: 'won', xpShare: 1.5, goldMin: 0, goldMax: 0 } }), 'firstKill.xpShare');
  rejects((block) => ({ ...block, firstKill: { flag: 'won', xpShare: 0.5, goldMin: 9, goldMax: 3 } }), 'firstKill.goldMax');
  rejects((block) => ({ ...block, firstKill: { xpShare: 0.5, goldMin: 0, goldMax: 0 } }), 'firstKill.flag');
  assert.equal(must(parseContent(bossy((block) => ({ ...block, drop: { items: 0, floor: 'rare', goldMin: 0, goldMax: 0 } }))).monsters.get('unfinished_colossus'), 'unfinished_colossus').boss?.drop.items, 0);
});

void test('contentProblems reports a boss that names an unknown skill, rarity or line, or a line that is not its own', (): void => {
  assert.ok(has(bossy((block) => ({ ...block, phases: [{ below: 1, skills: [{ skill: 'no_such_skill', weight: 1 }], barks: [] }] })), 'boss unfinished_colossus uses unknown skill no_such_skill'));
  assert.ok(has(bossy((block) => ({ ...block, drop: { items: 1, floor: 'mythic', goldMin: 0, goldMax: 0 } })), 'boss unfinished_colossus drops unknown rarity mythic'));
  assert.ok(has(bossy((block) => ({ ...block, barks: { aggro: ['no_such_line'], death: [] } })), 'boss unfinished_colossus barks unknown line no_such_line'));
  assert.ok(has(bossy((block) => ({ ...block, barks: { aggro: ['unfinished_borrower_said_1'], death: [] } })), 'boss unfinished_colossus barks line unfinished_borrower_said_1, which is spoken by unfinished_borrower'));
  assert.ok(has({ ...shipped, lines: [...lines, { id: 'ghost_1', speaker: 'ghost', text: 'Boo.' }] }, 'line ghost_1 has unknown speaker ghost'));
});

void test('a prop placed with a condition is data only, and one that blocks the way is reported', (): void => {
  const lit = { type: 'objective', quest: 'out_of_the_mist', objective: 'leave', is: 'done' };
  const placed = (prop: string): RawContent => ({ ...shipped, zones: zones({ ...waystation, props: [...waystation.props, { prop, x: 26, z: 30, y: 0, rotationDegrees: 0, when: [lit] }] }, shallows) });
  const content: Content = parseContent(placed('candles'));
  assert.deepEqual(contentProblems(content), []);
  assert.deepEqual(must(content.zones.get('waystation'), 'town').props.at(-1), { prop: 'candles', x: 26, z: 30, y: 0, rotationDegrees: 0, when: [{ ...lit, not: false }] });
  assert.ok(has(placed('castle_pillar'), 'zone waystation places prop castle_pillar with a condition, but it blocks the way'));
  assert.ok(has(placed('no_such_prop'), 'zone waystation places unknown prop no_such_prop'));
});

function town(change: object): RawContent {
  return { ...shipped, zones: zones({ ...waystation, ...change }, shallows) };
}

void test('surfaces parse, and a floor, an outside or a prop dressed in an unknown surface is reported', (): void => {
  const content: Content = parseContent(shipped);
  const cobble = must(content.surfaces.get('cobble'), 'cobble');
  assert.equal(cobble.color, 'textures/cobble_color.webp');
  assert.ok(cobble.metres > 0);
  assert.equal(must(content.props.get('castle_wall_a'), 'wall').surfaces['stone'], 'castle_wall');
  assert.ok(has(town({ floors: { ...waystation.floors, '.': 'no_such_surface' } }), 'zone waystation floor uses unknown surface no_such_surface'));
  assert.ok(has(town({ outside: { surface: 'no_such_surface', reach: 2 } }), 'zone waystation outside uses unknown surface no_such_surface') && has(town({ terrain: { rise: 1, groundStep: 0.6, levels: waystation.tiles.map((line: string): string => '0'.repeat(line.length)), cliff: 'no_such_surface', rough: null, blends: [], cliffs: [] } }), 'zone waystation cliff uses unknown surface no_such_surface'));
  const odd = { id: 'odd_torch', model: 'models/world/torch.glb', scale: 1, blockRadius: 0, light: null, surfaces: { wood: 'no_such_surface' } };
  assert.ok(has({ ...shipped, props: [...propDefs, odd] }, 'prop odd_torch dresses wood in unknown surface no_such_surface'));
  assert.throws((): Content => parseContent({ ...shipped, surfaces: [{ ...cobble, metres: 0 }] }), ContentError);
});

void test('a prop may carry a tint colour, and a malformed one is rejected', (): void => {
  const plain = { id: 'plain_rock', model: 'models/props/rock_set_1.glb', scale: 1, blockRadius: 0, light: null, surfaces: {} };
  const parsed: Content = parseContent({ ...shipped, props: [...propDefs, plain, { ...plain, id: 'dark_rock', tint: '#4a4f58' }] });
  assert.equal(must(parsed.props.get('plain_rock'), 'plain').tint, null);
  assert.equal(must(parsed.props.get('dark_rock'), 'dark').tint, '#4a4f58');
  assert.throws((): Content => parseContent({ ...shipped, props: [...propDefs, { ...plain, tint: 'dark' }] }), /tint/);
});

void test('a prop collider with a length but no radius is rejected, since it would block nothing', (): void => {
  const wall = { id: 'thin_wall', model: 'models/props/rock_set_1.glb', scale: 1, blockRadius: 0, blockLength: 4, light: null, surfaces: {} };
  assert.throws((): Content => parseContent({ ...shipped, props: [...propDefs, wall] }), /needs a radius above zero/);
  assert.throws((): Content => parseContent({ ...shipped, props: [...propDefs, { ...wall, blockRadius: -1, blockLength: 0 }] }), /cannot be negative/);
  const parsed: Content = parseContent({ ...shipped, props: [...propDefs, { ...wall, blockRadius: 0.3 }] });
  assert.equal(must(parsed.props.get('thin_wall'), 'wall').blockLength, 4);
});

void test('a combo is data: its steps parse, and a combo without steps or with a wrong field is rejected', (): void => {
  const step = { animation: 'attack', windup: 0.2, recovery: 0.2, damageScale: 1.5, areaScale: 1.1, knockbackScale: 2, stagger: 0.4, shake: 0.3, hitStop: 0.05 };
  const parsed: Content = parseContent({ ...shipped, skills: [...skills, { ...extraSkill, combo: { window: 0.5, steps: [step] } }] });
  assert.deepEqual(must(parsed.skills.get('ember_lash'), 'skill').combo, { window: 0.5, steps: [step] });
  assert.equal(must(parseContent(extended()).skills.get('ember_lash'), 'skill').combo, null);
  assert.throws((): Content => parseContent({ ...shipped, skills: [...skills, { ...extraSkill, combo: { window: 0.5, steps: [] } }] }), /combo\.steps: a combo needs at least one step/);
  assert.throws((): Content => parseContent({ ...shipped, skills: [...skills, { ...extraSkill, combo: { window: 0, steps: [step] } }] }), /combo\.window/);
  assert.throws((): Content => parseContent({ ...shipped, skills: [...skills, { ...extraSkill, combo: { window: 0.5, steps: [{ ...step, damageScale: 'big' }] } }] }), /steps\[0\]\.damageScale/);
});

void test('a rig may name unarmed clips for when it holds nothing, and they are checked like its other actions', (): void => {
  const [first] = rigs;
  const rig = must(first, 'first rig');
  const parsed: Content = parseContent(shipped);
  const hero = must(parsed.rigs.get(parsed.player.hero.rig), 'hero rig');
  const bare = must(hero.clips.unarmed, 'hero unarmed clips');
  assert.ok(must(bare.actions['attack'], 'unarmed attack').impactFraction > 0);
  const plain: Content = parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, unarmed: null } }] });
  assert.equal(must(plain.rigs.get(rig.id), 'plain rig').clips.unarmed, null);
  const late = { idle: 'Idle_Loop', actions: { attack: { clip: 'Punch_Jab', impactFraction: 1 } } };
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, unarmed: late } }] }), /unarmed\.actions\.attack\.impactFraction/);
});

void test('a rig may name stances for what it holds, and an attachment names the stance it is held in', (): void => {
  const parsed: Content = parseContent(shipped);
  const hero = must(parsed.rigs.get(parsed.player.hero.rig), 'hero rig');
  const held = must(parsed.attachments.get('hand_crossbow'), 'crossbow attachment');
  assert.ok(must(hero.clips.stances[must(held.stance, 'stance')], 'hero stance').actions['shoot'] !== undefined);
  assert.equal(must(parsed.attachments.get('rusted_blade'), 'blade').stance, null);
  const bare: unknown[] = [];
  for (const stanced of rigs) bare.push({ ...stanced, clips: { ...stanced.clips, stances: {} } });
  assert.ok(contentProblems(parseContent({ ...shipped, rigs: bare })).some((found: string): boolean => /attachment hand_crossbow is held in stance crossbow, which no rig has/.test(found)));
  const late = { crossbow: { idle: 'Pistol_Idle_Loop', actions: { shoot: { clip: 'Pistol_Shoot', impactFraction: 1 } } } };
  const rig = must(rigs[0], 'first rig');
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, stances: late } }] }), /stances\.crossbow\.actions\.shoot\.impactFraction/);
});

void test('a rig may leave out its hit and death clips, names its action clips, and a skill whose clip the rig lacks is reported', (): void => {
  const [first] = rigs;
  const rig = must(first, 'first rig');
  const parsed: Content = parseContent(shipped);
  const hero = must(parsed.rigs.get(parsed.player.hero.rig), 'hero rig');
  assert.ok(hero.clips.death.length >= 2);
  assert.ok(hero.gaits.length >= 2 && hero.gaits.every((gait): boolean => gait.groundSpeed > 0));
  assert.ok(must(hero.clips.actions['attack'], 'attack clip').impactFraction > 0);
  const still = must(parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, death: [], hit: [] } }] }).rigs.get(rig.id), 'rig with no hit or death clips');
  assert.deepEqual([still.clips.hit, still.clips.death], [[], []]);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, actions: { attack: { clip: 'Sword_Attack', impactFraction: 1 } } } }] }), /impactFraction/);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, gaits: [{ clip: 'Walk_Loop', groundSpeed: 0 }] }] }), /groundSpeed/);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, gaits: [] }] }), /gaits: a rig needs at least one gait/);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, gaits: [{ clip: 'Jog_Fwd_Loop', groundSpeed: 7 }, { clip: 'Walk_Loop', groundSpeed: 1 }] }] }), /gaits run from the slowest to the fastest/);
  const lost: string[] = contentProblems(parseContent({ ...shipped, skills: [...skills, { ...extraSkill, animation: 'pirouette' }], monsters: [...monsters, { ...extraMonster, gear: [], wear: [] }] }));
  assert.ok(lost.includes('monster ash_wraith uses skill ember_lash, but rig human_man has no action clip pirouette'));
  const step = { animation: 'backflip', windup: 0.2, recovery: 0.2, damageScale: 1, areaScale: 1, knockbackScale: 1, stagger: 0, shake: 0, hitStop: 0 };
  const cleave: unknown = skills.find((entry: { readonly id: string }): boolean => entry.id === 'cleave');
  const rest: unknown[] = skills.filter((entry: { readonly id: string }): boolean => entry.id !== 'cleave');
  const chained: string[] = contentProblems(parseContent({ ...shipped, skills: [...rest, Object.assign({}, cleave, { combo: { window: 0.5, steps: [step] } })] }));
  assert.ok(chained.includes('skill book uses skill cleave, but rig hero_man has no action clip backflip'));
});

void test('a skill effect with no cue or light gets no cue and full light, and a negative light is rejected', (): void => {
  const plain: Content = parseContent({ ...shipped, skills: [...skills, extraSkill] });
  assert.deepEqual(must(plain.skills.get('ember_lash'), 'skill').vfx, { style: 'slash', color: '#ff8844', cue: 'none', light: 1, lightning: null, impact: null, trail: 0, linger: 0, gather: null, wave: null, punch: null, burn: null, shadow: null, water: null, cover: null });
  const blinding: RawContent = { ...shipped, skills: [{ ...extraSkill, vfx: { style: 'slash', color: '#ff8844', light: -1 } }] };
  assert.throws((): Content => parseContent(blinding), (error: unknown): boolean => problem(error, 'skills[0].vfx'));
});

void test('a skill hits for physical damage unless its data names storm or frost, and an unknown type is refused', (): void => {
  const content: Content = parseContent(shipped);
  assert.equal(must(content.skills.get('cleave'), 'cleave').damage.type, 'physical');
  assert.equal(must(content.skills.get('rival_bolt'), 'rival_bolt').damage.type, 'storm');
  assert.equal(must(content.skills.get('still_grasp'), 'still_grasp').damage.type, 'frost');
  const first = must(skills[0], 'skill');
  const broken: RawContent = { ...shipped, skills: [{ ...first, damage: { ...first.damage, type: 'hush' } }] };
  assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, 'skills[0].damage.type'));
});

void test('a zone with no storm tier is tier 0, and the hero resists up to a cap from data', (): void => {
  const content: Content = parseContent(shipped);
  assert.ok([...content.zones.values()].every((zone): boolean => zone.stormTier === 0));
  assert.deepEqual(content.player.resistance, { armourCap: 0.75, cap: 0.75, floor: -1, tierPenalty: 0.2 });
  const broken: RawContent = { ...shipped, player: { ...player, resistance: { armourCap: 0.75, cap: 0.75, floor: 0.5, tierPenalty: 0.2 } } };
  assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, 'player.resistance.floor'));
});

void test('a wearable keeps all the wake light unless its data gives it a share, and the share is checked', (): void => {
  const plain: Content = parseContent({ ...shipped, wearables: [...wearables, extraWearable] });
  assert.equal(must(plain.wearables.get('ash_shroud'), 'ash_shroud').wakeLamps, 1);
  const shy: Content = parseContent({ ...shipped, wearables: [...wearables, { ...extraWearable, wakeLamps: 0.45 }] });
  assert.equal(must(shy.wearables.get('ash_shroud'), 'ash_shroud').wakeLamps, 0.45);
  assert.throws((): Content => parseContent({ ...shipped, wearables: [...wearables, { ...extraWearable, wakeLamps: 1.5 }] }), (error: unknown): boolean => problem(error, 'wakeLamps'));
  assert.deepEqual(must(plain.wearables.get('ash_shroud'), 'ash_shroud').iconWith, []);
  const shown: Content = parseContent({ ...shipped, wearables: [...wearables, { ...extraWearable, iconWith: ['Ranger_Arms'] }] });
  assert.deepEqual(must(shown.wearables.get('ash_shroud'), 'ash_shroud').iconWith, ['Ranger_Arms']);
});
