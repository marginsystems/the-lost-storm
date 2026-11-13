import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  readonly email: Part;
  readonly line: Part;
  readonly method: Part;
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
  const [button, email, line, method, name, note]: readonly [Part, Part, Part, Part, Part, Part] = [part(), part(), part(), part(), part(), part()];
  const parts: TitleAccountParts = {
    root: {
      dataset,
      classList: {
        add: (...values: string[]): void => {
          for (const value of values) classes.add(value);
        },
        remove: (...values: string[]): void => {
          for (const value of values) classes.delete(value);
        },
      },
    },
    button,
    email,
    line,
    method,
    name,
    note,
  };
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  return { parts, classes, dataset, button, email, line, method, name, note, timers, view: createTitleAccount(parts, timers.timers) };
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
  ui.view.show({ kind: 'guest', google: true, email: false }, '');
  assert.deepEqual([visible(ui.button), visible(ui.line), visible(ui.note)], [true, false, false]);
  assert.ok(ui.classes.has('shown'));
  assert.equal(ui.dataset['state'], 'guest');
});

void test('a signed-in player sees their name and the sign-out line, with a fallback when Google gave no name', (): void => {
  const named: Screen = screen();
  named.view.show({ kind: 'signed-in', method: 'google', name: 'Ada Stormborn' }, '');
  assert.deepEqual([visible(named.button), visible(named.line)], [false, true]);
  assert.equal(named.name.textContent, 'Ada Stormborn');
  const unnamed: Screen = screen();
  unnamed.view.show({ kind: 'signed-in', method: 'google', name: null }, '');
  assert.equal(unnamed.name.textContent, TITLE_ACCOUNT.fallbackName);
});

void test('a change of state fades out first and swaps the content only after the fade', async (): Promise<void> => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'guest', google: true, email: false }, '');
  ui.view.show({ kind: 'signed-in', method: 'google', name: 'Ada' }, '');
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
  ui.view.show({ kind: 'guest', google: true, email: false }, '');
  ui.view.show({ kind: 'guest', google: true, email: false }, 'Sign-in did not work. Try again.');
  assert.ok(!ui.classes.has('shown'));
  assert.equal(visible(ui.note), false);
  await ui.timers.advance(TITLE_ACCOUNT.swapMs);
  assert.equal(ui.note.textContent, 'Sign-in did not work. Try again.');
  assert.equal(visible(ui.note), true);
  assert.equal(visible(ui.button), true);
  ui.view.show({ kind: 'guest', google: true, email: false }, '');
  await ui.timers.advance(TITLE_ACCOUNT.swapMs);
  assert.equal(visible(ui.note), false);
});

void test('showing the same thing again does nothing, and only the last of several quick changes lands', async (): Promise<void> => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'signed-in', method: 'google', name: 'Ada' }, '');
  ui.view.show({ kind: 'signed-in', method: 'google', name: 'Ada' }, '');
  assert.ok(ui.classes.has('shown'));
  assert.equal(ui.timers.pending(), 0);
  ui.view.show({ kind: 'guest', google: true, email: false }, '');
  ui.view.show({ kind: 'hidden' }, '');
  ui.view.show({ kind: 'signed-in', method: 'google', name: 'Bran' }, '');
  assert.equal(ui.timers.pending(), 1);
  await ui.timers.advance(TITLE_ACCOUNT.swapMs);
  assert.equal(ui.name.textContent, 'Bran');
  assert.deepEqual([visible(ui.button), visible(ui.line)], [false, true]);
});

void test('going from visible to hidden fades out and stays out', async (): Promise<void> => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'guest', google: true, email: false }, '');
  ui.view.show({ kind: 'hidden' }, '');
  await ui.timers.advance(TITLE_ACCOUNT.swapMs);
  assert.ok(!ui.classes.has('shown'));
  assert.equal(visible(ui.button), false);
});

void test('a guest sees only the sign-in methods the server offers', (): void => {
  const both: Screen = screen();
  both.view.show({ kind: 'guest', google: true, email: true }, '');
  assert.deepEqual([visible(both.button), visible(both.email)], [true, true]);
  const emailOnly: Screen = screen();
  emailOnly.view.show({ kind: 'guest', google: false, email: true }, '');
  assert.deepEqual([visible(emailOnly.button), visible(emailOnly.email)], [false, true]);
});

void test('a signed-in player sees which method was used beside the name', (): void => {
  const ui: Screen = screen();
  ui.view.show({ kind: 'signed-in', method: 'email', name: 'a•••@example.com' }, '');
  assert.equal(ui.method.textContent, 'Email');
  assert.equal(ui.name.textContent, 'a•••@example.com');
  assert.ok(!visible(ui.email));
  const google: Screen = screen();
  google.view.show({ kind: 'signed-in', method: 'google', name: 'Ada' }, '');
  assert.equal(google.method.textContent, 'Google');
});

function rulesFor(css: string, selector: string): string[] {
  const bodies: string[] = [];
  for (const block of css.split('}')) {
    const [head, body] = block.split('{');
    if (head === undefined || body === undefined) continue;
    if (head.split(",").some((piece: string): boolean => piece.trim().split(/\s+/).at(-1)?.split(':')[0] === selector)) bodies.push(body);
  }
  return bodies;
}

void test('Google\'s own button is drawn fully visible, because it ignores a click while it is transparent, hidden or filtered', (): void => {
  const css: string = readFileSync(new URL('./title-account.css', import.meta.url), 'utf8');
  const official: string[] = rulesFor(css, '.title-google-official');
  assert.ok(official.length > 0);
  for (const body of official) {
    assert.ok(!/\bopacity\s*:/.test(body), body);
    assert.ok(!/\bvisibility\s*:\s*hidden/.test(body), body);
    assert.ok(!/\b(filter|clip-path|mask)\s*:/.test(body), body);
    assert.ok(!/\bdisplay\s*:\s*none/.test(body), body);
  }
  assert.ok(css.replaceAll(/\s+/g, ' ').includes('.title-google .title-signin-face { display: none; }'), 'the page draws no face of its own for Google, so the control never changes look after it loads');
  for (const holder of ['.title-google', '.title-methods', '.title-account']) {
    for (const body of rulesFor(css, holder)) assert.ok(!/\b(filter|clip-path|mask)\s*:/.test(body), `${holder} ${body}`);
  }
});
