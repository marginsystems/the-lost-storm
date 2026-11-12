import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VFX_STYLES } from '../../sim/content/types.ts';
import { CUES, gatherScale, novaLook, shadeOpacity } from './ability-cues.ts';

void test('a nova is drawn by its style, so a blade whirl and a gust never look like a thunderclap', (): void => {
  assert.equal(novaLook('shockwave'), 'shockwave');
  assert.equal(novaLook('slash'), 'whirl');
  assert.equal(novaLook('wind'), 'gust');
  for (const style of VFX_STYLES) assert.ok(['shockwave', 'whirl', 'gust', 'ring'].includes(novaLook(style)));
});

void test('a ground cue closes from wide to tight over the wind-up', (): void => {
  assert.equal(gatherScale(0), CUES.groundFrom);
  assert.equal(gatherScale(1), CUES.groundTo);
  assert.ok(gatherScale(0.5) > gatherScale(0.9));
});

void test('the dark shade under a release rises fast and is gone when its time ends', (): void => {
  assert.equal(shadeOpacity(0), 0);
  assert.ok(shadeOpacity(0.15) > shadeOpacity(0.6));
  assert.ok(shadeOpacity(0.15) <= CUES.shadeDepth);
  assert.equal(shadeOpacity(1), 0);
});
