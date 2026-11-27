import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable, lineWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { MOVE_CHOICES } from '../rl/contract.ts';
import { createPorterSteering } from '../rl/porter-steering.ts';
import { RESIDENT_MODEL_PATH, residentPilotFrom } from '../rl/resident-model.ts';
import { dropOnGround } from './ground.ts';
import type { PorterSteering } from './porter.ts';
import { MAX_STEP, stepWorld } from './step.ts';
import type { GroundItem, ItemInstance, World } from './types.ts';

function drop(world: World, base: string, rarity: string, pos: Vec2): GroundItem {
  assert.ok(isWalkable(world.grid, pos.x, pos.z));
  const item: ItemInstance = { uid: world.nextItemUid++, base, rarity, level: 9, affixes: [], ledger: null, ...(rarity === 'rare' ? { unidentified: true } : {}) };
  const ground = dropOnGround(world, pos, { kind: 'item', item });
  ground.pos = { ...pos };
  return ground;
}

void test('the shipped movement model follows through Hourfall Caves, collects only rare boots and gloves and rejoins a running hero', (): void => {
  const world = worldIn(loadContent(), 'under_hall', 13);
  const policy = residentPilotFrom(readFileSync('public/' + RESIDENT_MODEL_PATH));
  let choices: number = 0;
  let answerNextTick: (() => void) | null = null;
  const steering = createPorterSteering((obs, mask, answer): boolean => {
    const move: number = policy(obs, mask).move;
    assert.equal(mask[move], 1);
    if (mask.slice(0, MOVE_CHOICES).reduce((sum, value): number => sum + value, 0) > 1) choices += 1;
    answerNextTick = (): void => answer(move);
    return true;
  });
  const modelSteps = { follow: 0, fetch: 0, return: 0 };
  const steerPorter: PorterSteering = (scene, npc, interval): void => {
    const before = npc.route[0];
    steering(scene, npc, interval);
    if (npc.route[0] === before) return;
    if (scene.porterTarget !== null) modelSteps.fetch += 1;
    else if (scene.satchel[0] === null) modelSteps.follow += 1;
    else modelSteps.return += 1;
  };
  const context = { now: 1, loot: { common: [], magic: [], rare: ['feet', 'hands'] as const, stormtouched: [] }, steerPorter };
  const destination: Vec2 = { x: 61, z: 62 };
  const origin = { ...world.player.pos };
  world.porterUntil = world.now + world.content.trade.porter.durationMs;
  const step = (start: boolean): void => {
    answerNextTick?.();
    answerNextTick = null;
    stepWorld(world, start ? [{ type: 'move', dest: destination, held: false }] : [], MAX_STEP, context);
  };
  step(true);
  const porter = must(world.porter, 'hired porter');
  for (let i: number = 0; i < 21; i += 1) step(false);
  assert.ok(distance(origin, porter.pos) > 2, 'followed before the drops');
  const boots = { x: 131.5, z: 32.25 };
  const gloves = { x: 132.25, z: 32.25 };
  const bootsDrop = drop(world, 'mudcaked_boots', 'rare', boots);
  const glovesDrop = drop(world, 'tanner_gloves', 'rare', gloves);
  const sword = drop(world, 'rusted_blade', 'rare', boots);
  const magic = drop(world, 'mudcaked_boots', 'magic', gloves);
  assert.ok(findPath(world.grid, world.player.pos, destination).length > 1);
  let furthest: number = 0;
  let collectedAt: Vec2 | null = null;
  let caughtUp: boolean = false;
  for (let i: number = 0; i < 420; i += 1) {
    const before = { ...porter.pos };
    step(false);
    assert.ok(lineWalkable(world.grid, before, porter.pos));
    assert.ok(distance(before, porter.pos) <= porter.pace * MAX_STEP + 1e-6, 'walked every step');
    const gap: number = distance(porter.pos, world.player.pos);
    if (collectedAt === null) {
      furthest = Math.max(furthest, gap);
      if (world.satchel.filter(Boolean).length === 2) {
        collectedAt = { ...world.player.pos };
        assert.ok(distance(porter.pos, gloves) <= world.content.trade.porter.pickupReach + porter.pace * MAX_STEP);
      }
    } else if (world.player.moving && distance(world.player.pos, collectedAt) > 5 && gap <= world.content.trade.porter.followGap) {
      caughtUp = true;
      break;
    }
  }
  assert.ok(modelSteps.follow > 0 && modelSteps.fetch > 0 && modelSteps.return > 0, JSON.stringify(modelSteps));
  assert.ok(choices > 2, 'the shipped policy chose between multiple legal headings');
  assert.ok(furthest > world.content.trade.porter.followGap * 2, 'left the player for the side drops');
  assert.deepEqual(world.satchel.flatMap((item): string[] => item === null ? [] : [item.base]).toSorted(), ['mudcaked_boots', 'tanner_gloves']);
  assert.ok(!world.ground.includes(bootsDrop) && !world.ground.includes(glovesDrop));
  assert.ok(world.ground.includes(sword) && world.ground.includes(magic));
  assert.ok(caughtUp, 'rejoined while the hero kept running');
});
