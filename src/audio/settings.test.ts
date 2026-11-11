import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AudioControls, AudioSettings, SettingsStorage } from './settings.ts';
import { createSettingsStore, DEFAULT_SETTINGS, parseSettings } from './settings.ts';

function memory(initial: string | null): SettingsStorage & { saved: string | null; writes: number } {
  const storage = {
    saved: initial,
    writes: 0,
    read(): string | null {
      return storage.saved;
    },
    write(text: string): void {
      storage.saved = text;
      storage.writes += 1;
    },
  };
  return storage;
}

void test('nothing stored or garbage stored gives the defaults', (): void => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{not json'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('42'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"volumes":"loud","muted":"yes"}'), DEFAULT_SETTINGS);
});

void test('stored volumes are kept, clamped, and bad fields fall back one by one', (): void => {
  const settings: AudioSettings = parseSettings('{"volumes":{"master":0.25,"effects":7,"voice":-3,"ambience":"x"},"muted":true}');
  assert.equal(settings.volumes.master, 0.25);
  assert.equal(settings.volumes.effects, 1);
  assert.equal(settings.volumes.voice, 0);
  assert.equal(settings.volumes.ambience, DEFAULT_SETTINGS.volumes.ambience);
  assert.equal(settings.muted, true);
});

void test('changes are saved, clamped, announced once and survive a reload', (): void => {
  const storage = memory(null);
  const controls: AudioControls = createSettingsStore(storage);
  const seen: AudioSettings[] = [];
  controls.subscribe((settings: AudioSettings): void => {
    seen.push(settings);
  });
  controls.setVolume('effects', 0.4);
  controls.setVolume('effects', 0.4);
  controls.setVolume('ambience', 3);
  controls.setMuted(true);
  controls.setMuted(true);
  assert.equal(seen.length, 3);
  assert.equal(storage.writes, 3);
  assert.equal(controls.get().volumes.effects, 0.4);
  assert.equal(controls.get().volumes.ambience, 1);
  assert.equal(controls.get().muted, true);
  const reloaded: AudioControls = createSettingsStore(storage);
  assert.deepEqual(reloaded.get(), controls.get());
});
