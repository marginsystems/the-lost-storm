import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { CliffRock } from './cliff-rocks.ts';
import { cliffRocks, cliffRocksWork } from './cliff-rocks.ts';

const content: Content = loadContent();

function zoneOf(id: string): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(id);
  if (zone === undefined) throw new Error(`missing ${id}`);
  return { ...zone };
}

void test('a cave places its cliff rocks a row at a time, and the rocks match the ones placed at once', (): void => {
  const stepped: ZoneDef = zoneOf('lava_depths');
  const work: Generator<void, readonly CliffRock[]> = cliffRocksWork(stepped, content.props);
  let steps: number = 0;
  let step: IteratorResult<void, readonly CliffRock[]> = work.next();
  while (step.done !== true) {
    steps += 1;
    step = work.next();
  }
  assert.ok(steps > 20, `only ${steps} steps`);
  assert.ok(step.value.length > 0);
  assert.deepEqual(step.value, cliffRocks(zoneOf('lava_depths'), content.props));
  assert.equal(cliffRocks(stepped, content.props), step.value);
});
