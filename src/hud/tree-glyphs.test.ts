import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { hasTreeGlyph, treeGlyph } from './tree-glyphs.ts';

void test('every tree node in the data has a glyph of its own', (): void => {
  for (const node of loadContent().skillTree) assert.ok(hasTreeGlyph(node.icon), `${node.id} names unknown glyph ${node.icon}`);
});

void test('an unknown glyph falls back to the lightning mark', (): void => {
  assert.equal(treeGlyph('nothing'), treeGlyph('lightning'));
  assert.notEqual(treeGlyph('focus'), treeGlyph('lightning'));
});
