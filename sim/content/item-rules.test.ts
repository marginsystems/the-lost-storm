import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { itemProblems, linesFor } from './item-rules.ts';
import type { AffixDef, Content, ItemBaseDef } from './types.ts';
import { ITEM_STATS } from './types.ts';

const content: Content = loadContent();

void test('the shipped items roll only the nine item stats and every rarity fits every slot', (): void => {
  assert.deepEqual(itemProblems(content), []);
  for (const affix of content.affixes.values()) assert.ok(ITEM_STATS.includes(affix.stat), affix.id);
  assert.ok(linesFor(content, 'feet').some((line: AffixDef): boolean => line.stat === 'moveSpeed'));
  assert.ok(!linesFor(content, 'weapon').some((line: AffixDef): boolean => line.stat === 'stormResist'));
});

void test('a base with a stat outside the nine, a line that rolls backwards or a rarity a slot cannot fill is reported', (): void => {
  const blade: ItemBaseDef | undefined = content.itemBases.get('rusted_blade');
  assert.ok(blade !== undefined);
  const odd: ItemBaseDef = { ...blade, implicit: [{ stat: 'goldFind', op: 'add', value: 1 }] };
  const backwards: AffixDef = { id: 'backwards', label: 'Odd', slots: ['charm'], stat: 'maxLife', op: 'add', min: 9, max: 2, perLevel: 0 };
  const broken: Content = {
    ...content,
    itemBases: new Map<string, ItemBaseDef>([...content.itemBases, [odd.id, odd]]),
    affixes: new Map<string, AffixDef>([...content.affixes, [backwards.id, backwards]]),
    rarities: [...content.rarities, { id: 'huge', name: 'Huge', color: '#ffffff', marker: 'none', weight: 1, affixMin: 9, affixMax: 9 }],
  };
  const problems: string[] = itemProblems(broken);
  assert.ok(problems.some((problem: string): boolean => problem.includes('rusted_blade has goldFind')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('line backwards')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('rarity huge wants 9 lines but a weapon')));
});
