import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatLine } from '../backend/live-protocol.ts';
import { createResidentVoice, RESIDENT_VOICE } from './resident-voice.ts';
import type { Ground, ResidentVoiceOptions, VoicePhase } from './resident-voice.ts';

const KEY: string = 'b'.repeat(64);
const LINE: ChatLine = { id: 3, from: 'h1', name: 'Wayfarer', text: 'walk light', at: null, own: false, resident: true, voice: KEY };
const HERE: Ground = { x: 4, z: 5 };

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

function voiceWith(heard: string[], options: Partial<ResidentVoiceOptions>): ReturnType<typeof createResidentVoice> {
  return createResidentVoice({
    serverUrl: 'https://example.test',
    fetch: (): Promise<Response> => Promise.resolve(new Response(new Uint8Array([1]))),
    standsAt: (): Ground | null => HERE,
    speak: (): Promise<void> => Promise.resolve(),
    heard: (line: ChatLine, phase: VoicePhase): void => {
      heard.push(`${String(line.id)}:${phase}`);
    },
    ...options,
  });
}

void test('a spoken line reports when its voice starts and when it ends', async (): Promise<void> => {
  const heard: string[] = [];
  const finish: (() => void)[] = [];
  const voice = voiceWith(heard, {
    speak: (): Promise<void> =>
      new Promise<void>((resolve: () => void): void => {
        finish.push(resolve);
      }),
  });
  voice.handle({ type: 'said', line: LINE });
  await settle();
  assert.deepEqual(heard, ['3:started']);
  finish[0]?.();
  await settle();
  assert.deepEqual(heard, ['3:started', '3:ended']);
});

void test('a clip that does not load, or a line dropped from a full queue, reports a failure', async (): Promise<void> => {
  const heard: string[] = [];
  const failing = voiceWith(heard, { fetch: (): Promise<Response> => Promise.resolve(new Response(null, { status: 404 })) });
  failing.handle({ type: 'said', line: LINE });
  await settle();
  assert.deepEqual(heard, ['3:failed']);
  const queued: string[] = [];
  const held = voiceWith(queued, { speak: (): Promise<void> => new Promise<void>((): void => undefined) });
  for (let line: number = 0; line < RESIDENT_VOICE.waiting + 1; line += 1) held.handle({ type: 'said', line: { ...LINE, id: line } });
  await settle();
  assert.deepEqual(queued, [`${String(RESIDENT_VOICE.waiting)}:failed`, '0:started']);
});
