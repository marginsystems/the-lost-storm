import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { SpokenClip, VoiceLines } from './voice-lines.ts';
import { createVoiceLines, VOICE_LINES } from './voice-lines.ts';

interface Gate<T> {
  readonly promise: Promise<T>;
  open(value: T): void;
}

function gate<T>(): Gate<T> {
  const waiting: ((value: T) => void)[] = [];
  const promise: Promise<T> = new Promise<T>((resolve: (value: T) => void): void => {
    waiting.push(resolve);
  });
  return {
    promise,
    open(value: T): void {
      for (const resolve of waiting) resolve(value);
    },
  };
}

interface FakeClip extends SpokenClip {
  readonly path: string;
  readonly fades: number[];
  finish(): void;
}

interface Rig {
  readonly lines: VoiceLines;
  readonly asked: string[];
  readonly loaded: string[];
  readonly playing: FakeClip[];
  readonly loads: Map<string, Gate<string | null>>;
}

function fakeClip(path: string): FakeClip {
  const done: Gate<void> = gate<void>();
  const fades: number[] = [];
  return {
    path,
    fades,
    ended: done.promise,
    fadeOut(seconds: number): void {
      fades.push(seconds);
      done.open();
    },
    finish(): void {
      done.open();
    },
  };
}

function rig(manifest: Readonly<Record<string, string>>, held: readonly string[] = []): Rig {
  const asked: string[] = [];
  const loaded: string[] = [];
  const playing: FakeClip[] = [];
  const loads: Map<string, Gate<string | null>> = new Map<string, Gate<string | null>>();
  for (const path of held) loads.set(path, gate<string | null>());
  const lines: VoiceLines = createVoiceLines<string>({
    find: (clipId: string): Promise<string | null> => {
      asked.push(clipId);
      return Promise.resolve(Object.hasOwn(manifest, clipId) ? (manifest[clipId] ?? null) : null);
    },
    load: (path: string): Promise<string | null> => {
      loaded.push(path);
      return loads.get(path)?.promise ?? Promise.resolve(path);
    },
    play: (clip: string): SpokenClip => {
      const spoken: FakeClip = fakeClip(clip);
      playing.push(spoken);
      return spoken;
    },
  });
  return { lines, asked, loaded, playing, loads };
}

function settle(turns: number = 10): Promise<void> {
  return turns === 0 ? Promise.resolve() : Promise.resolve().then((): Promise<void> => settle(turns - 1));
}

const MANIFEST: Readonly<Record<string, string>> = {
  warden_guide_road: 'voice/warden_guide/warden_guide_road.mp3',
  warden_guide_lesson: 'voice/warden_guide/warden_guide_lesson.mp3',
  warden_trader_goods: 'voice/warden_trader/warden_trader_goods.mp3',
};

void test('a line plays the clip the manifest names for its id, once', async (): Promise<void> => {
  const { lines, asked, playing } = rig(MANIFEST);
  void lines.say('warden_guide', 'warden_guide_road');
  await settle();
  assert.deepEqual(asked, ['warden_guide_road']);
  assert.deepEqual(playing.map((clip: FakeClip): string => clip.path), ['voice/warden_guide/warden_guide_road.mp3']);
  assert.deepEqual(lines.speaking(), ['warden_guide']);
});

void test('a line with no clip loads nothing, plays nothing and stays quiet', async (): Promise<void> => {
  const { lines, loaded, playing } = rig(MANIFEST);
  await lines.say('warden_lookout', 'warden_lookout_ahead');
  assert.deepEqual(loaded, []);
  assert.deepEqual(playing, []);
  assert.deepEqual(lines.speaking(), []);
});

void test('a clip that fails to load plays nothing', async (): Promise<void> => {
  const { lines, loads, playing } = rig(MANIFEST, ['voice/warden_guide/warden_guide_road.mp3']);
  const said: Promise<void> = lines.say('warden_guide', 'warden_guide_road');
  await settle();
  loads.get('voice/warden_guide/warden_guide_road.mp3')?.open(null);
  await said;
  assert.deepEqual(playing, []);
});

void test('a second line from the same speaker fades the first out with the short ease and plays alone', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  void lines.say('warden_guide', 'warden_guide_road');
  await settle();
  void lines.say('warden_guide', 'warden_guide_lesson');
  await settle();
  const first: FakeClip = must(playing[0], 'first line');
  const second: FakeClip = must(playing[1], 'second line');
  assert.deepEqual(first.fades, [VOICE_LINES.fadeSeconds]);
  assert.deepEqual(second.fades, []);
  assert.equal(second.path, 'voice/warden_guide/warden_guide_lesson.mp3');
  assert.deepEqual(lines.speaking(), ['warden_guide']);
});

void test('lines from different speakers do not cut each other', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  void lines.say('warden_guide', 'warden_guide_road');
  void lines.say('warden_trader', 'warden_trader_goods');
  await settle();
  assert.equal(playing.length, 2);
  assert.deepEqual(playing.map((clip: FakeClip): number => clip.fades.length), [0, 0]);
  assert.deepEqual(lines.speaking(), ['warden_guide', 'warden_trader']);
});

void test('a line still loading when the speaker moves on never starts', async (): Promise<void> => {
  const { lines, loads, playing } = rig(MANIFEST, ['voice/warden_guide/warden_guide_road.mp3']);
  void lines.say('warden_guide', 'warden_guide_road');
  await settle();
  void lines.say('warden_guide', 'warden_guide_lesson');
  await settle();
  loads.get('voice/warden_guide/warden_guide_road.mp3')?.open('voice/warden_guide/warden_guide_road.mp3');
  await settle();
  assert.deepEqual(playing.map((clip: FakeClip): string => clip.path), ['voice/warden_guide/warden_guide_lesson.mp3']);
});

void test('hush fades every speaker and drops lines still loading', async (): Promise<void> => {
  const { lines, loads, playing } = rig(MANIFEST, ['voice/warden_trader/warden_trader_goods.mp3']);
  void lines.say('warden_guide', 'warden_guide_road');
  void lines.say('warden_trader', 'warden_trader_goods');
  await settle();
  lines.hush();
  loads.get('voice/warden_trader/warden_trader_goods.mp3')?.open('voice/warden_trader/warden_trader_goods.mp3');
  await settle();
  assert.deepEqual(playing.map((clip: FakeClip): string => clip.path), ['voice/warden_guide/warden_guide_road.mp3']);
  assert.deepEqual(playing[0]?.fades, [VOICE_LINES.fadeSeconds]);
  assert.deepEqual(lines.speaking(), []);
});

void test('a line that ends on its own leaves its speaker quiet', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  const said: Promise<void> = lines.say('warden_guide', 'warden_guide_road');
  await settle();
  playing[0]?.finish();
  await said;
  assert.deepEqual(lines.speaking(), []);
  assert.deepEqual(playing[0]?.fades, []);
});
