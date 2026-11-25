import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Content, QuestDef, ZoneDef } from './types.ts';
import { roadContent, roadZone, ROAD_CONTENT } from '../../test/road-support.ts';
import { storyFlagNames } from './story.ts';
import { bossPackProblems, conditionProblems, roadProblems } from './road.ts';

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
    objectives: [{ id: 'o', type: 'either', text: 'O', waiting: '', when: [], sets: {}, gift: null, paths: [
      { id: 'a', type: 'talk', npc: 'nobody', talk: null, text: 'A', waiting: '', when: [], sets: {}, gift: null },
      { id: 'b', type: 'reach', zone: 'road_test', x: 1, z: 1, radius: 1, text: 'B', waiting: '', when: [{ type: 'flag', flag: 'missing', is: null, not: false }], sets: {}, gift: null },
    ] }],
  };
  const problems: string[] = problemsOf(zone, { quests: new Map<string, QuestDef>([...ROAD_CONTENT.quests, [quest.id, quest]]) });
  assert.ok(problems.some((problem: string): boolean => problem.includes('unknown npc nobody')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('flag missing')));
  assert.equal(problems.some((problem: string): boolean => problem.includes('flag found')), false);
});

void test('two drifts may not share a cell', (): void => {
  const drift = { id: 'a', column: 4, row: 0, columns: 2, rows: 2, period: 10, open: 0.5, offset: 0, fade: 1 } as const;
  const problems: string[] = problemsOf(roadZone({ drifts: [drift, { ...drift, id: 'b', column: 5, offset: 5 }] }));
  assert.ok(problems.some((problem: string): boolean => problem.includes('drifts a and b overlap')));
});

void test('a talk objective may name the one talk that answers it, and naming a talk its person does not have is a problem', (): void => {
  const npc: string = [...ROAD_CONTENT.npcs.keys()][0] ?? '';
  const talk: string = ROAD_CONTENT.npcs.get(npc)?.talks[0]?.id ?? '';
  const quest = (named: string): QuestDef => ({ id: 'q', name: 'Q', requires: [], when: [], objectives: [{ id: 'o', type: 'talk', npc, talk: named, text: 'O', waiting: '', when: [], sets: {}, gift: null }] });
  const problemsWith = (named: string): string[] => problemsOf(roadZone({}), { quests: new Map<string, QuestDef>([...ROAD_CONTENT.quests, ['q', quest(named)]]) });
  assert.notEqual(talk, '');
  assert.equal(problemsWith(talk).some((problem: string): boolean => problem.includes('names talk')), false);
  assert.ok(problemsWith('no_such_talk').some((problem: string): boolean => problem.includes(`names talk no_such_talk, which ${npc} does not have`)));
});

void test('a defeated condition must name a monster whose defeat is recorded, and a boss with a recorded defeat is placed only until then', (): void => {
  const flags: ReadonlySet<string> = storyFlagNames(ROAD_CONTENT);
  assert.deepEqual(conditionProblems(ROAD_CONTENT, flags, 'pack', [{ type: 'defeated', monster: 'timekeeper_gatekeeper', not: true }]), []);
  assert.deepEqual(conditionProblems(ROAD_CONTENT, flags, 'pack', [{ type: 'defeated', monster: 'nobody', not: true }]), ['pack names unknown monster nobody']);
  const plain: string = [...ROAD_CONTENT.monsters.values()].find((def): boolean => def.boss === null)?.id ?? '';
  assert.deepEqual(conditionProblems(ROAD_CONTENT, flags, 'pack', [{ type: 'defeated', monster: plain, not: true }]), [`pack names ${plain}, whose defeat nothing records`]);
  assert.deepEqual(bossPackProblems(ROAD_CONTENT), []);
  const members = [{ monster: 'timekeeper_gatekeeper', count: 1, mods: [] }];
  const standing: Content = roadContent(roadZone({ packs: [{ x: 4, z: 4, members, when: [] }] }));
  assert.deepEqual(bossPackProblems(standing), ['zone road_test places boss timekeeper_gatekeeper without a defeated condition, so it would stand again after its defeat']);
  const beaten: Content = roadContent(roadZone({ packs: [{ x: 4, z: 4, members, when: [{ type: 'defeated', monster: 'timekeeper_gatekeeper', not: true }] }] }));
  assert.deepEqual(bossPackProblems(beaten), []);
});
