import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOBBY_RENDER, lobbyPixelRatio, retire } from './lobby-render.ts';
import type { Retiring } from './lobby-render.ts';

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

void test('a composer that is replaced frees every pass it held, then itself', (): void => {
  const freed: string[] = [];
  const old: Retiring = {
    passes: [{ dispose: (): void => void freed.push('scene') }, { dispose: (): void => void freed.push('bloom') }, { dispose: (): void => void freed.push('output') }],
    dispose: (): void => void freed.push('composer'),
  };
  retire(old);
  assert.deepEqual(freed, ['scene', 'bloom', 'output', 'composer']);
  retire(null);
  assert.equal(freed.length, 4);
});
