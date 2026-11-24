import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import type { SkillForms } from './skill-forms.ts';
import { formsText, skillForms } from './skill-forms.ts';

const content: Content = loadContent();

function lines(skill: string): string[] {
  return skillForms(content, skill).map((forms: SkillForms): string => `${forms.family ?? 'any'}: ${formsText(content, forms)}`);
}

void test('Cleave turns into the tree\'s forms with any weapon, into Quarrel with a crossbow and Spell Strike with a staff', (): void => {
  assert.deepEqual(lines('cleave'), [
    'any: Whirling Cleave or Heaving Cleave, then Millwheel or Firewheel',
    'crossbow: Quarrel, then Fanned Quarrel or Heavy Quarrel',
    'staff: Spell Strike',
  ]);
});

void test('a family is listed only where its forms differ from what any weapon gives', (): void => {
  assert.deepEqual(lines('storm_bolt'), ['any: Storm Lance or Twice-Told Bolt']);
  assert.deepEqual(lines('thunderhead'), ['any: Thunder Leap']);
  assert.deepEqual(lines('fire_burst'), []);
});
