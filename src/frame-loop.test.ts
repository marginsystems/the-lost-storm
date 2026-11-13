import assert from 'node:assert/strict';
import test from 'node:test';
import type { FrameScheduler } from './frame-loop.ts';
import { runFrames } from './frame-loop.ts';

interface ManualFrames extends FrameScheduler {
  run(now: number): void;
}

function manualFrames(): ManualFrames {
  let queued: ((now: number) => void)[] = [];
  return {
    request(callback: (now: number) => void): void {
      queued.push(callback);
    },
    run(now: number): void {
      const due: ((now: number) => void)[] = queued;
      queued = [];
      for (const callback of due) callback(now);
    },
  };
}

void test('a frame that throws reports the fault once and the next frames still run', (): void => {
  const frames: ManualFrames = manualFrames();
  const ran: number[] = [];
  const faults: unknown[] = [];
  runFrames(
    (now: number): void => {
      ran.push(now);
      if (now === 2 || now === 3) throw new Error(`frame ${now}`);
    },
    (error: unknown): void => {
      faults.push(error);
    },
    frames,
  );
  for (const now of [1, 2, 3, 4]) frames.run(now);
  assert.deepEqual(ran, [1, 2, 3, 4]);
  assert.equal(faults.length, 1);
  assert.ok(faults[0] instanceof Error && faults[0].message === 'frame 2');
});

void test('frames that never throw never report a fault and run once per frame', (): void => {
  const frames: ManualFrames = manualFrames();
  let count: number = 0;
  let faults: number = 0;
  runFrames(
    (): void => {
      count += 1;
    },
    (): void => {
      faults += 1;
    },
    frames,
  );
  for (const now of [1, 2, 3]) frames.run(now);
  assert.equal(count, 3);
  assert.equal(faults, 0);
});
