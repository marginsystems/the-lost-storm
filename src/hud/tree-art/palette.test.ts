import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mixHex, tintPalette } from './palette.ts';

void test('mixing runs from one colour to the other', (): void => {
  assert.equal(mixHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
});

void test('a tint gives a dark ground, the tint itself and a pale light', (): void => {
  const palette = tintPalette('#E0773A');
  assert.equal(palette.hot, '#e0773a');
  for (const colour of [palette.deep, palette.core, palette.light]) assert.match(colour, /^#[0-9a-f]{6}$/);
  assert.ok(Number.parseInt(palette.deep.slice(1, 3), 16) < Number.parseInt(palette.core.slice(1, 3), 16));
  assert.ok(Number.parseInt(palette.light.slice(5, 7), 16) > Number.parseInt(palette.hot.slice(5, 7), 16));
});
