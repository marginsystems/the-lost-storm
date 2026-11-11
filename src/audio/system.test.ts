import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { SoundCue } from '../../sim/audio.ts';
import type { ZoneAmbience } from '../../sim/content/audio.ts';
import { CENTRE } from './mix.ts';
import type { AudioControls } from './settings.ts';
import { createSettingsStore } from './settings.ts';
import type { AudioSystem, Trigger } from './system.ts';
import { createAudioSystem } from './system.ts';

const CUE: SoundCue = { sound: 'bone_hit', volume: 0.9, maxVoices: 2, cooldown: 0, position: null };
const ZONE: ZoneAmbience = { loops: [{ sound: 'ambience_wind_fort', volume: 0.8 }], stingers: [{ sound: 'thunder_distant', volume: 0.7, minDelay: 1, maxDelay: 2 }] };

function controls(): AudioControls {
  return createSettingsStore({
    read: (): string | null => null,
    write: (): void => undefined,
  });
}

function build(base: string | null, clock: () => number = (): number => 0): AudioSystem {
  return createAudioSystem({ base, controls: controls(), random: (): number => 0.5, clock });
}

async function withFetchSpy(run: (requests: string[]) => Promise<void>): Promise<void> {
  const original: typeof fetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (input: string | URL | Request): Promise<Response> => {
    requests.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return Promise.reject(new Error('no network in tests'));
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = original;
  }
}

void test('with no asset base nothing is requested, nothing throws and nothing is configured', async (): Promise<void> => {
  await withFetchSpy(async (requests: string[]): Promise<void> => {
    const system: AudioSystem = build(null);
    assert.equal(system.configured, false);
    system.unlock();
    system.play(CUE, CENTRE);
    system.startAmbience(ZONE);
    system.warm(['bone_hit']);
    system.update(10);
    system.stopAmbience();
    await system.playVoice('anything');
    assert.deepEqual(requests, []);
  });
});

void test('triggers are still announced without assets, so a clone can be checked from its log', (): void => {
  const system: AudioSystem = build(null);
  const seen: Trigger[] = [];
  system.onTrigger((trigger: Trigger): void => {
    seen.push(trigger);
  });
  system.play(CUE, { gain: 0.5, pan: -0.25 });
  assert.equal(seen.length, 1);
  const first: Trigger = must(seen[0], 'trigger');
  assert.equal(first.sound, 'bone_hit');
  assert.equal(first.gain, 0.5);
  assert.equal(first.pan, -0.25);
});

void test('the per-sound cap and cooldown apply before anything is announced', (): void => {
  let now: number = 0;
  const system: AudioSystem = build(null, (): number => now);
  const seen: string[] = [];
  system.onTrigger((trigger: Trigger): void => {
    seen.push(trigger.sound);
  });
  const spaced: SoundCue = { sound: 'monsters_rising', volume: 0.7, maxVoices: 4, cooldown: 4, position: null };
  system.play(spaced, CENTRE);
  system.play(spaced, CENTRE);
  now = 4;
  system.play(spaced, CENTRE);
  assert.deepEqual(seen, ['monsters_rising', 'monsters_rising']);
});

void test('stingers fire on their timer and nothing fires before it', (): void => {
  const system: AudioSystem = build(null);
  const seen: string[] = [];
  system.onTrigger((trigger: Trigger): void => {
    seen.push(trigger.sound);
  });
  system.startAmbience(ZONE);
  system.update(1);
  assert.deepEqual(seen, []);
  system.update(0.6);
  assert.deepEqual(seen, ['thunder_distant']);
  system.stopAmbience();
  system.update(60);
  assert.deepEqual(seen, ['thunder_distant']);
});

void test('a base with no Web Audio available stays silent and requests nothing', async (): Promise<void> => {
  await withFetchSpy(async (requests: string[]): Promise<void> => {
    const system: AudioSystem = build('http://localhost:5210/');
    assert.equal(system.configured, true);
    system.unlock();
    system.play(CUE, CENTRE);
    system.warm(['bone_hit']);
    system.update(30);
    await system.playVoice('greeting');
    assert.deepEqual(requests, []);
  });
});
