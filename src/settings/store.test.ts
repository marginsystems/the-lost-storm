import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KeyValueStore } from '../backend/backend.ts';
import type { SlotDefault } from './bindings.ts';
import { SETTINGS_KEY } from './settings.ts';
import type { SettingsStore } from './store.ts';
import { createSettingsStore } from './store.ts';

const SLOTS: readonly SlotDefault[] = [
  { name: 'Cleave', bindings: ['mouse_left'] },
  { name: 'Thunderclap', bindings: ['KeyQ'] },
];

function memory(initial: string | null): KeyValueStore & { readonly data: Map<string, string> } {
  const data: Map<string, string> = new Map<string, string>();
  if (initial !== null) data.set(SETTINGS_KEY, initial);
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

void test('changes persist and read back in a new store', (): void => {
  const storage = memory(null);
  const store: SettingsStore = createSettingsStore(storage, SLOTS, { flasks: 2, ladder: true });
  store.setQuality('low');
  store.setShowFps(true);
  assert.equal(store.rebind('inventory', 'KeyB').kind, 'ok');
  const again: SettingsStore = createSettingsStore(storage, SLOTS, { flasks: 2, ladder: true });
  assert.equal(again.get().graphics.quality, 'low');
  assert.equal(again.get().graphics.showFps, true);
  assert.equal(again.keys().actionOf('KeyB'), 'inventory');
});

void test('listeners hear every change once and a repeat is silent', (): void => {
  const store: SettingsStore = createSettingsStore(memory(null), SLOTS, { flasks: 2, ladder: true });
  let heard = 0;
  store.subscribe((): void => {
    heard += 1;
  });
  store.setQuality('medium');
  store.setQuality('medium');
  assert.equal(heard, 1);
});

void test('a refused rebind changes nothing and writes nothing', (): void => {
  const storage = memory(null);
  const store: SettingsStore = createSettingsStore(storage, SLOTS, { flasks: 2, ladder: true });
  assert.equal(store.rebind('inventory', 'KeyQ').kind, 'conflict');
  assert.equal(store.keys().actionOf('KeyI'), 'inventory');
  assert.equal(storage.data.size, 0);
});

void test('reset returns every key to its default', (): void => {
  const store: SettingsStore = createSettingsStore(memory(null), SLOTS, { flasks: 2, ladder: true });
  store.rebind('inventory', 'KeyB');
  store.resetControls();
  assert.equal(store.keys().actionOf('KeyI'), 'inventory');
  assert.equal(store.keys().actionOf('KeyB'), null);
});

void test('the preset follows the quality', (): void => {
  const store: SettingsStore = createSettingsStore(memory(null), SLOTS, { flasks: 2, ladder: true });
  store.setQuality('low');
  assert.equal(store.preset().shadows, false);
});
