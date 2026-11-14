import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OpenTrade, TradeState } from './trade-model.ts';
import { asked, askingText, tradeBusy, blockText, closeText, confirmBlock, doneText, expire, gone, NO_TRADE, parseGold, refusalText, secondsLeft, TRADE_MODEL, tradeCard, tradeStep } from './trade-model.ts';
import type { TradeItem, TradeSide } from './trade-protocol.ts';
import { TRADE_CLOSES, TRADE_LIMITS, TRADE_REFUSALS } from './trade-protocol.ts';

const NOW: number = 1_000_000;
const BLADE: TradeItem = { id: 'itm_A', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] };
const EMPTY: TradeSide = { items: [], gold: 0, confirmed: false };

function opened(): TradeState {
  return tradeStep(NO_TRADE, { type: 'trade_open', with: 'h1', name: 'Ash' }, NOW);
}

function openOf(state: TradeState): OpenTrade {
  assert.ok(state.open !== null);
  return state.open;
}

void test('an incoming ask waits until it expires, and opening clears it and the ask you sent', (): void => {
  const waiting: TradeState = tradeStep(asked(NO_TRADE, 'Bo'), { type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: NOW + 10 }, NOW);
  assert.deepEqual(waiting.incoming, { from: 'h1', name: 'Ash', expiresAt: NOW + 10 });
  assert.equal(expire(waiting, NOW + 9), waiting);
  assert.equal(expire(waiting, NOW + 10).incoming, null);
  const open: TradeState = tradeStep(waiting, { type: 'trade_open', with: 'h1', name: 'Ash' }, NOW);
  assert.deepEqual([open.incoming, open.asking, openOf(open).name, openOf(open).revision], [null, null, 'Ash', 0]);
});

void test('a change to their side is marked with the time and a line, a change to yours is not', (): void => {
  const mine: TradeState = tradeStep(opened(), { type: 'trade_state', revision: 1, mine: { ...EMPTY, gold: 5 }, theirs: EMPTY, countdownEndsAt: null }, NOW + 1);
  assert.equal(openOf(mine).changedAt, null);
  assert.equal(mine.note, null);
  const theirs: TradeState = tradeStep(mine, { type: 'trade_state', revision: 2, mine: { ...EMPTY, gold: 5 }, theirs: { ...EMPTY, items: [BLADE] }, countdownEndsAt: null }, NOW + 2);
  assert.equal(openOf(theirs).changedAt, NOW + 2);
  assert.equal(theirs.note?.text, 'Ash changed their offer. Check it before you confirm.');
  const confirmedOnly: TradeState = tradeStep(theirs, { type: 'trade_state', revision: 2, mine: { ...EMPTY, gold: 5 }, theirs: { items: [BLADE], gold: 0, confirmed: true }, countdownEndsAt: null }, NOW + 3);
  assert.equal(openOf(confirmedOnly).changedAt, NOW + 2);
});

void test('a state with no open trade is ignored', (): void => {
  assert.equal(tradeStep(NO_TRADE, { type: 'trade_state', revision: 1, mine: EMPTY, theirs: EMPTY, countdownEndsAt: null }, NOW), NO_TRADE);
});

void test('closing and finishing end the trade with a line that says what happened', (): void => {
  const closed: TradeState = tradeStep(opened(), { type: 'trade_closed', reason: 'walked_away' }, NOW);
  assert.deepEqual([closed.open, closed.note], [null, { text: closeText('walked_away'), tone: 'refusal' }]);
  const done: TradeState = tradeStep(opened(), { type: 'trade_done', gave: { items: [BLADE], gold: 0 }, got: { items: [], gold: 75 } }, NOW);
  assert.deepEqual(done.note, { text: 'Trade done. You gave 1 item and got 75 gold.', tone: 'done' });
  assert.equal(doneText({ items: [BLADE, BLADE], gold: 3 }, { items: [], gold: 0 }), 'Trade done. You gave 2 items and 3 gold and got nothing.');
});

void test('a refusal keeps the trade open and drops an ask that was refused', (): void => {
  const refused: TradeState = tradeStep(asked(NO_TRADE, 'Ash'), { type: 'trade_refused', reason: 'too_far' }, NOW);
  assert.deepEqual([refused.asking, refused.note], [null, { text: refusalText('too_far'), tone: 'refusal' }]);
  assert.notEqual(tradeStep(opened(), { type: 'trade_refused', reason: 'no_room' }, NOW).open, null);
});

