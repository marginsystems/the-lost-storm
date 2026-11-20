import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { NavGrid } from './grid.ts';
import { buildNavGrid, navGridPrepared, navGridWork } from './grid.ts';

const content: Content = loadContent();

function zoneOf(id: string): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(id);
  if (zone === undefined) throw new Error(`missing ${id}`);
  return { ...zone };
}

void test('a cave grid is built in many short steps, and once done every later grid is a copy of it', (): void => {
  const zone: ZoneDef = zoneOf('under_hall');
  const work: Generator<void, void> = navGridWork(zone, content.props, content.surfaces, content.player.radius);
  let steps: number = 0;
  while (work.next().done !== true) steps += 1;
  assert.ok(steps > 20, `only ${steps} steps`);
  assert.equal(navGridPrepared(zone, content.props, content.surfaces, content.player.radius), true);
  const first: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
  const second: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
  assert.notEqual(first.walkable, second.walkable);
  assert.deepEqual(first.walkable, second.walkable);
  assert.equal(navGridWork(zone, content.props, content.surfaces, content.player.radius).next().done, true);
});

void test('every cell a hero can walk is ground, and the grid built in steps matches one built at once', (): void => {
  const stepped: ZoneDef = zoneOf('lava_depths');
  const whole: ZoneDef = zoneOf('lava_depths');
  const work: Generator<void, void> = navGridWork(stepped, content.props, content.surfaces, content.player.radius);
  while (work.next().done !== true);
  const fromSteps: NavGrid = buildNavGrid(stepped, content.props, content.surfaces, content.player.radius);
  const atOnce: NavGrid = buildNavGrid(whole, content.props, content.surfaces, content.player.radius);
  assert.deepEqual(fromSteps.walkable, atOnce.walkable);
  assert.deepEqual(fromSteps.ground, atOnce.ground);
  assert.deepEqual(fromSteps.solid, atOnce.solid);
  fromSteps.walkable.forEach((cell: number, at: number): void => {
    if (cell === 1) assert.equal(fromSteps.ground[at], 1);
  });
});
