import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KeyValueStore } from '../backend/backend.ts';
import type { GlitchSettings } from './glitch-settings.ts';
import { createGlitchSettings, DEFAULT_GLITCH_SETTINGS, GLITCH_SETTINGS_KEY, readGlitchSettings } from './glitch-settings.ts';

function memory(): KeyValueStore & { readonly data: Map<string, string> } {
  const data: Map<string, string> = new Map<string, string>();
  return {
    data,
    read: (key: string): string | null => data.get(key) ?? null,
    write: (key: string, value: string): boolean => {
      data.set(key, value);
      return true;
    },
    remove: (key: string): void => {
      data.delete(key);
    },
  };
}

void test('glitches are on and flashes full by default, and broken text falls back to that', (): void => {
  assert.deepEqual(readGlitchSettings(null), DEFAULT_GLITCH_SETTINGS);
  assert.deepEqual(readGlitchSettings('{nope'), DEFAULT_GLITCH_SETTINGS);
  assert.deepEqual(readGlitchSettings('{"glitches":"no","reduceFlashes":true}'), { glitches: true, reduceFlashes: true });
});

void test('a change is kept, stored and told to every listener', (): void => {
  const store = memory();
  const settings = createGlitchSettings(store);
  const heard: GlitchSettings[] = [];
  settings.subscribe((next: GlitchSettings): void => {
    heard.push(next);
  });
  settings.set({ glitches: false });
  assert.deepEqual(settings.get(), { glitches: false, reduceFlashes: false });
  assert.deepEqual(heard, [{ glitches: false, reduceFlashes: false }]);
  assert.deepEqual(createGlitchSettings(store).get(), { glitches: false, reduceFlashes: false });
  assert.equal(store.data.has(GLITCH_SETTINGS_KEY), true);
});
