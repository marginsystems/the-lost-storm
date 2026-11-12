import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { iconBody } from './icons.ts';
import { hasTreeGlyph, placeGlyph, treeGlyph } from './tree-glyphs.ts';

void test('every place has a glyph of its own, and an ability place draws the icon its skill wears on the bar', (): void => {
  const content = loadContent();
  for (const node of content.skillTree) {
    if (node.unlock === null) {
      assert.ok(hasTreeGlyph(node.icon), `${node.id} names unknown glyph ${node.icon}`);
      continue;
    }
    const glyph: string = placeGlyph(content, node);
    assert.ok(glyph.includes('class="tree-glyph"') && glyph.includes(iconBody(content.skills.get(node.unlock)?.icon ?? '')), node.id);
  }
});

void test('an unknown glyph falls back to the lightning mark', (): void => {
  assert.equal(treeGlyph('nothing'), treeGlyph('lightning'));
  assert.notEqual(treeGlyph('focus'), treeGlyph('lightning'));
});
