import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferGeometry } from 'three';
import { must } from '../../test/support.ts';
import { groundGeometry, groundHeight, LOBBY_GROUND, rockHeight, valueNoise } from './lobby-ground.ts';
import type { Mound } from './lobby-ground.ts';

const ROCK: Mound = { x: 4, z: -5, size: 1 };

void test('the ground is flat where the hero stands and rolls beyond it', (): void => {
  for (const [x, z] of [[0, 0], [1, 0.5], [-0.9, -0.9]] as const) assert.equal(groundHeight(x, z, []), 0);
  const heights: number[] = [];
  for (let step: number = 0; step < 48; step += 1) heights.push(groundHeight(Math.cos(step) * 7, Math.sin(step) * 7, []));
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.12, 'the ground at seven metres is flat');
  assert.ok(Math.max(...heights.map(Math.abs)) < 1.2, 'the ground at seven metres would hide the hero');
});

function mean(z: number): number {
  let sum: number = 0;
  for (let x: number = -6; x <= 6; x += 1) sum += groundHeight(x, z, []);
  return sum / 13;
}

void test('the far ground rises into a ridge, higher behind the hero than in front of the camera', (): void => {
  assert.ok(mean(-12) > mean(-5) + 0.2);
  assert.ok(mean(-12) > mean(12));
  for (let x: number = -3; x <= 3; x += 1) assert.ok(groundHeight(x, 10, []) < 1.1, 'the ridge in front would hide the hero from the camera');
});

void test('a rock stands in a rise of its own and sinks a little into it', (): void => {
  assert.ok(groundHeight(ROCK.x, ROCK.z, [ROCK]) > groundHeight(ROCK.x, ROCK.z, []) + LOBBY_GROUND.moundHeight * 0.9);
  assert.ok(Math.abs(groundHeight(ROCK.x + 9, ROCK.z, [ROCK]) - groundHeight(ROCK.x + 9, ROCK.z, [])) < 1e-6);
  assert.ok(rockHeight(ROCK, [ROCK]) < groundHeight(ROCK.x, ROCK.z, [ROCK]));
});

void test('the ground mesh is one sheet whose vertices lie on the height field, and the noise is steady', (): void => {
  const geometry: BufferGeometry = groundGeometry([ROCK]);
  const positions = geometry.getAttribute('position');
  assert.equal(positions.count, 1 + LOBBY_GROUND.rings * (LOBBY_GROUND.spokes + 1));
  assert.equal(must(geometry.getIndex(), 'index').count, 3 * (LOBBY_GROUND.spokes + 2 * LOBBY_GROUND.spokes * (LOBBY_GROUND.rings - 1)));
  for (const index of [0, 7, 400, positions.count - 1]) assert.ok(Math.abs(positions.getY(index) - groundHeight(positions.getX(index), positions.getZ(index), [ROCK])) < 1e-5);
  assert.equal(valueNoise(3.2, -1.7), valueNoise(3.2, -1.7));
  assert.ok(valueNoise(3.2, -1.7) >= 0 && valueNoise(3.2, -1.7) <= 1);
});
