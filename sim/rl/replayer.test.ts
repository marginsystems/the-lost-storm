import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { createRng } from '../rng.ts';
import type { Arena } from './arena.ts';
import { arenaRunning, createArena } from './arena.ts';
import { ACTION_HEADS } from './contract.ts';
import type { Replay } from './replay.ts';
import { actionFrom, playStep, recordReplay, replayArena } from './replay.ts';
import type { Replayer } from './replayer.ts';
import { createReplayer, replayerDone, replayTick } from './replayer.ts';

const CONTENT: Content = loadContent();
const STEPS: number = 150;
const TICK_LIMIT: number = 10000;

function recorded(seed: number): Replay {
  const arena: Arena = createArena(CONTENT, { seed, jitter: 0.2, waves: 2 });
  const rng = createRng(seed);
  const actions: number[][] = [];
  for (let step: number = 0; step < STEPS && arenaRunning(arena); step += 1) {
    const list: number[] = ACTION_HEADS.map((choices: number): number => rng.int(0, choices - 1));
    actions.push(list);
    playStep(arena, actionFrom(list));
  }
  return recordReplay(arena, actions, 'test');
}

void test('replaying tick by tick lands on the same fight as replaying decision by decision', (): void => {
  const replay: Replay = recorded(71);
  const whole: Arena = replayArena(CONTENT, replay);
  const replayer: Replayer = createReplayer(CONTENT, replay);
  for (let tick: number = 0; tick < TICK_LIMIT && !replayerDone(replayer); tick += 1) replayTick(replayer);
  assert.ok(replayerDone(replayer));
  assert.equal(replayer.arena.world.time, whole.world.time);
  assert.deepEqual(replayer.arena.world.player.pos, whole.world.player.pos);
  assert.equal(replayer.arena.world.player.life, whole.world.player.life);
  assert.equal(replayer.arena.outcome, whole.outcome);
  assert.deepEqual(replayTick(replayer), []);
});
