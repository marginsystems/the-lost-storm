import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FriendsList } from '../backend/api.ts';
import type { EntryId, MenuAction, MenuEntry, MenuFacts, TradeStanding, TradeWatch, Watch } from './player-menu.ts';
import { actionOf, closeReason, cycle, friendStanding, menuEntries, PLAYER_MENU, placeMenu, tradeStanding } from './player-menu.ts';

const FACTS: MenuFacts = {
  friend: 'none',
  friendsAvailable: true,
  muted: false,
  blocked: false,
  blocksAvailable: true,
  reportAvailable: true,
  canMessage: false,
  trade: 'unsupported',
  reported: false,
  busy: new Set<EntryId>(),
};

const LIST: FriendsList = { friends: [{ name: 'Ash Walker', here: true }], incoming: ['Bright Reed'], outgoing: ['Cold Fen'] };

function entry(facts: MenuFacts, id: EntryId): MenuEntry {
  const found: MenuEntry | undefined = menuEntries(facts).find((candidate: MenuEntry): boolean => candidate.id === id);
  assert.ok(found !== undefined);
  return found;
}

function act(facts: MenuFacts, id: EntryId): MenuAction | null {
  return actionOf(entry(facts, id), facts);
}

void test('the menu always has the same six entries in the same order, so it never changes shape', (): void => {
  const variants: readonly MenuFacts[] = [FACTS, { ...FACTS, blocked: true, muted: true, friend: 'friends', canMessage: true, trade: 'ready' }, { ...FACTS, blocksAvailable: false, reportAvailable: false }];
  const shapes: readonly (readonly EntryId[])[] = variants.map((facts: MenuFacts): readonly EntryId[] => menuEntries(facts).map((made: MenuEntry): EntryId => made.id));
  for (const shape of shapes) assert.deepEqual(shape, ['message', 'trade', 'friend', 'mute', 'block', 'report']);
});

void test('Message and Trade that the server does not offer are shown disabled with Soon', (): void => {
  for (const id of ['message', 'trade'] as const) {
    const made: MenuEntry = entry(FACTS, id);
    assert.equal(made.enabled, false);
    assert.equal(made.soon, true);
    assert.equal(made.detail, PLAYER_MENU.soon);
    assert.equal(act(FACTS, id), null);
  }
  const ready: MenuFacts = { ...FACTS, canMessage: true, trade: 'ready' };
  assert.deepEqual(act(ready, 'message'), { type: 'message' });
  assert.deepEqual(act(ready, 'trade'), { type: 'trade' });
});

void test('the friend entry follows the friendship: add, sent, accept, friends', (): void => {
  assert.equal(friendStanding(LIST, 'ash walker'), 'friends');
  assert.equal(friendStanding(LIST, 'Bright Reed'), 'incoming');
  assert.equal(friendStanding(LIST, 'Cold Fen'), 'requested');
  assert.equal(friendStanding(LIST, 'Dun Moss'), 'none');
  assert.equal(friendStanding(null, 'Dun Moss'), 'unknown');
  assert.deepEqual(act(FACTS, 'friend'), { type: 'befriend' });
  assert.equal(entry({ ...FACTS, friend: 'requested' }, 'friend').label, 'Request sent');
  assert.equal(act({ ...FACTS, friend: 'requested' }, 'friend'), null);
  assert.equal(entry({ ...FACTS, friend: 'incoming' }, 'friend').label, 'Accept request');
  assert.deepEqual(act({ ...FACTS, friend: 'incoming' }, 'friend'), { type: 'accept' });
  assert.equal(entry({ ...FACTS, friend: 'friends' }, 'friend').label, 'Friends');
  assert.equal(act({ ...FACTS, friend: 'friends' }, 'friend'), null);
  assert.equal(entry({ ...FACTS, friend: 'unknown' }, 'friend').enabled, false);
  assert.equal(entry({ ...FACTS, friendsAvailable: false }, 'friend').enabled, false);
  assert.equal(entry({ ...FACTS, busy: new Set<EntryId>(['friend']) }, 'friend').enabled, false);
});

void test('Mute and Block say in a few words what each does, and toggle', (): void => {
  assert.equal(entry(FACTS, 'mute').detail, 'Hide their chat');
  assert.equal(entry(FACTS, 'block').detail, 'Hide them and refuse their requests');
  assert.deepEqual(act(FACTS, 'mute'), { type: 'mute' });
  assert.equal(entry({ ...FACTS, muted: true }, 'mute').label, 'Unmute');
  assert.deepEqual(act({ ...FACTS, muted: true }, 'mute'), { type: 'unmute' });
  assert.deepEqual(act(FACTS, 'block'), { type: 'ask_block' });
  assert.equal(entry({ ...FACTS, blocked: true }, 'block').label, 'Unblock');
  assert.deepEqual(act({ ...FACTS, blocked: true }, 'block'), { type: 'unblock' });
  assert.equal(entry({ ...FACTS, blocksAvailable: false }, 'block').enabled, false);
});

void test('a blocked player cannot be befriended, messaged or traded with from the menu', (): void => {
  const blocked: MenuFacts = { ...FACTS, blocked: true, canMessage: true, trade: 'ready' };
  assert.equal(act(blocked, 'friend'), null);
  assert.equal(entry(blocked, 'friend').detail, 'Unblock them first');
  assert.equal(act(blocked, 'message'), null);
  assert.equal(act(blocked, 'trade'), null);
  assert.equal(entry(blocked, 'trade').detail, 'Unblock them first');
});

