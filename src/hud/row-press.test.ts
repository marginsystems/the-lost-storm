import assert from 'node:assert/strict';
import test from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { must, worldIn } from '../../test/support.ts';
import { stepWorld } from '../../sim/world/step.ts';
import type { NpcState, World } from '../../sim/world/types.ts';
import { rowPress } from './row-press.ts';

void test('a HUD row press opens its panel or picker when no one is talking', (): void => {
  assert.equal(rowPress({ dialogue: null }), null);
});

void test('while a dialogue is open a HUD row press advances it instead of opening a panel or picker', (): void => {
  const world: World = worldIn(loadContent(), 'hideout', 3);
  const guide: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === 'warden_guide'), 'guide');
  world.player.pos.x = guide.pos.x + 1;
  world.player.pos.z = guide.pos.z;
  stepWorld(world, [{ type: 'talk', npcId: guide.id }], 1 / 60);
  for (let step: number = 0; step < 60 && world.dialogue === null; step += 1) stepWorld(world, [], 1 / 60);
  assert.notEqual(world.dialogue, null);
  assert.deepEqual(rowPress(world), { type: 'advance' });
});
