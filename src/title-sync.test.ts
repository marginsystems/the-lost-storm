import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../test/backend-support.ts';
import type { FakeTimers } from '../test/backend-support.ts';
import type { BackendState } from './backend/backend.ts';
import { createTitleSync, followSync } from './title-sync.ts';
import type { TitleLine } from './title-sync.ts';

interface Line extends TitleLine {
  readonly classes: Set<string>;
}

function line(): Line {
  const classes: Set<string> = new Set<string>();
  return {
    textContent: '',
    dataset: {},
    classes,
    classList: {
      add: (name: string): void => {
        classes.add(name);
      },
      remove: (name: string): void => {
        classes.delete(name);
      },
    },
  };
}

function setup(): { readonly element: Line; readonly timers: FakeTimers; readonly show: ReturnType<typeof createTitleSync> } {
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  const element: Line = line();
  return { element, timers, show: createTitleSync(element, timers.timers) };
}

void test('the first state is shown at once and fades in', (): void => {
  const { element, show } = setup();
  show('offline');
  assert.equal(element.textContent, 'Offline');
  assert.equal(element.dataset['state'], 'offline');
  assert.ok(element.classes.has('shown'));
});

void test('a change hides the line first and swaps the text only after the fade', async (): Promise<void> => {
  const { element, timers, show } = setup();
  show('offline');
  show('cloud');
  assert.ok(!element.classes.has('shown'));
  assert.equal(element.textContent, 'Offline');
  await timers.advance(279);
  assert.equal(element.textContent, 'Offline');
  await timers.advance(1);
  assert.equal(element.textContent, 'Cloud save on');
  assert.equal(element.dataset['state'], 'cloud');
  assert.ok(element.classes.has('shown'));
});

void test('asking for the state that is already showing does nothing', (): void => {
  const { element, timers, show } = setup();
  show('cloud');
  show('cloud');
  assert.equal(timers.pending(), 0);
  assert.ok(element.classes.has('shown'));
});

void test('a quick flip away and back ends on the right label, never the one in between', async (): Promise<void> => {
  const { element, timers, show } = setup();
  show('offline');
  show('cloud');
  await timers.advance(100);
  show('offline');
  await timers.advance(1000);
  assert.equal(element.textContent, 'Offline');
  assert.equal(element.dataset['state'], 'offline');
  assert.ok(element.classes.has('shown'));
  assert.equal(timers.pending(), 0);
});

void test('the sync line follows the backend only when a server is configured', (): void => {
  const shown: BackendState[] = [];
  const listeners: ((state: BackendState) => void)[] = [];
  const backend: { state(): BackendState; subscribe(listener: (state: BackendState) => void): void } = { state: (): BackendState => 'offline', subscribe: (listener: (state: BackendState) => void): void => void listeners.push(listener) };
  followSync(backend, (state: BackendState): void => void shown.push(state), false);
  assert.equal(shown.length, 0);
  assert.equal(listeners.length, 0);
  followSync(backend, (state: BackendState): void => void shown.push(state), true);
  assert.deepEqual(shown, ['offline']);
  assert.equal(listeners.length, 1);
});
