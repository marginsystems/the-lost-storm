import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fields } from '../../sim/content/read.ts';
import { answerFrame, askFrame, cancelFrame, confirmFrame, offerFrame, readTradeFrame, TRADE_CLOSES, TRADE_LIMITS, TRADE_REFUSALS } from './trade-protocol.ts';

const ITEM = { id: 'itm_AAAAAAAAAAAAAAAAAAAAAA', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [{ affix: 'sharp', value: 4 }] };
const SIDE = { items: [ITEM], gold: 40, confirmed: false };
const AT: string = '2026-11-14T10:00:00.000Z';

function frame(fields: Fields): ReturnType<typeof readTradeFrame> {
  return readTradeFrame(fields);
}

void test('every trade frame the server sends is read with its fields', (): void => {
  assert.deepEqual(frame({ type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: AT }), { type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: Date.parse(AT) });
  assert.deepEqual(frame({ type: 'trade_open', with: 'h1', name: 'Ash' }), { type: 'trade_open', with: 'h1', name: 'Ash' });
  assert.deepEqual(frame({ type: 'trade_state', revision: 2, mine: SIDE, theirs: { ...SIDE, items: [], confirmed: true }, countdownEndsAt: AT }), {
    type: 'trade_state',
    revision: 2,
    mine: SIDE,
    theirs: { items: [], gold: 40, confirmed: true },
    countdownEndsAt: Date.parse(AT),
  });
  assert.deepEqual(frame({ type: 'trade_state', revision: 0, mine: SIDE, theirs: SIDE, countdownEndsAt: null })?.type, 'trade_state');
  assert.deepEqual(frame({ type: 'trade_done', gave: { items: [ITEM], gold: 0 }, got: { items: [], gold: 75 } }), { type: 'trade_done', gave: { items: [ITEM], gold: 0 }, got: { items: [], gold: 75 } });
});

void test('every refusal and close reason the server names is read, and an unknown one is not', (): void => {
  for (const reason of TRADE_REFUSALS) assert.deepEqual(frame({ type: 'trade_refused', reason }), { type: 'trade_refused', reason });
  for (const reason of TRADE_CLOSES) assert.deepEqual(frame({ type: 'trade_closed', reason }), { type: 'trade_closed', reason });
  assert.equal(frame({ type: 'trade_refused', reason: 'later' }), null);
  assert.equal(frame({ type: 'trade_closed', reason: 7 }), null);
});

void test('malformed trade frames are dropped whole', (): void => {
  for (const bad of [
    { type: 'trade_asked', from: 'h1', name: 'Ash', expiresAt: 'soon' },
    { type: 'trade_asked', from: '', name: 'Ash', expiresAt: AT },
    { type: 'trade_open', name: 'Ash' },
    { type: 'trade_state', revision: -1, mine: SIDE, theirs: SIDE, countdownEndsAt: null },
    { type: 'trade_state', revision: 1, mine: { ...SIDE, gold: 1.5 }, theirs: SIDE, countdownEndsAt: null },
    { type: 'trade_state', revision: 1, mine: { ...SIDE, confirmed: 'yes' }, theirs: SIDE, countdownEndsAt: null },
    { type: 'trade_state', revision: 1, mine: SIDE, theirs: SIDE, countdownEndsAt: 'later' },
    { type: 'trade_state', revision: 1, mine: { ...SIDE, items: [{ ...ITEM, affixes: [{ affix: 'sharp' }] }] }, theirs: SIDE, countdownEndsAt: null },
    { type: 'trade_state', revision: 1, mine: { ...SIDE, items: Array.from({ length: TRADE_LIMITS.items + 1 }, (): unknown => ITEM) }, theirs: SIDE, countdownEndsAt: null },
    { type: 'trade_done', gave: { items: [] }, got: { items: [], gold: 0 } },
    { type: 'trade_unknown' },
  ]) assert.equal(frame(bad), null, JSON.stringify(bad));
});

void test('the frames the client sends name what the server reads', (): void => {
  assert.deepEqual(JSON.parse(askFrame('h1')), { type: 'trade_ask', to: 'h1' });
  assert.deepEqual(JSON.parse(answerFrame(false)), { type: 'trade_answer', accept: false });
  assert.deepEqual(JSON.parse(offerFrame(['itm_a'], 12.7)), { type: 'trade_offer', items: ['itm_a'], gold: 12 });
  assert.deepEqual(JSON.parse(offerFrame([], -5)), { type: 'trade_offer', items: [], gold: 0 });
  assert.deepEqual(JSON.parse(confirmFrame(3)), { type: 'trade_confirm', revision: 3 });
  assert.deepEqual(JSON.parse(cancelFrame()), { type: 'trade_cancel' });
});
