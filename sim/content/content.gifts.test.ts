import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { contentProblems } from './parse.ts';
import { objectivePaths } from './road.ts';
import type { Content, ObjectiveDef, ObjectiveGift, QuestDef } from './types.ts';

const content: Content = loadContent();

void test('every quest gift names a rarity the game has', (): void => {
  const rarities: Set<string> = new Set<string>(content.rarities.map((rarity): string => rarity.id));
  const gifts: { readonly where: string; readonly gift: ObjectiveGift }[] = [];
  for (const quest of content.quests.values()) {
    for (const objective of quest.objectives) {
      for (const step of [objective, ...(objective.type === 'either' ? objectivePaths(objective) : [])]) {
        if (step.gift !== null) gifts.push({ where: `${quest.id}.${step.id}`, gift: step.gift });
      }
    }
  }
  assert.ok(gifts.length > 0);
  for (const { where, gift } of gifts) assert.ok(rarities.has(gift.rarity), `${where} gives unknown rarity ${gift.rarity}`);
});

void test('a quest gift of an unknown rarity is a content problem', (): void => {
  const reeve: QuestDef = must(content.quests.get('the_untouched'), 'the restraint quest');
  const objectives: ObjectiveDef[] = reeve.objectives.map((objective: ObjectiveDef): ObjectiveDef => (objective.gift === null ? objective : { ...objective, gift: { rarity: 'no_such_rarity', items: 1 } }));
  const quests: Map<string, QuestDef> = new Map<string, QuestDef>(content.quests);
  quests.set(reeve.id, { ...reeve, objectives });
  assert.ok(contentProblems({ ...content, quests }).includes('quest the_untouched objective speak gives unknown rarity no_such_rarity'));
  assert.deepEqual(contentProblems(content).filter((problem: string): boolean => problem.includes('gives unknown rarity')), []);
});
