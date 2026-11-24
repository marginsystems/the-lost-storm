import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, DuelClosing } from '../content/types.ts';
import { must, worldIn } from '../../test/support.ts';
import type { ClosingState } from '../world/closing.ts';
import { stepWorld } from '../world/step.ts';
import type { PlayerState, World } from '../world/types.ts';
import { RL } from './contract.ts';
import type { RivalDuel } from './rival.ts';
import { beginRivalDuel, RIVAL, resignRivalDuel, rivalHeard, rivalOf, startRivalDuel } from './rival.ts';

const CONTENT: Content = loadContent();
const RULES: DuelClosing = must(must(CONTENT.zones.get('proving_ground'), 'proving ground').duel?.closing, 'closing');

function provingWorld(seed: number): World {
  const world: World = worldIn(CONTENT, 'proving_ground', seed);
  stepWorld(world, [{ type: 'bench', hero: { seed, level: 10, weapon: 'warden_broadsword', bar: ['cleave', null, null, null, null, 'dodge_roll'] } }], RL.tick);
  world.events = [];
  return world;
}

void test('a Proving Ground duel closes in from the moment it begins', (): void => {
  const world: World = provingWorld(3);
  const duel: RivalDuel = must(startRivalDuel(world, 3), 'duel');
  stepWorld(world, [], 2);
  beginRivalDuel(duel, world);
  const closing: ClosingState = must(world.closing, 'closing');
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  assert.ok(Math.abs(closing.centre.x - (world.player.pos.x + rival.pos.x) / 2) < 1e-9);
  assert.equal(closing.startsAt, duel.start + RULES.after);
  assert.equal(closing.to, RULES.to);
});

void test('the edge falls when the rival is beaten', (): void => {
  const world: World = provingWorld(4);
  const duel: RivalDuel = must(startRivalDuel(world, 4), 'duel');
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  rival.alive = false;
  rivalHeard(duel, world, []);
  assert.equal(duel.outcome, 'won');
  assert.equal(world.closing, null);
});

void test('the edge falls when the player resigns', (): void => {
  const world: World = provingWorld(5);
  const duel: RivalDuel = must(startRivalDuel(world, 5), 'duel');
  assert.ok(world.closing !== null);
  assert.ok(resignRivalDuel(duel, world));
  assert.equal(world.closing, null);
});

void test('a rival that keeps away is brought within reach once the edge has closed', (): void => {
  const world: World = provingWorld(6);
  const duel: RivalDuel = must(startRivalDuel(world, 6), 'duel');
  const closing: ClosingState = must(world.closing, 'closing');
  stepWorld(world, [], closing.closesAt - world.time + RIVAL.startIn);
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  assert.ok(Math.hypot(rival.pos.x - world.player.pos.x, rival.pos.z - world.player.pos.z) <= RULES.to * 2);
});
