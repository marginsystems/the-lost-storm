import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOBBY_RENDER, lobbyPixelRatio } from './lobby-render.ts';

void test('the lobby draws at the device ratio up to 2 on desktop and 1.5 on mobile', (): void => {
  assert.equal(lobbyPixelRatio('desktop', 3), 2);
  assert.equal(lobbyPixelRatio('desktop', 2), 2);
  assert.equal(lobbyPixelRatio('desktop', 1), 1);
  assert.equal(lobbyPixelRatio('mobile', 3), 1.5);
  assert.equal(lobbyPixelRatio('mobile', 0), 1);
});

void test('every lobby tier keeps multisampling on', (): void => {
  assert.ok(LOBBY_RENDER.tiers.desktop.samples >= 4);
  assert.ok(LOBBY_RENDER.tiers.mobile.samples >= 4);
});
