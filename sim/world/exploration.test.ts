import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { parseSaveText, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { decodeExplored, encodeExplored, EXPLORE, exploredSize, isExplored, revealAround } from './exploration.ts';
import { stepWorld } from './step.ts';
import type { World } from './types.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const DT: number = 1 / 30;

void test('a fresh world has the ground around the hero explored and nothing far away', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  const pos = world.player.pos;
  assert.ok(isExplored(world, pos.x, pos.z));
  assert.ok(!isExplored(world, pos.x + EXPLORE.revealRadius + 3, pos.z));
  assert.ok(world.exploredRevision > 0);
});

void test('walking reveals new ground and bumps the revision only when something new is seen', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  const before: number = world.exploredRevision;
  assert.equal(revealAround(world, world.player.pos), false);
  assert.equal(world.exploredRevision, before);
  const far = { x: world.player.pos.x + EXPLORE.revealRadius * 2, z: world.player.pos.z };
  assert.ok(!isExplored(world, far.x, far.z));
  world.player.pos = { ...far };
  stepWorld(world, [], DT);
  assert.ok(isExplored(world, far.x, far.z));
  assert.ok(world.exploredRevision > before);
});

void test('each zone keeps its own explored ground across zone changes', (): void => {
  const world: World = worldIn(content, content.world.start, 3);
  const homeSpot = { ...world.player.pos };
  enterZone(world, zoneOf(content, 'hall_of_time'), { type: 'start' });
  stepWorld(world, [], DT);
  assert.ok(isExplored(world, world.player.pos.x, world.player.pos.z));
  enterZone(world, zoneOf(content, content.world.start), { type: 'start' });
  assert.ok(isExplored(world, homeSpot.x, homeSpot.z));
  assert.ok(world.explored['hall_of_time'] !== undefined);
});

void test('explored ground survives a save and a broken record is dropped', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 4);
  stepWorld(world, [], DT);
  const save = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  const restored: World = createWorld(content, { seed: 5, save });
  assert.deepEqual(restored.explored['hall_of_time'], world.explored['hall_of_time']);
  const broken = must(parseSaveText(content, JSON.stringify({ ...toSave(world), explored: { shallows: '3.4', atlantis: '1', waystation: 7 } })), 'save');
  assert.deepEqual(broken.explored, {});
  const older = must(parseSaveText(content, JSON.stringify({ ...toSave(world), explored: undefined })), 'save');
  assert.deepEqual(older.explored, {});
});

void test('run-length encoding round-trips and rejects the wrong size', (): void => {
  const size: number = exploredSize(zoneOf(content, 'hall_of_time'));
  const cells: Uint8Array = new Uint8Array(size);
  cells.fill(1, 10, 40);
  cells[size - 1] = 1;
  const text: string = encodeExplored(cells);
  assert.deepEqual(decodeExplored(text, size), cells);
  assert.equal(decodeExplored(text, size + 1), null);
  assert.equal(decodeExplored('x.2', size), null);
  assert.equal(decodeExplored('', size), null);
});
