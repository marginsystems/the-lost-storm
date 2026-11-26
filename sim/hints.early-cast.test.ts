import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import { loadHints } from './content/hints.ts';
import type { HintDef, HintsDef } from './content/hints.ts';
import type { Content } from './content/types.ts';
import { createHintState, HINTS, stepHints } from './hints.ts';
import type { HintChange, HintInput, HintState } from './hints.ts';
import { generateItem } from './items.ts';
import { refreshPlayer } from './world/character.ts';
import { stepWorld } from './world/step.ts';
import type { MonsterState, World, WorldEvent } from './world/types.ts';

void test('firing the starting crossbow during the roll lesson completes the later attack lesson', (): void => {
  const content: Content = loadContent();
  const world: World = worldIn(content, 'hall_of_time', 1);
  world.player.equipped.weapon = must(generateItem(content, world.rng, world.nextItemUid++, 1, 'worn_crossbow', 'common'), 'crossbow');
  world.player.learned.push('dodge_roll');
  world.player.bar[5] = 'dodge_roll';
  refreshPlayer(world);
  const defs: HintsDef = loadHints(content);
  const state: HintState = createHintState(defs.hints.filter((hint: HintDef): boolean => hint.id !== 'attack' && hint.id !== 'roll').map((hint: HintDef): string => hint.id));
  const idle: HintInput = { enabled: true, open: new Set(), events: [] };
  const monster: MonsterState = must(world.monsters[0], 'Hall monster');
  world.monsters = [];
  assert.equal(stepHints(defs, world, state, idle)[0]?.hint.id, 'roll');

  monster.pos = { x: world.player.pos.x + 2, z: world.player.pos.z };
  world.player.facing = Math.PI / 2;
  world.monsters = [monster];
  const events: WorldEvent[] = stepWorld(world, [{ type: 'skill', slot: 0, aim: monster.pos, targetId: monster.id }], 1 / 60);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'skill_start' && event.actorId === world.player.id && event.skill.form === 'quarrel'));
  stepHints(defs, world, state, { ...idle, events });
  world.time += HINTS.maxShowSeconds;
  assert.equal(stepHints(defs, world, state, idle)[0]?.type, 'hide');
  assert.ok(stepHints(defs, world, state, idle).every((change: HintChange): boolean => change.type !== 'show'));
  assert.equal(state.seen.has('attack'), true);
});
