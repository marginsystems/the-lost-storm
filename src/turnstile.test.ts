import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../test/backend-support.ts';
import type { FakeTimers } from '../test/backend-support.ts';
import { createTurnstileGate, readTurnstileApi, TURNSTILE } from './turnstile.ts';
import type { TurnstileApi, TurnstileGate } from './turnstile.ts';

interface Widget {
  readonly api: TurnstileApi;
  readonly options: () => Readonly<Record<string, unknown>>;
  readonly resets: () => number;
  fire(name: string, value?: unknown): void;
}

function widget(): Widget {
  let options: Readonly<Record<string, unknown>> = {};
  let resets: number = 0;
  return {
    api: {
      render: (_mount: unknown, given: unknown): unknown => {
        options = typeof given === 'object' && given !== null ? Object.fromEntries(Object.entries(given)) : {};
        return 'widget-1';
      },
      reset: (): void => {
        resets += 1;
      },
      remove: (): void => undefined,
    },
    options: (): Readonly<Record<string, unknown>> => options,
    resets: (): number => resets,
    fire(name: string, value?: unknown): void {
      const callback: unknown = options[name];
      if (typeof callback === 'function') Reflect.apply(callback, undefined, [value]);
    },
  };
}

interface Rig {
  readonly gate: TurnstileGate;
  readonly widget: Widget;
  readonly timers: FakeTimers;
  readonly interactive: boolean[];
}

function rig(): Rig {
  const made: Widget = widget();
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  const interactive: boolean[] = [];
  const mount: unknown = { id: 'mount' };
  const gate: TurnstileGate = createTurnstileGate({
    api: made.api,
    mount,
    siteKey: '0x4AAA',
    timers: timers.timers,
    onInteractive: (shown: boolean): void => {
      interactive.push(shown);
    },
  });
  return { gate, widget: made, timers, interactive };
}

void test('only an object with render, reset and remove is taken as the Turnstile API', (): void => {
  const api = { render: (): string => 'w', reset: (): void => undefined, remove: (): void => undefined };
  assert.equal(readTurnstileApi({ turnstile: api }), api);
  for (const globals of [null, {}, { turnstile: { render: (): string => 'w' } }, { turnstile: 'yes' }]) assert.equal(readTurnstileApi(globals), null);
});

void test('the widget is dark, invisible unless it needs the player, and made for the email action', (): void => {
  const { widget: made } = rig();
  assert.equal(made.options()['sitekey'], '0x4AAA');
  assert.equal(made.options()['theme'], 'dark');
  assert.equal(made.options()['appearance'], 'interaction-only');
  assert.equal(made.options()['action'], TURNSTILE.action);
});

void test('a token asked for before the check is done arrives when it passes, and a spent token resets the widget', async (): Promise<void> => {
  const { gate, widget: made } = rig();
  const asked: Promise<string | null> = gate.token();
  made.fire('callback', 'tok-1');
  assert.equal(await asked, 'tok-1');
  assert.equal(await gate.token(), 'tok-1');
  gate.spend();
  assert.equal(made.resets(), 1);
  const next: Promise<string | null> = gate.token();
  made.fire('callback', 'tok-2');
  assert.equal(await next, 'tok-2');
});

void test('a check that needs the player is shown and hidden again', (): void => {
  const { widget: made, interactive } = rig();
  made.fire('before-interactive-callback');
  made.fire('after-interactive-callback');
  assert.deepEqual(interactive, [true, false]);
});

void test('an error gives no token, and the next ask resets the widget to try again', async (): Promise<void> => {
  const { gate, widget: made } = rig();
  const asked: Promise<string | null> = gate.token();
  made.fire('error-callback');
  assert.equal(await asked, null);
  const again: Promise<string | null> = gate.token();
  assert.equal(made.resets(), 1);
  made.fire('callback', 'tok-3');
  assert.equal(await again, 'tok-3');
});

void test('a check that never finishes gives up after a while', async (): Promise<void> => {
  const { gate, timers } = rig();
  const asked: Promise<string | null> = gate.token();
  await timers.advance(TURNSTILE.tokenWaitMs);
  assert.equal(await asked, null);
});
