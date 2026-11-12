import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Content, QuestDef, ZoneDef } from './types.ts';
import { roadContent, roadZone, ROAD_CONTENT } from '../../test/road-support.ts';
import { storyFlagNames } from './story.ts';
import { roadProblems } from './road.ts';

function problemsOf(zone: ZoneDef, extra: Partial<Content> = {}): string[] {
  const content: Content = roadContent(zone, extra);
  return roadProblems(content, storyFlagNames(content));
}

void test('the shipped road has no problems', (): void => {
  assert.deepEqual(roadProblems(ROAD_CONTENT, storyFlagNames(ROAD_CONTENT)), []);
});

void test('a drift must lie on floor and must not cover where the hero stands or arrives', (): void => {
  const drift = { id: 'patch', column: 0, row: 0, columns: 1, rows: 1, period: 10, open: 0.5, offset: 0, fade: 1 } as const;
  assert.ok(problemsOf(roadZone({ drifts: [drift] })).some((problem: string): boolean => problem.includes('player start')));
  assert.ok(problemsOf(roadZone({ drifts: [{ ...drift, column: 9 }] })).some((problem: string): boolean => problem.includes('not floor')));
  assert.deepEqual(problemsOf(roadZone({ drifts: [{ ...drift, column: 4 }] })), []);
});

void test('a flag a trigger sets counts as set, and an either path naming something unknown is a problem', (): void => {
  const zone: ZoneDef = roadZone({ triggers: [{ id: 't', x: 1, z: 1, radius: 1, when: [], sets: { found: 'yes' } }] });
  const quest: QuestDef = {
    id: 'q',
    name: 'Q',
    requires: [],
    when: [{ type: 'flag', flag: 'found', is: null, not: false }],
    objectives: [{ id: 'o', type: 'either', text: 'O', when: [], sets: {}, paths: [
      { id: 'a', type: 'talk', npc: 'nobody', text: 'A', when: [], sets: {} },
      { id: 'b', type: 'reach', zone: 'road_test', x: 1, z: 1, radius: 1, text: 'B', when: [{ type: 'flag', flag: 'missing', is: null, not: false }], sets: {} },
    ] }],
  };
  const problems: string[] = problemsOf(zone, { quests: new Map<string, QuestDef>([...ROAD_CONTENT.quests, [quest.id, quest]]) });
  assert.ok(problems.some((problem: string): boolean => problem.includes('unknown npc nobody')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('flag missing')));
  assert.equal(problems.some((problem: string): boolean => problem.includes('flag found')), false);
});
