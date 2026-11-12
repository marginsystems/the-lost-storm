import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeServer, createFakeTimers, createMemoryStore, settle } from '../../test/backend-support.ts';
import type { FakeClock, FakeServer, FakeTimers } from '../../test/backend-support.ts';
import { ALPHA, feedbackBody, LAUNCH_KEY, readLaunchState } from './alpha.ts';
import type { FeedbackBody } from './alpha.ts';
import { ALPHA_RULES } from './data.ts';
import { createLaunchLoop } from './launch-loop.ts';
import type { LaunchLoop } from './launch-loop.ts';

const URL_BASE: string = 'http://localhost:8787';

interface Rig {
  readonly server: FakeServer;
  readonly clock: FakeClock;
  readonly timers: FakeTimers;
  readonly store: ReturnType<typeof createMemoryStore>;
  readonly token: { value: string | null };
  readonly open: () => LaunchLoop;
}

function rig(): Rig {
  const clock: FakeClock = createFakeClock();
  const server: FakeServer = createFakeServer(clock);
  const timers: FakeTimers = createFakeTimers(clock);
  const store = createMemoryStore();
  const token: { value: string | null } = { value: null };
  return {
    server,
    clock,
    timers,
    store,
    token,
    open: (): LaunchLoop =>
      createLaunchLoop({ serverUrl: URL_BASE, fetch: server.fetch, store, timers: timers.timers, rules: ALPHA_RULES, device: 'phone', token: (): string | null => token.value, signal: (): undefined => undefined }),
  };
}

function body(text: string): FeedbackBody {
  return feedbackBody('up', text, { zone: 'shallows', level: 2, minutes: 9, device: 'phone', build: 'abc' });
}

void test('events are counted once, with the device class and nothing else', async (): Promise<void> => {
  const { server, open } = rig();
  const loop: LaunchLoop = open();
  loop.note('opened_game');
  loop.note('opened_game');
  await loop.flush();
  loop.observe({ zone: 'shallows', flags: { first_choice: 'took_journal' }, alive: true });
  loop.observe({ zone: 'shallows', flags: { first_choice: 'took_journal' }, alive: true });
  await loop.flush();
  assert.deepEqual(server.counted, [
    { event: 'opened_game', device: 'phone' },
    { event: 'picked_journal', device: 'phone' },
    { event: 'reached_shallows', device: 'phone' },
  ]);
  assert.ok(server.requests.filter((request) => request.path === '/v1/counts').every((request) => request.token === null));
});

void test('a second visit does not count again', async (): Promise<void> => {
  const first: Rig = rig();
  const loop: LaunchLoop = first.open();
  loop.note('opened_game');
  await loop.flush();
  const again: LaunchLoop = createLaunchLoop({ serverUrl: URL_BASE, fetch: first.server.fetch, store: first.store, timers: first.timers.timers, rules: ALPHA_RULES, device: 'phone', token: (): null => null, signal: (): undefined => undefined });
  again.note('opened_game');
  await again.flush();
  assert.equal(first.server.counted.length, 1);
});

void test('feedback goes out with the account token when there is one', async (): Promise<void> => {
  const { server, token, open } = rig();
  token.value = 'token-7';
  const loop: LaunchLoop = open();
  assert.equal(await loop.send(body('lovely mist')), 'sent');
  await loop.flush();
  const [stored] = server.feedback;
  assert.ok(stored !== undefined);
  assert.equal(server.feedback.length, 1);
  assert.equal(stored.token, 'token-7');
  assert.deepEqual(stored.body, body('lovely mist'));
  assert.deepEqual(server.counted, [{ event: 'sent_feedback', device: 'phone' }]);
  assert.deepEqual(loop.state().outbox, []);
});

void test('feedback is kept on the device while the server is down and sent when it is back', async (): Promise<void> => {
  const { server, store, timers, open } = rig();
  server.goDown();
  const loop: LaunchLoop = open();
  assert.equal(await loop.send(body('offline note')), 'queued');
  assert.equal(readLaunchState(store.read(LAUNCH_KEY)).outbox.length, 1);
  assert.equal(timers.nextDelay(), ALPHA.firstRetryMs);
  await timers.advance(ALPHA.firstRetryMs);
  assert.equal(timers.nextDelay(), ALPHA.firstRetryMs * 2);
  server.comeUp();
  await timers.advance(ALPHA.firstRetryMs * 2);
  await settle();
  assert.equal(server.feedback.length, 1);
  assert.deepEqual(readLaunchState(store.read(LAUNCH_KEY)).outbox, []);
  assert.equal(timers.pending(), 0);
});

