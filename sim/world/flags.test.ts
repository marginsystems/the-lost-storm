import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActDef, Content } from '../content/types.ts';
import { ROAD_CONTENT, roadWorld, roadZone } from '../../test/road-support.ts';
import { writeFlags } from './flags.ts';
import type { World, WorldEvent } from './types.ts';

function endingWorld(): World {
  const acts: ActDef[] = ROAD_CONTENT.world.acts.map((act: ActDef): ActDef => ({ ...act, end: { when: [{ type: 'flag', flag: 'doors', is: 'open', not: false }], line: 'The doors open.' } }));
  const extra: Partial<Content> = { world: { ...ROAD_CONTENT.world, acts } };
  return roadWorld(roadZone({}), extra);
}

void test('setting the flag an act ends on reports the end once', (): void => {
  const world: World = endingWorld();
  assert.equal(writeFlags(world, { doors: 'shut' }), true);
  assert.equal(world.events.some((event: WorldEvent): boolean => event.type === 'act_ended'), false);
  writeFlags(world, { doors: 'open' });
  assert.equal(world.events.filter((event: WorldEvent): boolean => event.type === 'act_ended').length, 1);
  assert.equal(writeFlags(world, { doors: 'open' }), false);
  assert.equal(world.events.filter((event: WorldEvent): boolean => event.type === 'act_ended').length, 1);
});
