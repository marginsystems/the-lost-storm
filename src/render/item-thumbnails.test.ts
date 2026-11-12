import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Timers } from '../backend/backend.ts';
import { oneAtATime } from './item-thumbnails.ts';

interface ManualTimers extends Timers {
  readonly due: (() => void)[];
}

function manualTimers(): ManualTimers {
  const due: (() => void)[] = [];
  return {
    due,
    after(_ms: number, task: () => void): () => void {
      due.push(task);
      return (): void => undefined;
    },
  };
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

async function fireNext(timers: ManualTimers): Promise<void> {
  await settle();
  const task: (() => void) | undefined = timers.due.shift();
  assert.ok(task !== undefined, 'no timer was waiting');
  task();
  await settle();
}

void test('each shot waits for its own timer before it runs', async (): Promise<void> => {
  const timers: ManualTimers = manualTimers();
  const done: string[] = [];
  const all: Promise<void> = oneAtATime(['sword', 'coat', 'hood'], timers, 0, (item: string): Promise<void> => {
    done.push(item);
    return Promise.resolve();
  });
  await settle();
  assert.deepEqual(done, []);
  await fireNext(timers);
  assert.deepEqual(done, ['sword']);
  await fireNext(timers);
  assert.deepEqual(done, ['sword', 'coat']);
  await fireNext(timers);
  await all;
  assert.deepEqual(done, ['sword', 'coat', 'hood']);
});

void test('the next shot waits until the one before it has finished', async (): Promise<void> => {
  const timers: ManualTimers = manualTimers();
  const finishers: (() => void)[] = [];
  const started: string[] = [];
  const all: Promise<void> = oneAtATime(['sword', 'coat'], timers, 0, (item: string): Promise<void> => {
    started.push(item);
    return new Promise<void>((resolve: () => void): void => {
      finishers.push(resolve);
    });
  });
  await fireNext(timers);
  assert.deepEqual(started, ['sword']);
  assert.equal(timers.due.length, 0);
  for (const finish of finishers.splice(0)) finish();
  await fireNext(timers);
  assert.deepEqual(started, ['sword', 'coat']);
  for (const finish of finishers.splice(0)) finish();
  await all;
});
