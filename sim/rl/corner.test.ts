import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { lineWalkable } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import type { World } from '../world/types.ts';
import { emptyArena } from './arena.ts';
import { cornerDrawn, CORNER, cornerEscaped, cornerFled, findCorner, isCorner, openDirection } from './corner.ts';
import type { CornerStart } from './corner.ts';

const CONTENT: Content = loadContent();
const DRAWS = { seeds: 40, many: 2000, share: 0.4, slack: 0.05 } as const;

function startFor(seed: number): { readonly world: World; readonly start: CornerStart | null } {
  const world: World = emptyArena(CONTENT, seed, 10);
  return { world, start: findCorner(world, createRng(seed)) };
}

void test('every corner found in the arena is walled in on most sides, with the caster out in the open at a fair range and a clear line to it', (): void => {
  for (let seed: number = 1; seed <= DRAWS.seeds; seed += 1) {
    const { world, start } = startFor(seed);
    assert.ok(start !== null, `seed ${seed} found a corner`);
    assert.ok(isCorner(world.grid, start.corner), `seed ${seed}: the corner is walkable and walled in`);
    assert.ok(!isCorner(world.grid, start.caster), `seed ${seed}: the caster stands in the open`);
    const gap: number = Math.hypot(start.caster.x - start.corner.x, start.caster.z - start.corner.z);
    assert.ok(gap >= CORNER.gap.min - 1e-9 && gap <= CORNER.gap.max + 1e-9, `seed ${seed}: the caster is ${gap.toFixed(2)} m away`);
    assert.ok(lineWalkable(world.grid, start.corner, start.caster), `seed ${seed}: the cornered hero can walk straight to the caster`);
  }
});

void test('corners turn every way, so the model is not taught one wall', (): void => {
  const quarters: Set<number> = new Set<number>();
  for (let seed: number = 1; seed <= DRAWS.seeds; seed += 1) {
    const { world, start } = startFor(seed);
    if (start === null) continue;
    const open = openDirection(world.grid, start.corner);
    if (open === null) continue;
    quarters.add(Math.floor(((Math.atan2(open.z, open.x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)));
  }
  assert.equal(quarters.size, 4);
});

void test('the same seed finds the same corner', (): void => {
  assert.deepEqual(startFor(9).start, startFor(9).start);
});

void test('the corner share decides by the seed alone: none at zero, all at one, and about the share between', (): void => {
  const seeds: number[] = Array.from({ length: DRAWS.many }, (_unused: unknown, index: number): number => index + 1);
  assert.ok(seeds.every((seed: number): boolean => !cornerDrawn(seed, 0)));
  assert.ok(seeds.every((seed: number): boolean => cornerDrawn(seed, 1)));
  const drawn: number = seeds.filter((seed: number): boolean => cornerDrawn(seed, DRAWS.share)).length / DRAWS.many;
  assert.ok(Math.abs(drawn - DRAWS.share) < DRAWS.slack, `drew ${drawn}`);
  assert.equal(cornerDrawn(123, DRAWS.share), cornerDrawn(123, DRAWS.share));
});

void test('a cornered hero has escaped only once it is clear of the corner and has come out toward the caster, not slipped away along the wall', (): void => {
  const start: CornerStart = { corner: { x: 0, z: 0 }, caster: { x: 6, z: 0 } };
  const caster = start.caster;
  assert.ok(!cornerEscaped(start, { x: 2, z: 0 }, caster), 'still near the corner');
  assert.ok(cornerEscaped(start, { x: CORNER.escape, z: 0 }, caster), 'came out toward the caster');
  assert.ok(cornerEscaped(start, { x: 3, z: 3 }, caster), 'came out to the side, no farther from the caster');
  assert.ok(!cornerEscaped(start, { x: 0, z: -CORNER.escape - 1 }, caster), 'ran along the wall, away from the fight');
  assert.ok(!cornerFled(start, { x: 0, z: -CORNER.escape - 1 }, caster), 'a few metres along the wall is not yet running away');
  assert.ok(cornerFled(start, { x: -1, z: -12 }, caster), 'out of the fight altogether');
  assert.ok(!cornerFled(start, { x: 6, z: 2 }, caster), 'beside the caster');
});
