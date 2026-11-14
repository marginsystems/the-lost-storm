import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import { createFakeClock, createFakeTimers } from '../../test/backend-support.ts';
import type { FakeClock, FakeTimers } from '../../test/backend-support.ts';
import { worldIn } from '../../test/support.ts';
import type { LiveEvent, LiveListener } from '../backend/live.ts';
import { createTradeFlow, TRADE_FLOW } from './trade-flow.ts';
import type { BagEntry, PlayerTrade } from './trade-flow.ts';
import type { TradeFrame, TradeItem, TradeSide } from './trade-protocol.ts';

const content: Content = loadContent();
const LEDGER: string = 'itm_AAAAAAAAAAAAAAAAAAAAAA';
const OTHER: string = 'itm_BBBBBBBBBBBBBBBBBBBBBB';
const BLADE: TradeItem = { id: LEDGER, base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] };
const EMPTY: TradeSide = { items: [], gold: 0, confirmed: false };

interface Rig {
  readonly flow: PlayerTrade;
  readonly sent: unknown[];
  readonly clock: FakeClock;
  readonly time: FakeTimers;
  readonly world: World;
  readonly syncs: { count: number };
  readonly live: { ready: boolean };
  emit(event: LiveEvent): void;
  frame(frame: TradeFrame): void;
}

function rig(): Rig {
  const clock: FakeClock = createFakeClock();
  const time: FakeTimers = createFakeTimers(clock);
  const sent: unknown[] = [];
  const listeners: LiveListener[] = [];
  const live = { ready: true };
  const syncs = { count: 0 };
  const world: World = worldIn(content, content.world.town, 3);
  world.player.inventory[0] = { uid: 50, base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [], ledger: LEDGER };
  world.player.inventory[1] = { uid: 51, base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [], ledger: null };
  world.player.inventory[2] = { uid: 52, base: 'worn_journal', rarity: 'common', level: 1, affixes: [], ledger: OTHER };
  const flow: PlayerTrade = createTradeFlow({
    live: {
      canTrade: (): boolean => live.ready,
      trade: (frame: string): boolean => {
        if (!live.ready) return false;
        sent.push(JSON.parse(frame));
        return true;
      },
      subscribe: (listener: LiveListener): (() => void) => {
        listeners.push(listener);
        return (): void => undefined;
      },
    },
    world: (): World => world,
    sync: (): Promise<void> => {
      syncs.count += 1;
      return Promise.resolve();
    },
    clock: clock.read,
    timers: time.timers,
  });
  const emit = (event: LiveEvent): void => {
    for (const listener of listeners) listener(event);
  };
  return { flow, sent, clock, time, world, syncs, live, emit, frame: (frame: TradeFrame): void => emit({ type: 'trade', frame }) };
}

function opened(): Rig {
  const r: Rig = rig();
  r.frame({ type: 'trade_open', with: 'h1', name: 'Ash' });
  r.frame({ type: 'trade_state', revision: 0, mine: EMPTY, theirs: EMPTY, countdownEndsAt: null });
  return r;
}

void test('asking sends the ask and says so, and an older server sends nothing', (): void => {
  const r: Rig = rig();
  r.flow.ask('h1', 'Ash');
  assert.deepEqual(r.sent, [{ type: 'trade_ask', to: 'h1' }]);
  assert.equal(r.flow.state().asking, 'Ash');
  const old: Rig = rig();
  old.live.ready = false;
  assert.equal(old.flow.ready(), false);
  old.flow.ask('h1', 'Ash');
  assert.deepEqual([old.sent, old.flow.state().asking], [[], null]);
});

void test('an ask to you can be accepted or declined, and goes away on its own when it expires', async (): Promise<void> => {
  const r: Rig = rig();
  r.frame({ type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: r.clock.now + 30_000 });
  r.flow.accept();
  assert.deepEqual(r.sent.at(-1), { type: 'trade_answer', accept: true });
  r.flow.decline();
  assert.deepEqual(r.sent.at(-1), { type: 'trade_answer', accept: false });
  assert.equal(r.flow.state().incoming, null);
  r.frame({ type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: r.clock.now + 30_000 });
  await r.time.advance(30_000);
  assert.equal(r.flow.state().incoming, null);
});

void test('the bag lists what can be offered and why a story or unverified item cannot', (): void => {
  const r: Rig = opened();
  const bag: readonly BagEntry[] = r.flow.bag();
  assert.deepEqual(
    bag.map((entry: BagEntry): readonly unknown[] => [entry.index, entry.block, entry.offered]),
    [
      [0, null, false],
      [1, 'unverified', false],
      [2, 'story', false],
    ],
  );
});

void test('picking a bag item offers it at once with the gold, and picking it again takes it back', (): void => {
  const r: Rig = opened();
  r.flow.toggle(LEDGER);
  assert.deepEqual(r.sent.at(-1), { type: 'trade_offer', items: [LEDGER], gold: 0 });
  assert.equal(r.flow.bag()[0]?.offered, true);
  r.flow.toggle(LEDGER);
  assert.deepEqual(r.sent.at(-1), { type: 'trade_offer', items: [], gold: 0 });
});

void test('gold is offered once typing settles, and a bad number is never sent', async (): Promise<void> => {
  const r: Rig = opened();
  r.flow.setGold('1');
  r.flow.setGold('12');
  assert.equal(r.sent.length, 0);
  await r.time.advance(TRADE_FLOW.goldSettleMs);
  assert.deepEqual(r.sent, [{ type: 'trade_offer', items: [], gold: 12 }]);
  r.flow.setGold('1.5');
  await r.time.advance(TRADE_FLOW.goldSettleMs);
  assert.equal(r.sent.length, 1);
});

void test('a refused offer puts your side back to what the server holds', (): void => {
  const r: Rig = opened();
  r.flow.toggle(LEDGER);
  r.frame({ type: 'trade_refused', reason: 'not_yours' });
  assert.equal(r.flow.bag()[0]?.offered, false);
  assert.equal(r.flow.state().note?.tone, 'refusal');
});

void test('confirm names the revision on screen, so a change the player has not seen cannot be confirmed', (): void => {
  const r: Rig = opened();
  r.frame({ type: 'trade_state', revision: 4, mine: EMPTY, theirs: { ...EMPTY, items: [BLADE] }, countdownEndsAt: null });
  r.flow.confirmOffer();
  assert.deepEqual(r.sent.at(-1), { type: 'trade_confirm', revision: 4 });
});

void test('a finished trade saves and syncs so the bags fold the swap in', (): void => {
  const r: Rig = opened();
  r.frame({ type: 'trade_done', gave: { items: [], gold: 0 }, got: { items: [BLADE], gold: 0 } });
  assert.equal(r.syncs.count, 1);
  assert.equal(r.flow.state().open, null);
  assert.equal(r.flow.state().note?.tone, 'done');
});

void test('cancel tells the server, and losing the connection or leaving the Hideout ends the window', (): void => {
  const r: Rig = opened();
  r.flow.cancel();
  assert.deepEqual(r.sent.at(-1), { type: 'trade_cancel' });
  r.emit({ type: 'away' });
  assert.equal(r.flow.state().open, null);
  const g: Rig = opened();
  g.emit({ type: 'gone' });
  assert.equal(g.flow.state().open, null);
});

void test('listeners hear every change', (): void => {
  const r: Rig = rig();
  let heard: number = 0;
  r.flow.subscribe((): void => {
    heard += 1;
  });
  r.frame({ type: 'trade_open', with: 'h1', name: 'Ash' });
  assert.ok(heard > 0);
});
