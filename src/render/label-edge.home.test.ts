import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keepApart } from './label-edge.ts';
import type { EdgeTag, ViewSize } from './label-edge.ts';

const VIEW: ViewSize = { width: 1280, height: 713 };

function tag(id: number, x: number, y: number, home: number | undefined, height: number): EdgeTag {
  return { id, x, y, width: 140, height, reach: 0, offscreen: false, ...(home === undefined ? {} : { home }) };
}

function mover(tags: readonly EdgeTag[]): string {
  const apart: ReadonlyMap<number, number> = keepApart(tags, [], VIEW);
  return tags.filter((one: EdgeTag): boolean => (apart.get(one.id) ?? 0) !== 0).map((one: EdgeTag): number => one.id).join(',');
}

function lifted(tags: readonly EdgeTag[], id: number): number {
  return keepApart(tags, [], VIEW).get(id) ?? 0;
}

const PLATE: EdgeTag = tag(1, 640, 330, 330, 58);

void test('of two overlapping labels the same one gives way however the other has glided, so the pair never swaps while they ease apart', (): void => {
  const movers: Set<string> = new Set<string>();
  for (let y: number = 300; y <= 350; y += 5) {
    const moving: string = mover([PLATE, tag(2, 640, y, 300, 24)]);
    if (moving !== '') movers.add(moving);
  }
  assert.equal(movers.size, 1, [...movers].join(' | '));
});

void test('crossing the middle of the view does not change which way a label gives way', (): void => {
  const directions: Set<number> = new Set<number>();
  for (let y: number = 330; y <= 400; y += 5) {
    const moved: number = lifted([tag(1, 640, 372, 372, 60), tag(2, 640, y, 340, 24)], 2);
    if (moved !== 0) directions.add(Math.sign(moved));
  }
  assert.ok(directions.size <= 1);
});

void test('a plate that grows a bubble keeps its side, so the labels around it do not swap places when someone speaks', (): void => {
  const neighbour: EdgeTag = tag(1, 640, 352, 352, 24);
  const quiet: number = lifted([tag(2, 640, 350, 350, 24), neighbour], 1);
  const speaking: number = lifted([tag(2, 640, 350, 350, 58), neighbour], 1);
  assert.equal(Math.sign(quiet), Math.sign(speaking));
});

void test('tags that name no anchor are placed by their middle, as they always were', (): void => {
  const apart: ReadonlyMap<number, number> = keepApart([tag(1, 1200, 741, undefined, 25), tag(2, 1200, 735, undefined, 25)], [], { width: 1280, height: 800 });
  assert.equal(apart.get(1), 0);
  assert.ok(735 + (apart.get(2) ?? 0) <= 741 - 25 - 4 + 1e-9);
});
