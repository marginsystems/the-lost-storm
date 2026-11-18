import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { RL } from '../../sim/rl/contract.ts';
import { recordReplay } from '../../sim/rl/replay.ts';
import { createArena } from '../../sim/rl/arena.ts';
import { replayerDone } from '../../sim/rl/replayer.ts';
import type { Watching } from './replay-watch.ts';
import { startWatching, WATCH, watchCaption, watchRequest, watchTicks } from './replay-watch.ts';

const CONTENT: Content = loadContent();

function watching(speed: number): Watching {
  const replay = recordReplay(createArena(CONTENT, { seed: 81, jitter: 0, waves: 1 }), [[0, 0, 0, 0], [1, 0, 0, 0]], 'test');
  return startWatching(CONTENT, JSON.parse(JSON.stringify(replay)), speed);
}

void test('a replay is asked for by path, with an optional clamped speed', (): void => {
  assert.equal(watchRequest(''), null);
  assert.deepEqual(watchRequest('?replay=rl/runs/a.json'), { path: '/rl/runs/a.json', speed: 1 });
  assert.deepEqual(watchRequest('?replay=/a.json&speed=100'), { path: '/a.json', speed: WATCH.maxSpeed });
  assert.deepEqual(watchRequest('?replay=/a.json&speed=fast'), { path: '/a.json', speed: 1 });
});

void test('frame time turns into whole sim ticks at the chosen speed', (): void => {
  const fast: Watching = watching(2);
  const events = watchTicks(fast, RL.tick * 1.5);
  assert.ok(Array.isArray(events));
  assert.equal(fast.replayer.ticks, 3);
  assert.ok(Math.abs(fast.carry) < 1e-9);
});

void test('a replay stops when its actions run out and says how it ended', (): void => {
  const short: Watching = watching(1);
  for (let frame: number = 0; frame < 20; frame += 1) watchTicks(short, RL.tick * RL.ticksPerDecision);
  assert.ok(replayerDone(short.replayer));
  assert.equal(short.replayer.ticks, RL.ticksPerDecision * 2);
  assert.match(watchCaption(short), /waves cleared/);
});
