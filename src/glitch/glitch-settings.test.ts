import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KeyValueStore } from '../backend/backend.ts';
import type { GlitchSettings, SettingStep } from './glitch-settings.ts';
import { createGlitchSettings, DEFAULT_GLITCH_SETTINGS, GLITCH_SETTINGS_KEY, readGlitchSettings, tearIsGentle, settingStep } from './glitch-settings.ts';

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
  assert.deepEqual(readGlitchSettings('{"glitches":false,"reduceFlashes":true,"gentleSeam":true}'), { glitches: false, reduceFlashes: true });
});

void test('a stored gentle seam from before the setting went carries over as softened flashes', (): void => {
  assert.deepEqual(readGlitchSettings('{"glitches":true,"reduceFlashes":false,"gentleSeam":true}'), { glitches: true, reduceFlashes: true });
  assert.deepEqual(readGlitchSettings('{"glitches":true,"reduceFlashes":false,"gentleSeam":false}'), { glitches: true, reduceFlashes: false });
  const store = memory();
  store.write(GLITCH_SETTINGS_KEY, '{"glitches":true,"reduceFlashes":false,"gentleSeam":true}');
  const settings = createGlitchSettings(store);
  settings.set({ glitches: false });
  assert.equal(store.read(GLITCH_SETTINGS_KEY), '{"glitches":false,"reduceFlashes":true}');
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

void test('a setting the world has not taken is sent once per world step until it takes', (): void => {
  const first: SettingStep = settingStep(true, false, null, 1);
  assert.equal(first.send, true);
  assert.equal(settingStep(true, false, first.asked, 1).send, false);
  const dropped: SettingStep = settingStep(true, false, first.asked, 1.5);
  assert.equal(dropped.send, true);
  assert.deepEqual(settingStep(false, false, dropped.asked, 2), { send: false, asked: null });
});

void test('the portal tear is gentle when the system asks for less motion or flashes are softened', (): void => {
  const settings = createGlitchSettings(memory());
  assert.equal(tearIsGentle(settings.get(), false), false);
  assert.equal(tearIsGentle(settings.get(), true), true);
  settings.set({ reduceFlashes: true });
  assert.equal(tearIsGentle(settings.get(), false), true);
});
