import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContextPhase } from './context-phase.ts';
import { contextNoticeShown, contextReloadOffered, contextWaits, nextContextPhase } from './context-phase.ts';

const drawn = { type: 'frame', contextLost: false } as const;
const blank = { type: 'frame', contextLost: true } as const;

void test('a live context shows nothing and stays live while frames draw', (): void => {
  assert.equal(nextContextPhase('live', drawn), 'live');
  assert.equal(contextNoticeShown('live'), false);
  assert.equal(contextReloadOffered('live'), false);
});

void test('a lost context shows the notice and waits without offering a reload', (): void => {
  const lost: ContextPhase = nextContextPhase('live', { type: 'lost' });
  assert.equal(lost, 'lost');
  assert.equal(contextNoticeShown(lost), true);
  assert.equal(contextReloadOffered(lost), false);
  assert.equal(contextWaits(lost), true);
  assert.equal(nextContextPhase(lost, blank), 'lost');
});

void test('a restored context keeps the notice only until the first frame draws', (): void => {
  const restoring: ContextPhase = nextContextPhase('lost', { type: 'restored' });
  assert.equal(restoring, 'restoring');
  assert.equal(contextNoticeShown(restoring), true);
  assert.equal(nextContextPhase(restoring, drawn), 'live');
});

void test('a context that never comes back offers a reload, and still clears if it does', (): void => {
  assert.equal(nextContextPhase('lost', { type: 'timeout' }), 'failed');
  assert.equal(nextContextPhase('restoring', { type: 'timeout' }), 'failed');
  assert.equal(contextReloadOffered('failed'), true);
  assert.equal(contextWaits('failed'), false);
  assert.equal(nextContextPhase('failed', { type: 'restored' }), 'restoring');
  assert.equal(nextContextPhase('failed', drawn), 'live');
});

void test('a stale timeout or restore never raises the notice over a live context', (): void => {
  assert.equal(nextContextPhase('live', { type: 'timeout' }), 'live');
  assert.equal(nextContextPhase('live', { type: 'restored' }), 'live');
});

void test('a lost event the renderer contradicts clears on the next drawn frame', (): void => {
  assert.equal(nextContextPhase(nextContextPhase('live', { type: 'lost' }), drawn), 'live');
});

void test('a context found lost without an event raises the notice', (): void => {
  assert.equal(nextContextPhase('live', blank), 'lost');
});
