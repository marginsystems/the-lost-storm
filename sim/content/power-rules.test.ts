import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { familyPieces, powerRuleProblems } from './power-rules.ts';
import type { Content, ItemBaseDef, PowerDef } from './types.ts';

const content: Content = loadContent();

void test('the shipped powers check out, and each alpha family has three pieces', (): void => {
  assert.deepEqual(powerRuleProblems(content), []);
  assert.deepEqual(familyPieces(content, 'forkweather').map((base: ItemBaseDef): string => base.id), ['wirethread_gloves', 'lantern_of_second_sounds', 'crown_of_the_struck_hour']);
  assert.deepEqual(familyPieces(content, 'millwheel').map((base: ItemBaseDef): string => base.id), ['the_millwheel', 'grinders_bracers', 'gyre_stitched_breeches']);
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
