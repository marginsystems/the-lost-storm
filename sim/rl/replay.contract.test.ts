import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { createArena } from './arena.ts';
import type { Replay } from './replay.ts';
import { playableReplay, recordReplay, replayArena } from './replay.ts';

const CONTENT: Content = loadContent();

void test('a replay recorded under another contract is refused rather than played as a different fight', (): void => {
  const replay: Replay = recordReplay(createArena(CONTENT, { seed: 51, jitter: 0, waves: 1 }), [], 'test');
  assert.equal(playableReplay(replay), replay);
  const old: Replay = { ...replay, fingerprint: '00000000' };
  assert.throws((): unknown => replayArena(CONTENT, old), /recorded under contract 00000000/);
});
