import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef, SkillDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { applyHit, offenceOf } from './combat.ts';
import { keepsPiece, piecesHolding } from './count.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World } from './types.ts';

const COURT = {
  zone: 'ledger_court',
  keeper: 'ledger_keeper',
  corner: { x: 5, z: 33 },
  clock: { x: 8, z: 19 },
  dt: 1 / 30,
  seconds: 3,
  closed: 6,
} as const;

const CONTENT: Content = loadContent();
const CLEAVE: SkillDef = must(CONTENT.skills.get('cleave'), 'cleave');

function court(seed: number): { readonly world: World; readonly keeper: MonsterState; readonly clock: MonsterState } {
  const world: World = worldIn(CONTENT, COURT.zone, seed);
  const keeper: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === COURT.keeper), 'the Timekeeper');
  const clock: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => distance(monster.pos, COURT.clock) < 1), 'the west clock');
  world.player.pos = { x: COURT.corner.x, z: COURT.corner.z };
  return { world, keeper, clock };
}

function strike(world: World, clock: MonsterState): void {
  applyHit(world, { ...offenceOf(world.player), damageMin: 10, damageMax: 10, damagePercent: 0, critChance: 0 }, clock, CLEAVE, { x: 1, z: 0 });
}

void test('every piece the Timekeeper keeps is named by one of his phases, and none of them waits between hits', (): void => {
  const keeper: MonsterDef = must(CONTENT.monsters.get(COURT.keeper), 'the Timekeeper');
  const boss = must(keeper.boss, 'his boss block');
  const pieces: MonsterDef[] = [...CONTENT.monsters.values()].filter((def: MonsterDef): boolean => keepsPiece(boss, def.id));
  assert.deepEqual(pieces.map((def: MonsterDef): string => def.id).toSorted(), ['count_clock_a', 'count_clock_b', 'ledger_book']);
  for (const def of pieces) assert.ok(def.behaviour.type === 'fixed' && def.behaviour.strikes === null, `${def.id} drops hits between strikes`);
});

void test('every hit on a clock takes life off it, however close together the hits land', (): void => {
  const { world, clock } = court(1);
  const lives: number[] = [clock.life];
  for (let index: number = 0; index < 4; index += 1) {
    strike(world, clock);
    lives.push(clock.life);
  }
  for (let index: number = 1; index < lives.length; index += 1) assert.ok((lives[index] ?? 0) < (lives[index - 1] ?? 0), `hit ${index} did nothing: ${lives.join(', ')}`);
});

void test('a hero who strikes a clock from a far corner wakes the Timekeeper, and he comes for that hero', (): void => {
  const { world, keeper, clock } = court(2);
  assert.equal(keeper.aggro, false);
  const start: number = distance(keeper.pos, world.player.pos);
  strike(world, clock);
  assert.equal(keeper.aggro, true);
  assert.equal(keeper.foeId, world.player.id);
  for (let tick: number = 0; tick < COURT.seconds / COURT.dt; tick += 1) {
    world.player.pos = { x: COURT.corner.x, z: COURT.corner.z };
    stepWorld(world, [], COURT.dt);
  }
  assert.ok(distance(keeper.pos, world.player.pos) < start - COURT.closed, `he only closed from ${start.toFixed(1)} to ${distance(keeper.pos, world.player.pos).toFixed(1)}`);
});

void test('a clock struck while the Timekeeper already fights someone else turns him toward the striker', (): void => {
  const { world, keeper, clock } = court(4);
  keeper.aggro = true;
  keeper.foeId = -1;
  strike(world, clock);
  assert.equal(keeper.foeId, world.player.id);
});

void test('the pieces holding the Timekeeper are the clocks his current phase names, alive or fallen', (): void => {
  const { world, keeper, clock } = court(3);
  const first: MonsterState[] = piecesHolding(world, keeper);
  assert.equal(first.length, 2);
  assert.ok(first.every((piece: MonsterState): boolean => piece.def.id === 'count_clock_a'));
  clock.alive = false;
  assert.equal(piecesHolding(world, keeper).length, 2);
});
