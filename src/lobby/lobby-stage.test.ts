import assert from 'node:assert/strict';
import { test } from 'node:test';
import { floorLift, LOBBY_FRAMING, lobbyFraming } from './lobby-stage.ts';
import type { Framing } from './lobby-stage.ts';

void test('a wide screen stands the hero larger and right of centre, clear of the dock under the middle', (): void => {
  assert.deepEqual(lobbyFraming(1440, 900), LOBBY_FRAMING.wide);
  assert.deepEqual(lobbyFraming(844, 390), LOBBY_FRAMING.wide);
});

void test('a tall phone raises the hero into the top half and steps back so the panels fit under him', (): void => {
  const tall: Framing = lobbyFraming(390, 844);
  assert.deepEqual(tall, LOBBY_FRAMING.tall);
  assert.deepEqual(lobbyFraming(0, 0), LOBBY_FRAMING.wide);
});

void test('the deepest sole over the idle is lifted to just above the floor, and a floating hero is lowered onto it', (): void => {
  assert.equal(floorLift([-0.01, -0.03, -0.02], 0.002), 0.032);
  assert.equal(floorLift([0.05, 0.08], 0), -0.05);
  assert.equal(floorLift([], 0.002), 0);
});
