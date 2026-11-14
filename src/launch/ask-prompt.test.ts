import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryStore } from '../../test/backend-support.ts';
import { ASK_PROMPT, atRest, IDLE_ASK, keepAskSpent, readAskSpent, spendAsk, stepAsk, worthAsking } from './ask-prompt.ts';
import type { AskFacts, AskMoment, AskPrompt } from './ask-prompt.ts';

const READY: AskFacts = { canSend: true, spent: false, sent: false, minutes: 12, level: 3, zone: 'hideout', flags: {} };
const FREE: AskMoment = { worth: true, onScreen: true, calm: true, dt: 1 };

function after(state: AskPrompt, moments: readonly AskMoment[]): AskPrompt {
  return moments.reduce((held: AskPrompt, moment: AskMoment): AskPrompt => stepAsk(held, moment), state);
}

void test('a player who has played ten minutes and stands in the Hideout is asked', (): void => {
  assert.equal(worthAsking(READY), true);
  assert.equal(worthAsking({ ...READY, minutes: ASK_PROMPT.minMinutes }), true);
});

void test('nobody is asked before ten minutes of play', (): void => {
  assert.equal(worthAsking({ ...READY, minutes: ASK_PROMPT.minMinutes - 1 }), false);
  assert.equal(worthAsking({ ...READY, minutes: 0 }), false);
});

void test('the pause has to be a natural one: the Hideout, the campfire or level five', (): void => {
  const field: AskFacts = { ...READY, zone: 'shallows', level: 2, flags: {} };
  assert.equal(worthAsking(field), false);
  assert.equal(worthAsking({ ...field, zone: ASK_PROMPT.restZone }), true);
  assert.equal(worthAsking({ ...field, flags: { camp: 'reached' } }), true);
  assert.equal(worthAsking({ ...field, flags: { camp: 'seen' } }), false);
  assert.equal(worthAsking({ ...field, level: ASK_PROMPT.minLevel }), true);
  assert.equal(atRest({ ...field, level: ASK_PROMPT.minLevel - 1 }), false);
});

void test('nobody is asked without a server to send to', (): void => {
  assert.equal(worthAsking({ ...READY, canSend: false }), false);
});

void test('nobody is asked again once they were asked or have sent feedback', (): void => {
  assert.equal(worthAsking({ ...READY, spent: true }), false);
  assert.equal(worthAsking({ ...READY, sent: true }), false);
});

void test('the line shows only while the moment is free, and hides the same step it is not', (): void => {
  const shown: AskPrompt = stepAsk(IDLE_ASK, FREE);
  assert.equal(shown.visible, true);
  for (const blocked of [{ ...FREE, worth: false }, { ...FREE, onScreen: false }, { ...FREE, calm: false }]) {
    const hiddenNow: AskPrompt = stepAsk(shown, blocked);
    assert.equal(hiddenNow.visible, false);
    assert.equal(hiddenNow.spent, false);
  }
});

void test('a line hidden by a fight comes back with the time it has left', (): void => {
  const state: AskPrompt = after(IDLE_ASK, [FREE, FREE, { ...FREE, calm: false }]);
  assert.equal(state.visible, false);
  assert.equal(state.shownFor, 2);
  assert.equal(stepAsk(state, FREE).shownFor, 3);
});

void test('a line nobody answers is spent after its time and never returns', (): void => {
  const state: AskPrompt = after(IDLE_ASK, [{ ...FREE, dt: ASK_PROMPT.showSeconds }]);
  assert.equal(state.spent, true);
  assert.equal(state.visible, false);
  assert.equal(stepAsk(state, FREE).visible, false);
});

void test('spending the line hides it and keeps it hidden', (): void => {
  const state: AskPrompt = spendAsk(stepAsk(IDLE_ASK, FREE));
  assert.equal(state.spent, true);
  assert.equal(state.visible, false);
  assert.equal(stepAsk(state, FREE).visible, false);
});

void test('a negative step never takes time back', (): void => {
  assert.equal(stepAsk(IDLE_ASK, { ...FREE, dt: -5 }).shownFor, 0);
});

void test('the spent mark is kept in the browser store and nothing else reads as spent', (): void => {
  const store = createMemoryStore();
  assert.equal(readAskSpent(store), false);
  keepAskSpent(store);
  assert.equal(readAskSpent(store), true);
  store.write(ASK_PROMPT.key, 'later');
  assert.equal(readAskSpent(store), false);
});
