import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReportResult } from '../backend/api.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import type { OtherTarget } from '../render/others.ts';
import type { Spot, TradeStarter } from './hideout-menu.ts';
import { boxAnchor, reportKey, reportNote, reportRoute, tradeOf, tradeTarget } from './hideout-menu.ts';

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

const BO: OtherTarget = { id: 'p1', name: 'Bo Reed', username: null };

interface FakeOthers {
  target(id: string): OtherTarget | null;
  named(name: string): OtherTarget | null;
  groundOf(id: string): Spot | null;
}

function standingIn(ground: Spot | null): FakeOthers {
  return {
    target: (id: string): OtherTarget | null => (ground !== null && id === BO.id ? BO : null),
    named: (name: string): OtherTarget | null => (ground !== null && name.toLowerCase() === BO.name.toLowerCase() ? BO : null),
    groundOf: (id: string): Spot | null => (id === BO.id ? ground : null),
  };
}

function starter(busy: boolean): TradeStarter {
  return { ready: (): boolean => true, busy: (): boolean => busy, start: (): void => undefined };
}

void test('a chat name trades with the player of that name standing in the Hideout, as a click on them does', (): void => {
  const here: FakeOthers = standingIn({ x: 2, z: 0 });
  assert.equal(tradeTarget({ kind: 'chat', name: 'bo reed', line: LINE }, here), BO);
  assert.equal(tradeTarget({ kind: 'world', target: BO }, here), BO);
  assert.equal(tradeTarget({ kind: 'chat', name: 'Bo Reed', line: LINE }, standingIn(null)), null);
});

void test('the trade entry follows the same rules from chat and from the world', (): void => {
  const hero: Spot = { x: 0, z: 0 };
  for (const origin of [{ kind: 'world', target: BO }, { kind: 'chat', name: 'Bo Reed', line: LINE }] as const) {
    assert.equal(tradeOf(origin, starter(false), standingIn({ x: 2, z: 0 }), { inHideout: true, hero }), 'ready');
    assert.equal(tradeOf(origin, starter(true), standingIn({ x: 2, z: 0 }), { inHideout: true, hero }), 'trading');
    assert.equal(tradeOf(origin, starter(false), standingIn({ x: 40, z: 0 }), { inHideout: true, hero }), 'far');
    assert.equal(tradeOf(origin, starter(false), standingIn(null), { inHideout: true, hero }), 'away');
    assert.equal(tradeOf(origin, starter(false), standingIn({ x: 2, z: 0 }), { inHideout: false, hero }), 'elsewhere');
    assert.equal(tradeOf(origin, null, standingIn({ x: 2, z: 0 }), { inHideout: true, hero }), 'unsupported');
  }
});

void test('a chat name anchors the menu at its middle, measured from the frame', (): void => {
  assert.deepEqual(boxAnchor({ left: 110, top: 300, width: 40, height: 20 }, { left: 10, top: 50, width: 800, height: 600 }), { x: 120, top: 250, bottom: 270 });
});
