import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { actOf } from './atlas.ts';
import { loadContent } from './content.ts';
import type { ActDef, Content, MapPlace } from './types.ts';

const content: Content = loadContent();

void test('the second act follows the first and keeps its own map', (): void => {
  assert.deepEqual(
    content.world.acts.map((act: ActDef): string => act.id),
    ['act_1', 'act_2'],
  );
  const second: ActDef = must(content.world.acts[1], 'second act');
  assert.equal(second.title, 'Act II');
  assert.ok(second.atlas.width > 0 && second.atlas.height > 0);
});

const ACT_ONE_ZONES: readonly string[] = ['between', 'hall_of_time', 'hideout', 'keepers_gate', 'under_hall', 'under_hall_2', 'under_hall_3', 'lava_depths', 'lava_depths_2', 'lava_depths_3', 'ledger_hall', 'ledger_hall_2', 'ledger_hall_3', 'ledger_court'];

void test('every zone of the first act stays on the first act map and on no other', (): void => {
  const first: ActDef = must(content.world.acts[0], 'first act');
  assert.deepEqual(first.atlas.places.map((place: MapPlace): string => place.zone).toSorted(), [...ACT_ONE_ZONES].toSorted());
  for (const zone of ACT_ONE_ZONES) {
    const holders: string[] = content.world.acts.filter((act: ActDef): boolean => act.atlas.places.some((place: MapPlace): boolean => place.zone === zone)).map((act: ActDef): string => act.id);
    assert.deepEqual(holders, ['act_1'], zone);
    assert.equal(actOf(content, zone), first);
  }
});
