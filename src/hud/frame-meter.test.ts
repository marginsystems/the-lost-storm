import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameMeter, FrameReading } from './frame-meter.ts';
import { createFrameMeter, describeFrames, displayBudget, FRAME_METER } from './frame-meter.ts';

interface FakeClock {
  readonly meter: FrameMeter;
  now: number;
  run(ms: number, count: number): void;
}

function clock(): FakeClock {
  const fake: FakeClock = {
    meter: createFrameMeter(),
    now: 1000,
    run(ms: number, count: number): void {
      for (let index: number = 0; index < count; index += 1) {
        fake.now += ms;
        fake.meter.frame(fake.now);
      }
    },
  };
  fake.meter.frame(fake.now);
  return fake;
}

function read(fake: FakeClock): FrameReading {
  const reading: FrameReading | null = fake.meter.reading(fake.now);
  assert.ok(reading !== null);
  return reading;
}

void test('a steady 60 Hz second reads 60 fps, a 17 ms worst frame and no long frames', (): void => {
  const fake: FakeClock = clock();
  fake.run(1000 / 60, 60);
  const reading: FrameReading = read(fake);
  assert.equal(Math.round(reading.fps), 60);
  assert.equal(Math.round(reading.worstMs), 17);
  assert.equal(reading.longFrames, 0);
  assert.equal(Math.round(reading.budgetMs), 17);
});

void test('one 100 ms hitch stays the worst frame and counts as long for ten seconds, so a glance after it still sees it', (): void => {
  const fake: FakeClock = clock();
  fake.run(1000 / 60, 120);
  fake.run(100, 1);
  fake.run(1000 / 60, 30);
  assert.equal(Math.round(read(fake).worstMs), 100);
  assert.equal(read(fake).longFrames, 1);
  fake.run(1000 / 60, 8 * 60);
  assert.equal(Math.round(read(fake).worstMs), 100);
  assert.equal(read(fake).longFrames, 1);
  fake.run(1000 / 60, 2 * 60);
  assert.equal(Math.round(read(fake).worstMs), 17);
  assert.equal(read(fake).longFrames, 0);
});

void test('a long frame is one over one and a half display frames, on a 120 Hz display as on 60 Hz', (): void => {
  const fake: FakeClock = clock();
  fake.run(1000 / 120, 240);
  fake.run(14, 1);
  fake.run(1000 / 120, 10);
  assert.equal(Math.round(read(fake).budgetMs * 10), Math.round((1000 / 120) * 10));
  assert.equal(read(fake).longFrames, 1);
});

void test('the display budget snaps the fastest frames to a refresh rate, even when most frames run slow', (): void => {
  assert.equal(Math.round(displayBudget([...Array.from({ length: 20 }, (): number => 16.7), ...Array.from({ length: 80 }, (): number => 33.3)])), 17);
  assert.equal(Math.round(displayBudget([])), 17);
  assert.equal(Math.round(displayBudget([6.9, 6.9, 7, 7])), 7);
});

void test('a paused tab leaves no gap in the numbers, and no frames read as nothing', (): void => {
  const fake: FakeClock = clock();
  assert.equal(fake.meter.reading(fake.now), null);
  fake.run(1000 / 60, 60);
  fake.run(FRAME_METER.maxGapMs + 500, 1);
  fake.run(1000 / 60, 60);
  assert.equal(Math.round(read(fake).worstMs), 17);
  assert.equal(read(fake).longFrames, 0);
});

void test('the readout names fps, the worst frame and the long count', (): void => {
  assert.equal(describeFrames({ fps: 59.6, worstMs: 21.4, longFrames: 3, budgetMs: 1000 / 60 }), '60 fps · 21 ms worst · 3 long');
});
