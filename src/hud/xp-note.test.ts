import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reducedLine } from './xp-note.ts';

void test('a reduced gain is named plainly by the side it falls on, and a full gain says nothing', (): void => {
  assert.equal(reducedLine({ side: 'below', share: 0.2 }), 'Reduced experience: this place is far below your level');
  assert.equal(reducedLine({ side: 'above', share: 0.1 }), 'Reduced experience: this place is far above your level');
  assert.equal(reducedLine(null), null);
});
