import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ItemPress, PressFrame } from './item-press.ts';
import { itemPress } from './item-press.ts';

const JOURNAL: number = 7;

function run(frames: readonly PressFrame[]): number[] {
  let was: boolean = false;
  const picked: number[] = [];
  for (const frame of frames) {
    const press: ItemPress = itemPress(was, frame);
    was = press.onItem;
    if (press.pickup !== null) picked.push(press.pickup);
  }
  return picked;
}

void test('a button pressed on the ground and dragged across an item never picks it up, nor does releasing it there', (): void => {
  assert.deepEqual(
    run([
      { fresh: true, held: true, free: true, item: null },
      { fresh: false, held: true, free: true, item: null },
      { fresh: false, held: true, free: true, item: JOURNAL },
      { fresh: false, held: true, free: true, item: JOURNAL },
      { fresh: false, held: false, free: true, item: JOURNAL },
    ]),
    [],
  );
});

void test('a fresh press that begins on an item picks it up once, and holding it there sends nothing more', (): void => {
  const frames: PressFrame[] = [
    { fresh: true, held: true, free: true, item: JOURNAL },
    { fresh: false, held: true, free: true, item: JOURNAL },
    { fresh: false, held: true, free: true, item: null },
  ];
  assert.deepEqual(run(frames), [JOURNAL]);
  assert.equal(itemPress(true, { fresh: false, held: true, free: true, item: null }).onItem, true);
  assert.equal(itemPress(true, { fresh: false, held: false, free: true, item: null }).onItem, false);
});

void test('a tap on an item is a fresh press on it and picks it up', (): void => {
  assert.deepEqual(run([{ fresh: true, held: false, free: true, item: JOURNAL }]), [JOURNAL]);
});

void test('a fresh press on an item while aiming at a monster, a person or with shift held is not a pickup', (): void => {
  assert.deepEqual(run([{ fresh: true, held: true, free: false, item: JOURNAL }]), []);
});
