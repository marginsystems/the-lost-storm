import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../test/backend-support.ts';
import type { FakeTimers } from '../test/backend-support.ts';
import { createTitleAccount, TITLE_ACCOUNT } from './title-account.ts';
import type { AccountPart, TitleAccount, TitleAccountParts } from './title-account.ts';

interface Part extends AccountPart {
  readonly attributes: Set<string>;
}

interface Screen {
  readonly parts: TitleAccountParts;
  readonly classes: Set<string>;
  readonly dataset: Record<string, string | undefined>;
  readonly button: Part;
  readonly line: Part;
  readonly name: Part;
  readonly note: Part;
  readonly timers: FakeTimers;
  readonly view: TitleAccount;
}

function part(): Part {
  const attributes: Set<string> = new Set<string>(['hidden']);
  return {
    textContent: '',
    attributes,
    toggleAttribute: (name: string, force: boolean): boolean => {
      if (force) attributes.add(name);
      else attributes.delete(name);
      return force;
    },
  };
}

function screen(): Screen {
  const classes: Set<string> = new Set<string>();
  const dataset: Record<string, string | undefined> = {};
  const [button, line, name, note]: readonly [Part, Part, Part, Part] = [part(), part(), part(), part()];
  const parts: TitleAccountParts = {
    root: {
      dataset,
      classList: {
        add: (value: string): void => {
          classes.add(value);
        },
        remove: (value: string): void => {
          classes.delete(value);
        },
      },
    },
    button,
    line,
    name,
    note,
  };
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  return { parts, classes, dataset, button, line, name, note, timers, view: createTitleAccount(parts, timers.timers) };
}

function visible(target: Part): boolean {
  return !target.attributes.has('hidden');
}

void test('a hidden account shows nothing and does not fade anything in', (): void => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'hidden' }, '');
  assert.deepEqual([visible(ui.button), visible(ui.line), visible(ui.note)], [false, false, false]);
  assert.ok(!ui.classes.has('shown'));
  assert.equal(ui.dataset['state'], 'hidden');
});

void test('a guest sees the sign-in button and nothing else', (): void => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'guest' }, '');
  assert.deepEqual([visible(ui.button), visible(ui.line), visible(ui.note)], [true, false, false]);
  assert.ok(ui.classes.has('shown'));
  assert.equal(ui.dataset['state'], 'guest');
});

void test('a signed-in player sees their name and the sign-out line, with a fallback when Google gave no name', (): void => {
  const named: Screen = screen();
  named.view.show({ kind: 'signed-in', name: 'Ada Stormborn' }, '');
  assert.deepEqual([visible(named.button), visible(named.line)], [false, true]);
  assert.equal(named.name.textContent, 'Ada Stormborn');
  const unnamed: Screen = screen();
  unnamed.view.show({ kind: 'signed-in', name: null }, '');
  assert.equal(unnamed.name.textContent, TITLE_ACCOUNT.fallbackName);
});

void test('a change of state fades out first and swaps the content only after the fade', async (): Promise<void> => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'guest' }, '');
  ui.view.show({ kind: 'signed-in', name: 'Ada' }, '');
  assert.ok(!ui.classes.has('shown'));
  assert.deepEqual([visible(ui.button), visible(ui.line)], [true, false]);
  await ui.timers.advance(TITLE_ACCOUNT.swapMs - 1);
  assert.deepEqual([visible(ui.button), visible(ui.line)], [true, false]);
  await ui.timers.advance(1);
  assert.deepEqual([visible(ui.button), visible(ui.line)], [false, true]);
  assert.equal(ui.name.textContent, 'Ada');
  assert.ok(ui.classes.has('shown'));
});

void test('a note appears with the same fade and is cleared the same way', async (): Promise<void> => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'guest' }, '');
  ui.view.show({ kind: 'guest' }, 'Sign-in did not work. Try again.');
  assert.ok(!ui.classes.has('shown'));
  assert.equal(visible(ui.note), false);
  await ui.timers.advance(TITLE_ACCOUNT.swapMs);
  assert.equal(ui.note.textContent, 'Sign-in did not work. Try again.');
  assert.equal(visible(ui.note), true);
  assert.equal(visible(ui.button), true);
  ui.view.show({ kind: 'guest' }, '');
  await ui.timers.advance(TITLE_ACCOUNT.swapMs);
  assert.equal(visible(ui.note), false);
});

void test('showing the same thing again does nothing, and only the last of several quick changes lands', async (): Promise<void> => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'signed-in', name: 'Ada' }, '');
  ui.view.show({ kind: 'signed-in', name: 'Ada' }, '');
  assert.ok(ui.classes.has('shown'));
  assert.equal(ui.timers.pending(), 0);
  ui.view.show({ kind: 'guest' }, '');
  ui.view.show({ kind: 'hidden' }, '');
  ui.view.show({ kind: 'signed-in', name: 'Bran' }, '');
  assert.equal(ui.timers.pending(), 1);
  await ui.timers.advance(TITLE_ACCOUNT.swapMs);
  assert.equal(ui.name.textContent, 'Bran');
  assert.deepEqual([visible(ui.button), visible(ui.line)], [false, true]);
});

void test('going from visible to hidden fades out and stays out', async (): Promise<void> => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'guest' }, '');
  ui.view.show({ kind: 'hidden' }, '');
  await ui.timers.advance(TITLE_ACCOUNT.swapMs);
  assert.ok(!ui.classes.has('shown'));
  assert.equal(visible(ui.button), false);
});
