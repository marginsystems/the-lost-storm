import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { ObjectiveDef, QuestDef, ZoneDef } from '../../sim/content/types.ts';
import type { ObjectiveTarget, ObjectiveTargetKind } from '../../sim/world/objective.ts';
import { must } from '../../test/support.ts';
import { glowsAt } from './objective-glow.ts';

const content = loadContent();
const quest: QuestDef = must([...content.quests.values()][0], 'a quest');
const objective: ObjectiveDef = must(quest.objectives[0], 'an objective');
const zone: ZoneDef = must(content.zones.get('hideout'), 'hideout');

function targetOf(kind: ObjectiveTargetKind): ObjectiveTarget {
  return { kind, pos: { x: 1.6, z: 20 }, radius: 2.2, quest, objective, zone, name: 'The Hall of Time' };
}

void test('the objective lays its warm glow on a person, a monster or a spot, but not on an exit, whose own blue light would turn milky under it', (): void => {
  assert.equal(glowsAt(targetOf('exit')), false);
  assert.equal(glowsAt(targetOf('person')), true);
  assert.equal(glowsAt(targetOf('monster')), true);
  assert.equal(glowsAt(targetOf('spot')), true);
  assert.equal(glowsAt(null), false);
});
