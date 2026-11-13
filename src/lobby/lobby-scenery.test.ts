import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROP_SURFACE } from '../render/prop-surface.ts';
import { groundHeight, rockHeight } from './lobby-ground.ts';
import { LOBBY_SCENERY, rockDressing } from './lobby-scenery.ts';

void test('each rock is darkened from the ground it stands on, not from the level of the hero\'s feet', (): void => {
  const lifted: number[] = [];
  for (const rock of LOBBY_SCENERY.rocks) {
    const ground: number = rockDressing(rock, LOBBY_SCENERY.rocks).ground;
    assert.equal(ground, groundHeight(rock.x, rock.z, LOBBY_SCENERY.rocks));
    const seat: number = rockHeight(rock, LOBBY_SCENERY.rocks);
    assert.ok(ground > seat, `${rock.prop} is not bedded in its ground`);
    assert.ok(ground - seat < PROP_SURFACE.contactHeight, `${rock.prop} sinks past its whole contact band`);
    if (ground > PROP_SURFACE.contactHeight) lifted.push(ground);
  }
  assert.ok(lifted.length > 0, 'no rock stands above the old contact band, so this test proves nothing');
});

void test('every rock keeps the lobby\'s wetness', (): void => {
  for (const rock of LOBBY_SCENERY.rocks) assert.equal(rockDressing(rock, LOBBY_SCENERY.rocks).wet, LOBBY_SCENERY.wet);
});
