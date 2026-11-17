import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { familyPieces, powerRuleProblems } from './power-rules.ts';
import type { Content, ItemBaseDef, PowerDef, SkillTreeNodeDef } from './types.ts';

const content: Content = loadContent();

void test('the shipped powers check out, and each alpha family has three pieces, and every build has a Legendary of its own', (): void => {
  assert.deepEqual(powerRuleProblems(content), []);
  assert.deepEqual(familyPieces(content, 'forkweather').map((base: ItemBaseDef): string => base.id), ['wirethread_gloves', 'lantern_of_second_sounds', 'crown_of_the_struck_hour']);
  assert.deepEqual(familyPieces(content, 'millwheel').map((base: ItemBaseDef): string => base.id), ['the_millwheel', 'grinders_bracers', 'gyre_stitched_breeches']);
  assert.deepEqual(familyPieces(content, 'groundbreaker').map((base: ItemBaseDef): string => base.id), ['groundbreaker', 'bellwether_helm', 'anvilback_hauberk']);
  assert.deepEqual(familyPieces(content, 'quietshot').map((base: ItemBaseDef): string => base.id), ['quietshot', 'nightjar_gloves', 'longsight_coat']);
  for (const [family, piece] of [['rainmaker', 'rainmaker'], ['mist_treader', 'mist_treader_boots']] as const) {
    assert.deepEqual(familyPieces(content, family).map((base: ItemBaseDef): string => base.id), [piece]);
  }
});

void test('a power naming things that do not exist is reported', (): void => {
  const gloves: ItemBaseDef = must(content.itemBases.get('wirethread_gloves'), 'gloves');
  const power: PowerDef = {
    family: 'nowhere',
    text: '',
    skillMods: [{ target: { type: 'group', group: 'missing' }, field: 'chains', value: 1 }],
    variants: [{ skill: 'cleave', becomes: 'no_such_form' }],
    triggers: [
      { on: 'pulse', skill: null, target: 'any', every: 2.5, cooldown: 0, effect: { type: 'cast', skill: 'no_such_skill', at: 'caster' } },
      { on: 'hit', skill: { type: 'skill', skill: 'ghost' }, target: 'any', every: 1, cooldown: 0, effect: { type: 'buff', stat: 'armour', op: 'add', value: 1, duration: 1, stacks: 1.5 } },
    ],
  };
  const broken: Content = { ...content, itemBases: new Map<string, ItemBaseDef>([...content.itemBases, ['odd', { ...gloves, id: 'odd', slot: null, power }]]) };
  const problems: string[] = powerRuleProblems(broken);
  for (const expected of ['unknown family nowhere', 'unknown skill group missing', 'unknown skill no_such_form', 'pulses without naming', 'every 2.5', 'casts unknown skill no_such_skill', 'unknown skill ghost', 'stacks 1.5', 'no slot']) {
    assert.ok(problems.some((problem: string): boolean => problem.includes(expected)), expected);
  }
  const lonely: Content = { ...content, families: new Map([...content.families, ['empty', { id: 'empty', name: 'Empty' }]]) };
  assert.ok(powerRuleProblems(lonely).some((problem: string): boolean => problem.includes('family empty has no pieces')));
  const unnamed: Content = { ...content, rarities: content.rarities.filter((rarity): boolean => !rarity.powers) };
  assert.ok(powerRuleProblems(unnamed).some((problem: string): boolean => problem.includes('no rarity carries powers')));
});

void test('a tree place whose trigger names a skill that does not exist, or empowers nothing, is reported', (): void => {
  const first = must(content.skillTree[0], 'place');
  const odd: SkillTreeNodeDef = { ...first, id: 'odd_place', triggers: [
    { on: 'use', skill: { type: 'skill', skill: 'no_such_roll' }, target: 'any', every: 1, cooldown: 0, effect: { type: 'empower', skillMods: [], duration: 2, look: null } },
    { on: 'use', skill: null, target: 'any', every: 1, cooldown: 0, effect: { type: 'empower', skillMods: [{ target: { type: 'group', group: 'no_such_group' }, field: 'pierce', value: 1 }], duration: 2, look: null } },
    { on: 'hit', skill: null, target: 'any', every: 4, cooldown: 0.5, effect: { type: 'flask', charges: 1.5 } },
  ] };
  const problems: string[] = powerRuleProblems({ ...content, skillTree: [...content.skillTree, odd] });
  for (const expected of ['tree node odd_place names unknown skill no_such_roll', 'tree node odd_place empowers nothing', 'tree node odd_place names unknown skill group no_such_group', 'tree node odd_place gives 1.5 flask charges']) {
    assert.ok(problems.some((problem: string): boolean => problem.includes(expected)), expected);
  }
});
