import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardNode, CLOSED_CARD, stepCard } from './tree-card.ts';
import type { CardEvent, CardState, CardTimer } from './tree-card.ts';

interface Run {
  readonly state: CardState;
  readonly timers: readonly CardTimer[];
}

function run(events: readonly CardEvent[], from: CardState = CLOSED_CARD): Run {
  let state: CardState = from;
  const timers: CardTimer[] = [];
  for (const event of events) {
    const step = stepCard(state, event);
    state = step.state;
    timers.push(step.timer);
  }
  return { state, timers };
}

const OPEN: CardEvent = { type: 'open' };
const CLOSE: CardEvent = { type: 'close' };
const DWELL: CardEvent = { type: 'dwell' };
const GRACE: CardEvent = { type: 'grace' };

function at(node: string | null): CardEvent {
  return { type: 'point', node };
}

function pin(node: string): CardEvent {
  return { type: 'pin', node };
}

void test('the tree opens with no card', (): void => {
  assert.equal(cardNode(run([OPEN]).state), null);
});

void test('open, hover, close, reopen: no card', (): void => {
  const hovered: Run = run([OPEN, at('thick_skin'), DWELL]);
  assert.equal(cardNode(hovered.state), 'thick_skin');
  const reopened: Run = run([CLOSE, OPEN], hovered.state);
  assert.equal(cardNode(reopened.state), null);
  assert.deepEqual(reopened.timers, ['stop', 'stop']);
});

void test('a place taken by a click does not show its card when the tree opens again', (): void => {
  const taken: Run = run([OPEN, at('thick_skin'), pin('thick_skin')]);
  assert.equal(cardNode(taken.state), 'thick_skin');
  assert.equal(cardNode(run([CLOSE, OPEN], taken.state).state), null);
});

void test('a dwell or grace that fires after the tree closes shows nothing, then or on the next open', (): void => {
  const closed: Run = run([OPEN, at('thick_skin'), CLOSE, DWELL, GRACE]);
  assert.equal(cardNode(closed.state), null);
  assert.equal(cardNode(run([OPEN], closed.state).state), null);
  assert.equal(cardNode(run([OPEN, DWELL], closed.state).state), null);
});

void test('nothing the pointer does while the tree is closed reaches the card', (): void => {
  const closed: Run = run([at('thick_skin'), DWELL, pin('thick_skin'), { type: 'enter_card' }]);
  assert.equal(cardNode(closed.state), null);
  assert.equal(cardNode(run([OPEN], closed.state).state), null);
});

void test('a card shows only after the pointer moves onto a place and rests there', (): void => {
  const moved: Run = run([OPEN, at('thick_skin')]);
  assert.equal(cardNode(moved.state), null);
  assert.deepEqual(moved.timers, ['stop', 'dwell']);
  assert.equal(cardNode(run([DWELL], moved.state).state), 'thick_skin');
});

void test('leaving a place holds its card for the grace, then drops it', (): void => {
  const left: Run = run([OPEN, at('thick_skin'), DWELL, at(null)]);
  assert.equal(cardNode(left.state), 'thick_skin');
  assert.equal(left.timers.at(-1), 'grace');
  assert.equal(cardNode(run([GRACE], left.state).state), null);
});

void test('reaching the card holds it, and leaving the card drops it after the grace', (): void => {
  const onCard: Run = run([OPEN, at('thick_skin'), DWELL, at(null), { type: 'enter_card' }]);
  assert.equal(onCard.timers.at(-1), 'stop');
  assert.equal(cardNode(onCard.state), 'thick_skin');
  const offCard: Run = run([{ type: 'leave_card' }, GRACE], onCard.state);
  assert.deepEqual(offCard.timers, ['grace', 'none']);
  assert.equal(cardNode(offCard.state), null);
});

void test('a mouse leaving a clicked place lets its card go through the same grace as a hover', (): void => {
  const clicked: Run = run([OPEN, at('thick_skin'), pin('thick_skin'), at(null)]);
  assert.equal(cardNode(clicked.state), 'thick_skin');
  assert.equal(clicked.timers.at(-1), 'grace');
  assert.equal(cardNode(run([GRACE], clicked.state).state), null);
});

void test('a click on a new place shows that place, not the one hovered before', (): void => {
  const clicked: Run = run([OPEN, at('a'), DWELL, at('b'), pin('b')]);
  assert.equal(cardNode(clicked.state), 'b');
  assert.equal(clicked.timers.at(-1), 'stop');
});

void test('a tap pin with no pointer movement stays until the tree closes', (): void => {
  const tapped: Run = run([OPEN, pin('thick_skin'), GRACE, DWELL]);
  assert.equal(cardNode(tapped.state), 'thick_skin');
  assert.equal(cardNode(run([CLOSE], tapped.state).state), null);
});

void test('starting a drag drops the card at once', (): void => {
  const dragged: Run = run([OPEN, at('thick_skin'), DWELL, pin('thick_skin'), { type: 'clear' }]);
  assert.equal(cardNode(dragged.state), null);
  assert.equal(dragged.timers.at(-1), 'stop');
});
