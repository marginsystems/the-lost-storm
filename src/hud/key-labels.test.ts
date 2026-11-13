import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iconSvg } from './icons.ts';
import { PANEL_ICONS } from './key-labels.ts';

void test('every phone menu panel has its own drawn glyph, and the Character button shows a bust, not the hood-shaped helm', (): void => {
  const fallback: string = iconSvg('');
  for (const icon of Object.values(PANEL_ICONS)) assert.notEqual(iconSvg(icon), fallback, icon);
  assert.equal(PANEL_ICONS.character, 'bust');
});
