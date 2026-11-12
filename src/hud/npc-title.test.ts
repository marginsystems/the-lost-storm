import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shownTitle } from './npc-title.ts';

void test('a title the name already says is not shown again', (): void => {
  assert.equal(shownTitle({ name: 'Warden Guide', title: 'Warden' }), '');
  assert.equal(shownTitle({ name: 'Old Mara', title: 'Trader' }), 'Trader');
});
