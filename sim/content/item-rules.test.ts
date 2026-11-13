import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { basesWithoutLook, groundGenerics, handedBases, heroWears, itemProblems, linesFor } from './item-rules.ts';
import type { AffixDef, Content, ItemBaseDef } from './types.ts';
import { ITEM_STATS } from './types.ts';
import { must } from '../../test/support.ts';

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
    rarities: [...content.rarities, { id: 'huge', name: 'Huge', color: '#ffffff', marker: 'none', weight: 1, affixMin: 9, affixMax: 9, powers: false, wornLimit: null }],
  };
  const problems: string[] = itemProblems(broken);
  assert.ok(problems.some((problem: string): boolean => problem.includes('rusted_blade has goldFind')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('line backwards')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('rarity huge wants 9 lines but a weapon')));
});

void test('every wearable base lies on the ground as a real model except the ones listed here, which still use a generic bundle or pouch', (): void => {
  assert.deepEqual(groundGenerics(content), ['gale_charm', 'ember_charm', 'lantern_of_second_sounds']);
  const blade: ItemBaseDef | undefined = content.itemBases.get('rusted_blade');
  assert.ok(blade !== undefined);
  const unheld: ItemBaseDef = { ...blade, visual: null };
  const unworn: ItemBaseDef = { ...blade, id: 'bare', wear: [], ground: { ...blade.ground, model: 'worn' } };
  const broken: Content = { ...content, itemBases: new Map<string, ItemBaseDef>([...content.itemBases, [unheld.id, unheld], [unworn.id, unworn]]) };
  const problems: string[] = itemProblems(broken);
  assert.ok(problems.some((problem: string): boolean => problem.includes('rusted_blade lies on the ground as its held model')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('bare lies on the ground as its worn model')));
});

void test('every base that can be worn or held has a look, so the hero wears exactly what is equipped', (): void => {
  assert.deepEqual(basesWithoutLook(content), []);
  const blade: ItemBaseDef | undefined = content.itemBases.get('rusted_blade');
  const coat: ItemBaseDef | undefined = content.itemBases.get('traveller_coat');
  assert.ok(blade !== undefined && coat !== undefined);
  const bases: Map<string, ItemBaseDef> = new Map<string, ItemBaseDef>([...content.itemBases, ['bare_blade', { ...blade, id: 'bare_blade', visual: null }], ['bare_coat', { ...coat, id: 'bare_coat', wear: [] }]]);
  assert.deepEqual(basesWithoutLook({ ...content, itemBases: bases }), ['bare_blade', 'bare_coat']);
});

void test('a base handed to the player cannot also drop at random, and the first drop names a plain rarity', (): void => {
  const handed: ReadonlySet<string> = handedBases(content);
  assert.ok(handed.has('rusted_blade'));
  assert.ok(handed.has('traveller_coat'));
  for (const id of handed) assert.equal(must(content.itemBases.get(id), id).dropWeight, 0, id);
  const blade: ItemBaseDef = must(content.itemBases.get('rusted_blade'), 'blade');
  const dropping: Content = {
    ...content,
    itemBases: new Map<string, ItemBaseDef>([...content.itemBases, [blade.id, { ...blade, dropWeight: 10 }]]),
    player: { ...content.player, firstDrop: { flag: 'first_drop', rarity: 'stormtouched' } },
  };
  assert.deepEqual(itemProblems(dropping).filter((problem: string): boolean => problem.includes('handed') || problem.includes('first drop')), [
    'item rusted_blade is handed to the player, so it cannot also drop at random',
    'the first drop names stormtouched, which only powered bases carry',
  ]);
});

void test('no base that can reach the hero wears a hood, and a hood that could is reported', (): void => {
  for (const base of content.itemBases.values()) {
    if (base.dropWeight > 0 || handedBases(content).has(base.id)) assert.ok(heroWears(content, base), base.id);
  }
  assert.ok(content.player.neverWears.includes('leather_hood'));
  const hood: ItemBaseDef = must(content.itemBases.get('wayfarer_hood'), 'hood');
  const back: Content = { ...content, itemBases: new Map<string, ItemBaseDef>([...content.itemBases, [hood.id, { ...hood, dropWeight: 6 }]]) };
  assert.ok(itemProblems(back).includes('item wayfarer_hood reaches the hero but wears something he never wears'));
});
