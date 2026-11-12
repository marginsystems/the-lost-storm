import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOBBY_FRAMING, lobbyFraming } from './lobby-stage.ts';
import type { Framing } from './lobby-stage.ts';

void test('a wide screen stands the hero in the middle at full size', (): void => {
  assert.deepEqual(lobbyFraming(1440, 900), LOBBY_FRAMING.wide);
  assert.deepEqual(lobbyFraming(844, 390), LOBBY_FRAMING.wide);
});

void test('a tall phone raises the hero into the top half and steps back so the panels fit under him', (): void => {
  const tall: Framing = lobbyFraming(390, 844);
  assert.deepEqual(tall, LOBBY_FRAMING.tall);
  assert.deepEqual(lobbyFraming(0, 0), LOBBY_FRAMING.wide);
});