void test('Report asks for a reason, and once sent says Reported and cannot be sent again', (): void => {
  assert.deepEqual(act(FACTS, 'report'), { type: 'ask_report' });
  const done: MenuFacts = { ...FACTS, reported: true };
  assert.equal(entry(done, 'report').label, 'Reported');
  assert.equal(act(done, 'report'), null);
  assert.equal(act({ ...FACTS, reportAvailable: false }, 'report'), null);
});

void test('the keyboard cycles through the buttons and wraps', (): void => {
  assert.equal(cycle(3, -1, 1), 0);
  assert.equal(cycle(3, -1, -1), 2);
  assert.equal(cycle(3, 2, 1), 0);
  assert.equal(cycle(3, 0, -1), 2);
  assert.equal(cycle(0, 0, 1), -1);
});

const WATCH: Watch = { here: true, inHideout: true, distance: 3, anchor: { x: 400, top: 300, bottom: 420 }, view: { width: 1280, height: 720 } };

void test('the menu closes when the player leaves, walks away, goes off screen, or the hero leaves the Hideout', (): void => {
  assert.equal(closeReason(WATCH), null);
  assert.equal(closeReason({ ...WATCH, here: false }), 'left');
  assert.equal(closeReason({ ...WATCH, distance: PLAYER_MENU.reach + 0.1 }), 'far');
  assert.equal(closeReason({ ...WATCH, anchor: null }), 'offscreen');
  assert.equal(closeReason({ ...WATCH, anchor: { x: -5, top: 300, bottom: 420 } }), 'offscreen');
  assert.equal(closeReason({ ...WATCH, anchor: { x: 400, top: 900, bottom: 1000 } }), 'offscreen');
  assert.equal(closeReason({ ...WATCH, inHideout: false, here: false }), 'zone');
});

void test('the menu sits above the player, centred, keeps a gutter from every edge, and drops below the feet only when there is no room above', (): void => {
  const size = { width: 236, height: 300 } as const;
  const view = { width: 1280, height: 720 } as const;
  assert.deepEqual(placeMenu({ x: 640, top: 400, bottom: 520 }, size, view, 10), { left: 522, top: 90, below: false });
  assert.equal(placeMenu({ x: 5, top: 400, bottom: 520 }, size, view, 10).left, PLAYER_MENU.edgeGutter);
  assert.equal(placeMenu({ x: 1275, top: 400, bottom: 520 }, size, view, 10).left, view.width - PLAYER_MENU.edgeGutter - size.width);
  assert.deepEqual(placeMenu({ x: 640, top: 120, bottom: 240 }, size, view, 10), { left: 522, top: 250, below: true });
  const cramped = placeMenu({ x: 640, top: 200, bottom: 500 }, size, view, 10);
  assert.equal(cramped.below, false);
  assert.equal(cramped.top, PLAYER_MENU.edgeGutter);
  const phone = placeMenu({ x: 190, top: 200, bottom: 260 }, size, { width: 375, height: 640 }, 10);
  assert.ok(phone.left >= PLAYER_MENU.edgeGutter && phone.left + size.width <= 375 - PLAYER_MENU.edgeGutter);
  assert.ok(phone.top >= PLAYER_MENU.edgeGutter && phone.top + size.height <= 640 - PLAYER_MENU.edgeGutter);
});

const NEAR: TradeWatch = { supported: true, trading: false, inHideout: true, here: true, distance: 3 };

void test('a trade can be asked only of someone near you in the Hideout while neither of you is trading', (): void => {
  const cases: readonly (readonly [TradeWatch, TradeStanding])[] = [
    [NEAR, 'ready'],
    [{ ...NEAR, distance: PLAYER_MENU.reach }, 'ready'],
    [{ ...NEAR, supported: false, trading: true }, 'unsupported'],
    [{ ...NEAR, trading: true, inHideout: false }, 'trading'],
    [{ ...NEAR, inHideout: false, here: false }, 'elsewhere'],
    [{ ...NEAR, here: false, distance: null }, 'away'],
    [{ ...NEAR, distance: PLAYER_MENU.reach + 0.1 }, 'far'],
    [{ ...NEAR, distance: null }, 'far'],
  ];
  for (const [watch, standing] of cases) assert.equal(tradeStanding(watch), standing, JSON.stringify(watch));
});

void test('when Trade cannot be asked the entry says why and does nothing', (): void => {
  const reasons: readonly (readonly [TradeStanding, string])[] = [
    ['trading', 'Finish your current trade first'],
    ['elsewhere', 'Only in the Hideout'],
    ['away', 'They are not in the Hideout'],
    ['far', 'Walk closer to them'],
  ];
  for (const [standing, detail] of reasons) {
    const facts: MenuFacts = { ...FACTS, trade: standing };
    assert.deepEqual([entry(facts, 'trade').detail, entry(facts, 'trade').soon, act(facts, 'trade')], [detail, false, null]);
  }
  assert.equal(entry({ ...FACTS, trade: 'ready' }, 'trade').detail, 'Offer items and gold');
  assert.equal(act({ ...FACTS, trade: 'ready', busy: new Set<EntryId>(['trade']) }, 'trade'), null);
});
