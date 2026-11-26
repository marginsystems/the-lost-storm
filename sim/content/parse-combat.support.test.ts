import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import { combatProblems, reviveDelivery } from './parse-combat.ts';
import type { BossDef, BossPhase, Content, MonsterDef } from './types.ts';

function withLoomSupports(supports: readonly (string | null)[]): Content {
  const loom: MonsterDef = must(ARENA_CONTENT.monsters.get('the_loom'), 'the Loom');
  const boss: BossDef = must(loom.boss, 'the Loom boss');
  const phases: BossPhase[] = boss.phases.map((phase: BossPhase, at: number): BossPhase => ({ ...phase, support: supports[at] ?? null }));
  return { ...ARENA_CONTENT, monsters: new Map<string, MonsterDef>([...ARENA_CONTENT.monsters, [loom.id, { ...loom, boss: { ...boss, phases } }]]) };
}

void test('a boss phase supports only with a known skill that raises or mends allies', (): void => {
  assert.deepEqual(combatProblems(ARENA_CONTENT), []);
  const problems: string[] = combatProblems(withLoomSupports([null, 'loom_sow', 'loom_needles']));
  assert.ok(problems.includes('monster the_loom supports with unknown skill loom_sow'), problems.join('; '));
  assert.ok(problems.includes('monster the_loom supports with skill loom_needles, which neither raises nor mends allies'), problems.join('; '));
});

void test('a revive raises its own kind for free unless it says otherwise, and never costs the whole caster', (): void => {
  assert.deepEqual(reviveDelivery({ range: 9, count: 1, lifeShare: 0.6 }, 'r'), { type: 'revive', range: 9, count: 1, lifeShare: 0.6, raises: 'kin', cost: 0 });
  assert.deepEqual(reviveDelivery({ range: 11, count: 2, lifeShare: 0.6, raises: 'any', cost: 0.15 }, 'r'), { type: 'revive', range: 11, count: 2, lifeShare: 0.6, raises: 'any', cost: 0.15 });
  assert.throws(() => reviveDelivery({ range: 9, count: 1, lifeShare: 0.6, raises: 'some' }, 'r'), /raises/);
  assert.throws(() => reviveDelivery({ range: 9, count: 4, lifeShare: 0.6, cost: 0.25 }, 'r'), /some life/);
});