void test('every refusal and close has its own words', (): void => {
  const texts: readonly string[] = [...TRADE_REFUSALS.map(refusalText), ...TRADE_CLOSES.map(closeText)];
  assert.equal(new Set(texts).size, texts.length);
  for (const text of texts) assert.ok(text.endsWith('.'), text);
});

void test('losing the connection ends an open trade with a line and quietly drops a waiting ask', (): void => {
  assert.equal(gone(NO_TRADE), NO_TRADE);
  assert.equal(gone(opened()).note?.text, closeText('disconnected'));
  const waiting: TradeState = tradeStep(NO_TRADE, { type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: NOW }, NOW);
  assert.deepEqual(gone(waiting), NO_TRADE);
});

void test('gold is a whole number of at most the limit, and empty means none', (): void => {
  assert.equal(parseGold(''), 0);
  assert.equal(parseGold(' 120 '), 120);
  for (const bad of ['-1', '1.5', '1e3', 'ten', String(TRADE_LIMITS.gold + 1)]) assert.equal(parseGold(bad), null, bad);
});

void test('confirm waits out a fresh change, needs something on the table and room for what comes in', (): void => {
  const base: OpenTrade = { ...openOf(opened()), theirs: { ...EMPTY, items: [BLADE, BLADE] } };
  assert.equal(confirmBlock(base, 2, NOW), 'none');
  assert.equal(confirmBlock({ ...base, changedAt: NOW }, 2, NOW + TRADE_MODEL.changeLockMs - 1), 'changed');
  assert.equal(confirmBlock({ ...base, changedAt: NOW }, 2, NOW + TRADE_MODEL.changeLockMs), 'none');
  assert.equal(confirmBlock({ ...base, theirs: EMPTY }, 2, NOW), 'empty');
  assert.equal(confirmBlock(base, 1, NOW), 'no_room');
  assert.equal(confirmBlock({ ...base, mine: { ...EMPTY, items: [BLADE] } }, 1, NOW), 'none');
  assert.equal(confirmBlock({ ...base, mine: { ...EMPTY, confirmed: true } }, 0, NOW), 'confirmed');
  assert.equal(blockText('no_room', base, 1), 'Your bags are full: make room for 1 more item.');
  assert.equal(blockText('no_room', base, 0), 'Your bags are full: make room for 2 more items.');
  assert.equal(blockText('confirmed', base, 0), 'Waiting for Ash to confirm.');
  assert.equal(blockText('none', base, 0), null);
});

void test('the countdown shows whole seconds left and never below zero', (): void => {
  assert.equal(secondsLeft(NOW + 2001, NOW), 3);
  assert.equal(secondsLeft(NOW + 1000, NOW), 1);
  assert.equal(secondsLeft(NOW - 5, NOW), 0);
});

void test('the card shows an ask to you first, waits on your own ask, and shows how a trade ended for a moment', (): void => {
  const incoming: TradeState = tradeStep(asked(NO_TRADE, 'Bo'), { type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: NOW + 10 }, NOW);
  assert.equal(tradeCard(incoming, 0).kind, 'incoming');
  assert.deepEqual(tradeCard(asked(NO_TRADE, 'Bo'), 0), { kind: 'asking', name: 'Bo' });
  assert.equal(askingText('Bo'), 'Waiting for Bo to answer.');
  assert.deepEqual(tradeCard(opened(), 0), { kind: 'none' });
  const done: TradeState = tradeStep(opened(), { type: 'trade_done', gave: { items: [], gold: 5 }, got: { items: [BLADE], gold: 0 } }, NOW);
  assert.equal(tradeCard(done, TRADE_MODEL.noteMs - 1).kind, 'note');
  assert.deepEqual(tradeCard(done, TRADE_MODEL.noteMs), { kind: 'none' });
  const declined: TradeState = tradeStep(asked(NO_TRADE, 'Bo'), { type: 'trade_closed', reason: 'declined' }, NOW);
  assert.deepEqual(tradeCard(declined, 0), { kind: 'note', note: { text: closeText('declined'), tone: 'refusal' } });
});

void test('you are busy trading while a window is open or your own ask waits', (): void => {
  assert.equal(tradeBusy(NO_TRADE), false);
  assert.equal(tradeBusy(asked(NO_TRADE, 'Bo')), true);
  assert.equal(tradeBusy(opened()), true);
  assert.equal(tradeBusy(tradeStep(NO_TRADE, { type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: NOW + 10 }, NOW)), false);
});
