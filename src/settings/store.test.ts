import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import type { SlotDefault } from './bindings.ts';
import { slotName } from './bindings.ts';
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
  store.setLensWater(false);
  assert.equal(store.rebind('inventory', 'KeyB').kind, 'ok');
  const again: SettingsStore = createSettingsStore(storage, SLOTS, { flasks: 2, ladder: true });
  assert.equal(again.get().graphics.quality, 'low');
  assert.equal(again.get().graphics.showFps, true);
  assert.equal(again.get().graphics.lensWater, false);
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

void test('the shipped skill bar and every panel, flask and ladder action share one table that persists', (): void => {
  const content = loadContent();
  const slots: readonly SlotDefault[] = content.player.skillBar.map((entry, slot: number): SlotDefault => ({ name: slotName(slot), bindings: entry.bindings }));
  const build = { flasks: content.flasks.length, ladder: true };
  const storage = memory(null);
  const store: SettingsStore = createSettingsStore(storage, slots, build);
  const ids: ReadonlySet<string> = new Set<string>(store.keys().table.map((def): string => def.id));
  for (const id of ['inventory', 'character', 'tree', 'map', 'minimap', 'ladder', 'pause', 'flask1', 'skill:1', 'skill:2', 'skill:3']) assert.ok(ids.has(id), id);
  const codes: readonly string[] = store.keys().table.flatMap((def): readonly string[] => def.defaults);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(store.rebind('inventory', 'KeyB').kind, 'ok');
  assert.equal(store.rebind('ladder', 'KeyN').kind, 'ok');
  assert.equal(store.rebind('flask1', 'KeyV').kind, 'ok');
  assert.equal(store.rebind('skill:1', 'KeyF').kind, 'ok');
  const again: SettingsStore = createSettingsStore(storage, slots, build);
  assert.equal(again.keys().actionOf('KeyB'), 'inventory');
  assert.equal(again.keys().actionOf('KeyN'), 'ladder');
  assert.equal(again.keys().actionOf('KeyV'), 'flask1');
  assert.equal(again.keys().actionOf('KeyF'), 'skill:1');
});

void test('one stale colliding entry does not discard the other saved rebindings', (): void => {
  const saved: string = JSON.stringify({ graphics: { quality: 'low', showFps: false }, controls: { inventory: ['KeyB'], character: ['KeyB'], map: ['KeyN'] } });
  const store: SettingsStore = createSettingsStore(memory(saved), SLOTS, { flasks: 2, ladder: true });
  assert.equal(store.keys().actionOf('KeyB'), 'inventory');
  assert.equal(store.keys().actionOf('KeyN'), 'map');
  assert.equal(store.keys().actionOf('KeyC'), 'character');
});

void test('a failed write keeps the change in memory and is reported', (): void => {
  const failing: KeyValueStore = { read: (): string | null => null, write: (): boolean => false, remove: (): void => undefined };
  const store: SettingsStore = createSettingsStore(failing, SLOTS, { flasks: 2, ladder: true });
  assert.equal(store.saved(), true);
  store.setQuality('low');
  assert.equal(store.get().graphics.quality, 'low');
  assert.equal(store.saved(), false);
});
