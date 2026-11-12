import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { DESK_WORDS } from '../../sim/content/hints.ts';
import { alternate, openWith, promptText, use } from './prompts.ts';

void test('a prompt says click on a desk and tap on a phone', (): void => {
  assert.equal(promptText(false, use('equip'), alternate('drop')), 'Click to equip · Right click to drop');
  assert.equal(promptText(true, use('equip'), alternate('drop')), 'Tap to equip');
  assert.equal(promptText(true, use('close')), 'Tap to close');
});

void test('opening a panel names the bound key on a desk and the top bar on a phone', (): void => {
  assert.equal(openWith(false, 'map', 'M'), 'Open the map with M');
  assert.equal(openWith(true, 'map', 'M'), 'Open the map from the top bar');
  assert.ok(!DESK_WORDS.test(openWith(true, 'map', 'M')));
});

void test('no screen writes a click or tap prompt of its own', (): void => {
  const folders: readonly string[] = ['src/hud', 'src/opening', 'src/mobile'];
  for (const folder of folders) {
    for (const name of readdirSync(folder).filter((file: string): boolean => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'prompts.ts')) {
      const source: string = readFileSync(`${folder}/${name}`, 'utf8');
      assert.ok(!/['`"](Click|Tap|Right click) (to|the|an?)\b/.test(source), `${folder}/${name} writes its own click or tap prompt`);
    }
  }
});
