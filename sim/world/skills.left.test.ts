import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { offset, run, shapeArena } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { AreaState, World } from './types.ts';

function lineLasts(allocated: readonly string[]): number {
  const world: World = shapeArena(['fire_slam']);
  world.player.allocated = [...allocated];
  faceAt(world.player, offset(9, 0));
  run(world, 0.1, [{ type: 'skill', slot: 0, aim: offset(9, 0), targetId: null }]);
  run(world, 0.5);
  const line: AreaState = must(world.areas.find((area: AreaState): boolean => area.skill.id === 'fire_slam_line'), 'line');
  return line.skill.delivery.type === 'area' ? line.skill.delivery.duration : 0;
}

void test('the line a hero leaves burns longer with the fire duration the hero has taken in the tree', (): void => {
  assert.ok(Math.abs(lineLasts(['kiln_2']) - lineLasts([]) * 1.1) < 1e-9);
});
