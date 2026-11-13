import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryStore } from '../../test/backend-support.ts';
import { armPlay, calm, closePlay, IDLE_PLAY, KEEP_PROMPT, keepDismissed, levelGained, quiet, readDismissed, stepPlay, worthAsking } from './keep-prompt.ts';
import type { Foe, KeepFacts, PlayMoment, PlayPrompt } from './keep-prompt.ts';

const NOW: number = 1_800_000_000_000;
const GUEST: KeepFacts = { offered: true, cloud: true, online: true, level: 2, dismissedAt: null, now: NOW };
const FREE: PlayMoment = { worth: true, onScreen: true, calm: true, dt: 1 };
const HERO: { readonly x: number; readonly z: number } = { x: 0, z: 0 };

function foe(alive: boolean, aggro: boolean, x: number): Foe {
  return { alive, aggro, pos: { x, z: 0 } };
}

function after(state: PlayPrompt, moments: readonly PlayMoment[]): PlayPrompt {
  return moments.reduce((held: PlayPrompt, moment: PlayMoment): PlayPrompt => stepPlay(held, moment), state);
}

void test('a guest with a level to lose, a sign-in on offer and a reachable cloud is asked', (): void => {
  assert.equal(worthAsking(GUEST), true);
  assert.equal(worthAsking({ ...GUEST, level: 9 }), true);
});

void test('nobody is asked before the first level-up', (): void => {
  assert.equal(worthAsking({ ...GUEST, level: 1 }), false);
});

void test('nobody is asked when no sign-in is on offer: signed in, no server, no provider or the server out of reach', (): void => {
  assert.equal(worthAsking({ ...GUEST, offered: false }), false);
});

void test('nobody is asked with no network', (): void => {
  assert.equal(worthAsking({ ...GUEST, cloud: false }), false);
  assert.equal(worthAsking({ ...GUEST, online: false }), false);
});

void test('a dismissal keeps the prompt quiet for three days and no longer', (): void => {
  assert.equal(worthAsking({ ...GUEST, dismissedAt: NOW }), false);
  assert.equal(worthAsking({ ...GUEST, dismissedAt: NOW - KEEP_PROMPT.quietMs + 1 }), false);
  assert.equal(worthAsking({ ...GUEST, dismissedAt: NOW - KEEP_PROMPT.quietMs }), true);
  assert.equal(KEEP_PROMPT.quietMs, 3 * 24 * 60 * 60 * 1000);
});

void test('a dismissal stamped in the future by a changed clock is not held for ever', (): void => {
  assert.equal(quiet(NOW + 1000, NOW), true);
  assert.equal(quiet(NOW + KEEP_PROMPT.quietMs, NOW), false);
});

void test('the dismissal is kept in the browser store and a bad stored value is ignored', (): void => {
  const store = createMemoryStore();
  assert.equal(readDismissed(store), null);
  keepDismissed(store, NOW + 0.6);
  assert.equal(readDismissed(store), NOW);
  assert.equal(store.entries.get(KEEP_PROMPT.key), String(NOW));
  store.write(KEEP_PROMPT.key, 'yesterday');
  assert.equal(readDismissed(store), null);
  store.write(KEEP_PROMPT.key, '-5');
  assert.equal(readDismissed(store), null);
});

void test('a dismissal that cannot be stored does not throw', (): void => {
  const store = createMemoryStore();
  store.failWrites = true;
  keepDismissed(store, NOW);
  assert.equal(readDismissed(store), null);
});

void test('the hero is out of a fight only with no awake monster near and a while since the last hit', (): void => {
  assert.equal(calm([], HERO, Number.POSITIVE_INFINITY), true);
  assert.equal(calm([], HERO, KEEP_PROMPT.calmSeconds), true);
  assert.equal(calm([], HERO, KEEP_PROMPT.calmSeconds - 0.1), false);
  assert.equal(calm([foe(true, true, KEEP_PROMPT.fightRadius)], HERO, 60), false);
  assert.equal(calm([foe(true, true, KEEP_PROMPT.fightRadius + 1)], HERO, 60), true);
  assert.equal(calm([foe(true, false, 1), foe(false, true, 1)], HERO, 60), true);
});

void test('a level counts as gained whenever it rises, so one gained as a zone change begins is not missed', (): void => {
  assert.equal(levelGained(1, 2), true);
  assert.equal(levelGained(1, 4), true);
  assert.equal(levelGained(2, 2), false);
  assert.equal(levelGained(5, 1), false);
});

void test('a level gained while the screen is taken arms the card, which shows once the screen is free', (): void => {
  const armed: PlayPrompt = stepPlay(armPlay(IDLE_PLAY), { ...FREE, onScreen: false });
  assert.deepEqual([armed.armed, armed.visible, armed.shownFor], [true, false, 0]);
  assert.equal(stepPlay(armed, FREE).visible, true);
});

void test('the card in play does not show until a level is gained on this visit', (): void => {
  assert.equal(stepPlay(IDLE_PLAY, FREE).visible, false);
  assert.equal(stepPlay(armPlay(IDLE_PLAY), FREE).visible, true);
});

void test('the card waits for a calm moment, leaves when a fight starts and comes back after it', (): void => {
  const waiting: PlayPrompt = stepPlay(armPlay(IDLE_PLAY), { ...FREE, calm: false });
  assert.equal(waiting.visible, false);
  const shown: PlayPrompt = stepPlay(waiting, FREE);
  assert.equal(shown.visible, true);
  const fighting: PlayPrompt = stepPlay(shown, { ...FREE, calm: false });
  assert.equal(fighting.visible, false);
  assert.equal(fighting.spent, false);
  assert.equal(stepPlay(fighting, FREE).visible, true);
});

void test('the card stays away while a menu, a zone change or a hidden HUD has the screen, and when asking is not worth it', (): void => {
  assert.equal(stepPlay(armPlay(IDLE_PLAY), { ...FREE, onScreen: false }).visible, false);
  assert.equal(stepPlay(armPlay(IDLE_PLAY), { ...FREE, worth: false }).visible, false);
});

void test('time counts only while the card is on screen, and it leaves for good after its share', (): void => {
  const half: number = KEEP_PROMPT.showSeconds / 2;
  const once: PlayPrompt = after(armPlay(IDLE_PLAY), [{ ...FREE, dt: half - 1 }, { ...FREE, calm: false, dt: 500 }, { ...FREE, dt: half }]);
  assert.equal(once.visible, true);
  assert.equal(once.shownFor, KEEP_PROMPT.showSeconds - 1);
  const done: PlayPrompt = stepPlay(once, { ...FREE, dt: 1 });
  assert.deepEqual([done.visible, done.spent], [false, true]);
  assert.equal(stepPlay(armPlay(done), FREE).visible, false);
});

void test('closing the card ends it for this visit, and another level does not bring it back', (): void => {
  const closed: PlayPrompt = closePlay(stepPlay(armPlay(IDLE_PLAY), FREE));
  assert.deepEqual([closed.visible, closed.spent], [false, true]);
  assert.equal(stepPlay(armPlay(closed), FREE).visible, false);
});

void test('a frame that runs backwards adds no time', (): void => {
  assert.equal(stepPlay(armPlay(IDLE_PLAY), { ...FREE, dt: -4 }).shownFor, 0);
});
