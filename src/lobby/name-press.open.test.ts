import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openFill } from './name-press.ts';
import type { PickedName } from './name-pool.ts';

const offered: PickedName = { name: 'Linden Dawnley', mood: 'dawn' };

void test('a first-time player opens the step with a suggested name already in the field', (): void => {
  assert.deepEqual(openFill(null, (): PickedName => offered), { kind: 'suggested', picked: offered });
});

void test('a name kept on this device fills the field and asks for no suggestion', (): void => {
  let asked: number = 0;
  const fill = openFill('Ash Vale', (): PickedName => {
    asked += 1;
    return offered;
  });
  assert.deepEqual(fill, { kind: 'kept', name: 'Ash Vale' });
  assert.equal(asked, 0);
});

void test('with no name left to suggest the field opens empty', (): void => {
  assert.deepEqual(openFill(null, (): null => null), { kind: 'empty' });
});
