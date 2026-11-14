import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReportResult } from '../backend/api.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import { boxAnchor, reportKey, reportNote, reportRoute, tradeFrom } from './hideout-menu.ts';

void test('every report answer has its own line in the menu', (): void => {
  const results: readonly ReportResult[] = ['reported', 'gone', 'own', 'slow', 'unsupported', 'failed'];
  const notes: ReadonlySet<string> = new Set<string>(results.map(reportNote));
  assert.equal(notes.size, results.length);
  assert.equal(reportNote('reported'), 'Reported. Thank you.');
});

const LINE: ChatLine = { id: 41, name: 'Bo Reed', text: 'hello', at: '2026-11-14T10:00:00.000Z', from: null, own: false };

void test('a name opened from a chat line reports that line, and anything else reports the player', (): void => {
  assert.deepEqual(reportRoute({ kind: 'chat', name: 'Bo Reed', line: LINE }), { kind: 'line', line: LINE });
  assert.deepEqual(reportRoute({ kind: 'chat', name: 'Bo Reed', line: null }), { kind: 'player', name: 'Bo Reed' });
  assert.deepEqual(reportRoute({ kind: 'world', target: { id: 'p1', name: 'Bo Reed', username: null } }), { kind: 'player', name: 'Bo Reed' });
});

void test('a reported line marks only that line, and a reported player marks the name', (): void => {
  assert.equal(reportKey({ kind: 'chat', name: 'Bo Reed', line: LINE }), 'line:41');
  assert.equal(reportKey({ kind: 'chat', name: 'Bo Reed', line: null }), reportKey({ kind: 'world', target: { id: 'p1', name: 'bo reed', username: null } }));
});

void test('trade is offered only for a player standing in the Hideout', (): void => {
  assert.equal(tradeFrom({ kind: 'world', target: { id: 'p1', name: 'Bo Reed', username: null } }, true), true);
  assert.equal(tradeFrom({ kind: 'chat', name: 'Bo Reed', line: LINE }, true), false);
  assert.equal(tradeFrom({ kind: 'world', target: { id: 'p1', name: 'Bo Reed', username: null } }, false), false);
});

void test('a chat name anchors the menu at its middle, measured from the frame', (): void => {
  assert.deepEqual(boxAnchor({ left: 110, top: 300, width: 40, height: 20 }, { left: 10, top: 50, width: 800, height: 600 }), { x: 120, top: 250, bottom: 270 });
});
