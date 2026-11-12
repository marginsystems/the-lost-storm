import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FramePacer } from './paced-work.ts';
import { workPaced } from './paced-work.ts';

interface FakePacer extends FramePacer {
  readonly frames: number[];
  spend(ms: number): void;
}

function fakePacer(): FakePacer {
  let clock: number = 0;
  let frame: number = 0;
  const frames: number[] = [];
  return {
    frames,
    now(): number {
      return clock;
    },
    next(): Promise<void> {
      frame += 1;
      clock += 16;
      return Promise.resolve();
    },
    spend(ms: number): void {
      clock += ms;
      frames.push(frame);
    },
  };
}

void test('paced work fills each frame up to its budget and carries the rest to the next frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  await workPaced([1, 2, 3, 4, 5, 6, 7], (): void => pacer.spend(2), pacer, 6);
  assert.deepEqual(pacer.frames, [0, 0, 0, 1, 1, 1, 2]);
});

void test('one item longer than the budget still runs, alone in its frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  await workPaced([10, 10, 1], (ms: number): void => pacer.spend(ms), pacer, 6);
  assert.deepEqual(pacer.frames, [0, 1, 2]);
});

void test('nothing to do waits for no frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  let waited: number = 0;
  await workPaced([], (): void => undefined, { now: (): number => pacer.now(), next: (): Promise<void> => { waited += 1; return pacer.next(); } }, 6);
  assert.equal(waited, 0);
});

void test('an unlimited budget does everything in the first frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  await workPaced([5, 5, 5, 5], (ms: number): void => pacer.spend(ms), pacer, Number.POSITIVE_INFINITY);
  assert.deepEqual(pacer.frames, [0, 0, 0, 0]);
});