void test('feedback queued in an earlier visit is sent on the next one', async (): Promise<void> => {
  const first: Rig = rig();
  first.server.goDown();
  await first.open().send(body('from yesterday'));
  first.server.comeUp();
  await first.open().flush();
  assert.equal(first.server.feedback.length, 1);
});

void test('a busy server is retried, a refused body is dropped', async (): Promise<void> => {
  const { server, open } = rig();
  const loop: LaunchLoop = open();
  server.plan(429, { 'Retry-After': '60' }, 'POST');
  assert.equal(await loop.send(body('one')), 'queued');
  assert.equal(loop.state().outbox.length, 1);
  await loop.flush();
  assert.equal(server.feedback.length, 1);
  server.plan(400, {}, 'POST');
  assert.equal(await loop.send(body('two')), 'rejected');
  assert.deepEqual(loop.state().outbox, []);
});

void test('the end card is taken once and remembered', (): void => {
  const { store, open } = rig();
  const loop: LaunchLoop = open();
  const none: ReadonlySet<string> = new Set<string>();
  assert.equal(loop.takeEndCard({ flags: {}, ended: none }), false);
  assert.equal(loop.takeEndCard({ flags: { alpha_slice_complete: 'yes' }, ended: none }), true);
  assert.equal(loop.takeEndCard({ flags: { alpha_slice_complete: 'yes' }, ended: none }), false);
  assert.equal(readLaunchState(store.read(LAUNCH_KEY)).endShown, true);
});

void test('a flush that starts during a send does not post the feedback twice', async (): Promise<void> => {
  const { server, open } = rig();
  const loop: LaunchLoop = open();
  const release: () => void = server.holdNext();
  const sending: Promise<string> = loop.send(body('once only'));
  const flushing: Promise<void> = loop.flush();
  release();
  assert.equal(await sending, 'sent');
  await flushing;
  await loop.flush();
  assert.equal(server.feedback.length, 1);
  assert.equal(server.requests.filter((request) => request.path === '/v1/feedback').length, 1);
});

void test('feedback the server refuses while a flush is running is reported as refused', async (): Promise<void> => {
  const { server, open } = rig();
  const loop: LaunchLoop = open();
  const release: () => void = server.holdNext();
  loop.note('died');
  const refused: FeedbackBody = { ...body('bad level'), context: { ...body('bad level').context, level: 0 } };
  const sending: Promise<string> = loop.send(refused);
  release();
  assert.equal(await sending, 'rejected');
  assert.deepEqual(loop.state().outbox, []);
  assert.equal(server.feedback.length, 0);
});

void test('counts still go out while a feedback body keeps failing', async (): Promise<void> => {
  const { server, store, timers } = rig();
  const failing = async (url: string, init: RequestInit): Promise<Response> => (url.endsWith('/v1/feedback') ? new Response(null, { status: 503 }) : server.fetch(url, init));
  const loop: LaunchLoop = createLaunchLoop({ serverUrl: URL_BASE, fetch: failing, store, timers: timers.timers, rules: ALPHA_RULES, device: 'desktop', token: (): null => null, signal: (): undefined => undefined });
  assert.equal(await loop.send(body('stuck')), 'queued');
  loop.note('opened_game');
  await loop.flush();
  assert.deepEqual(server.counted, [{ event: 'opened_game', device: 'desktop' }]);
  assert.equal(loop.state().outbox.length, 1);
});

void test('the sent_feedback count goes out with the send that earned it', async (): Promise<void> => {
  const { server, open } = rig();
  const loop: LaunchLoop = open();
  assert.equal(await loop.send(body('counted too')), 'sent');
  assert.deepEqual(server.counted, [{ event: 'sent_feedback', device: 'phone' }]);
  assert.deepEqual(loop.state().pending, []);
});
