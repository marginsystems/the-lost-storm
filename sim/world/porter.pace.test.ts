import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { followFactor, PORTER } from './porter.ts';
import { MAX_STEP, stepWorld } from './step.ts';

const content = loadContent();
const gap: number = content.trade.porter.followGap;

void test('the porter matches the hero at its gap, leads a little behind it and only rushes when far back', (): void => {
  assert.equal(followFactor(0, gap), 1);
  assert.equal(followFactor(-gap, gap), PORTER.closeFactor);
  assert.equal(followFactor(PORTER.rushFrom, gap), PORTER.leadFactor);
  assert.equal(followFactor(PORTER.rushAt * 2, gap), PORTER.rushFactor);
  let previous: number = followFactor(-gap * 2, gap);
  for (let behind: number = -gap * 2; behind <= PORTER.rushAt + 2; behind += 0.25) {
    const factor: number = followFactor(behind, gap);
    assert.ok(factor >= previous - 1e-9, `rises with distance at ${behind}`);
    previous = factor;
  }
});

void test('a hired porter walks up to speed, trails a running hero at about its own pace and stops short of a standing hero', (): void => {
  const world = worldIn(content, 'hall_of_time', 13);
  world.monsters = [];
  world.porterUntil = world.now + content.trade.porter.durationMs;
  const context = { now: 1, loot: { common: [], magic: [], rare: [], stormtouched: [] } };
  stepWorld(world, [{ type: 'move', dest: { x: 76, z: 44 }, held: false }], MAX_STEP, context);
  const porter = must(world.porter, 'hired porter');
  const hero: number = Math.max(content.trade.porter.pace, world.player.stats.moveSpeed);
  const change: number = PORTER.acceleration * PORTER.routeInterval + 1e-9;
  let pace: number = porter.pace;
  let trailed: number = 0;
  let stoppedAt: number | null = null;
  for (let tick: number = 0; tick < 420 && stoppedAt === null; tick += 1) {
    stepWorld(world, [], MAX_STEP, context);
    assert.ok(porter.pace === 0 || Math.abs(porter.pace - pace) <= change, `eased its pace at tick ${tick}`);
    pace = porter.pace;
    assert.ok(porter.pace <= hero * PORTER.rushFactor + 1e-9);
    const apart: number = distance(porter.pos, world.player.pos);
    if (world.player.moving && apart < gap + PORTER.rushFrom) {
      assert.ok(porter.pace <= hero * PORTER.leadFactor + 1e-9, `kept near the hero's pace at tick ${tick}`);
      trailed += 1;
    }
    if (!world.player.moving && porter.motion === 'still' && tick > 60) stoppedAt = apart;
  }
  assert.ok(trailed > 100, 'trailed the hero');
  assert.ok(stoppedAt !== null && stoppedAt > gap * 0.6, `stopped short of the hero at ${String(stoppedAt)}`);
  const from: Vec2 = { ...porter.pos };
  const hero0: Vec2 = world.player.pos;
  const away: number = distance(from, hero0);
  const sides: readonly Vec2[] = [-1, 1].flatMap((sign: number): Vec2[] => [{ x: hero0.x + sign * (hero0.z - from.z) / away, z: hero0.z - sign * (hero0.x - from.x) / away }]);
  const step: Vec2 = must(sides.find((point: Vec2): boolean => isWalkable(world.grid, point.x, point.z)), 'room for a short step');
  stepWorld(world, [{ type: 'move', dest: step, held: false }], MAX_STEP, context);
  for (let tick: number = 0; tick < 30; tick += 1) stepWorld(world, [], MAX_STEP, context);
  assert.ok(distance(porter.pos, world.player.pos) <= gap + PORTER.resumeSlack);
  assert.deepEqual(porter.pos, from, 'stayed put through a short step');
});
