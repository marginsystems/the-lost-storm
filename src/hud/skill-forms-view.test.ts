import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillDef } from '../../sim/content/types.ts';
import { FORMS_WORDS, formFamilies, formRows, pressLine } from './skill-forms-view.ts';

const content: Content = loadContent();

function skill(id: string): SkillDef {
  const found: SkillDef | undefined = content.skills.get(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
}

void test('a held skill says how to hold it, in its own words when the data gives them', (): void => {
  assert.equal(pressLine(skill('cleave_millwheel').press), 'Hold to keep turning; you can run while it turns');
  assert.equal(pressLine(null), null);
  assert.equal(pressLine({ type: 'channel', interval: 0.2, max: 3, move: 0, passThrough: false, hint: null }), FORMS_WORDS.channel);
  assert.equal(pressLine({ type: 'channel', interval: 0.2, max: 3, move: 1, passThrough: false, hint: null }), FORMS_WORDS.channelMoving);
  assert.equal(pressLine({ type: 'charge', max: 1.5, damageScale: 2, areaScale: 1, hint: null }), 'Hold to charge, up to 1.5s, then let go');
});

void test('Cleave lists what each weapon family makes of it and marks the one in hand', (): void => {
  const rows = formRows(content, 'cleave', 'crossbow');
  assert.deepEqual(rows.map((row): string => row.text), [
    'Any weapon: Whirling Cleave or Heaving Cleave, then Millwheel or Firewheel',
    'Crossbow: Quarrel, then Fanned Quarrel or Heavy Quarrel',
    'Staff: Spell Strike',
  ]);
  assert.deepEqual(rows.filter((row): boolean => row.held).map((row): string | undefined => row.family?.id), ['crossbow']);
  assert.deepEqual(formFamilies(content, 'cleave').map((group): string => group.id), ['crossbow', 'staff']);
  assert.deepEqual(formFamilies(content, 'fire_burst'), []);
});
