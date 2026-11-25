import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstSlot } from '../backend/roster.ts';
import type { Roster, Slot } from '../backend/roster.ts';
import { canCreate, createRefusalText, deleteWording, EMPTY_KEY, removeRefusalText, sameCards, STRIP_TEXT, stripCards } from './character-strip-model.ts';
import type { CardView, HeroNames, LiveCharacter, StripFacts } from './character-strip-model.ts';
import { NAME_MESSAGES } from './lobby-model.ts';

const HEROES: HeroNames = { name: (id: string): string | null => (id === 'woman' ? 'Woman' : id === 'man' ? 'Man' : null) };

function slot(key: string, name: string | null, level: number | null, hero: string | null, id: string | null = null): Slot {
  return { key, id, legacy: false, name, hero, level };
}

const UNWOKEN: LiveCharacter = { name: null, hero: null, level: null };

function facts(roster: Roster, overrides: Partial<StripFacts> = {}): StripFacts {
  return { roster, heroes: HEROES, firstOnServer: true, accountFull: false, live: UNWOKEN, ...overrides };
}

void test('each character shows its name, level and hero, the one in play is lit, and an empty place offers a new character', (): void => {
  const roster: Roster = { active: 'b', account: null, slots: [{ ...firstSlot(), name: 'Grey Heron', level: 4, hero: 'man' }, slot('b', 'Bright Reed', null, 'woman')] };
  const cards: readonly CardView[] = stripCards(facts(roster, { live: { ...UNWOKEN, hero: 'woman' } }));
  assert.deepEqual(cards, [
    { kind: 'character', key: 'first', name: 'Grey Heron', detail: 'Level 4 · Man', active: false, note: null },
    { kind: 'character', key: 'b', name: 'Bright Reed', detail: 'Not yet woken · Woman', active: true, note: null },
    { kind: 'empty', key: EMPTY_KEY, name: STRIP_TEXT.newCharacter, detail: STRIP_TEXT.newDetail, open: true, note: null },
  ]);
});

void test('six characters leave no empty place, and the name in play comes from the lobby when it is known there', (): void => {
  const roster: Roster = { active: 'first', account: null, slots: [firstSlot(), slot('b', 'B', 1, null), slot('c', 'C', 2, null), slot('d', 'D', 3, null), slot('e', 'E', 4, null), slot('f', 'F', 5, null)] };
  const cards: readonly CardView[] = stripCards(facts(roster, { live: { ...UNWOKEN, name: 'Ash Walker' } }));
  assert.equal(cards.length, 6);
  assert.equal(cards[0]?.name, 'Ash Walker');
  assert.equal(canCreate(facts(roster)), false);
});

void test('a new character waits until the first one is on the server, and says why', (): void => {
  const roster: Roster = { active: 'first', account: 'acc', slots: [firstSlot()] };
  const cards: readonly CardView[] = stripCards(facts(roster, { firstOnServer: false }));
  assert.deepEqual(cards[1], { kind: 'empty', key: EMPTY_KEY, name: STRIP_TEXT.newCharacter, detail: STRIP_TEXT.newDetail, open: false, note: STRIP_TEXT.firstFirst });
  assert.equal(cards[0]?.name, STRIP_TEXT.unnamed);
});

void test('the character in play shows the hero picked in the lobby at once, even when the stored entry and the server still say another', (): void => {
  const roster: Roster = { active: 'b', account: 'acc', slots: [{ ...firstSlot(), name: 'Grey Heron', level: 4, hero: 'man' }, slot('b', 'Lotte Sleepless', 1, 'man', 'srv-b')] };
  assert.equal(stripCards(facts(roster))[1]?.detail, STRIP_TEXT.fresh);
  assert.equal(stripCards(facts(roster, { live: { ...UNWOKEN, hero: 'woman' } }))[1]?.detail, 'Not yet woken · Woman');
  assert.equal(stripCards(facts(roster, { live: { ...UNWOKEN, hero: 'man' } }))[1]?.detail, 'Not yet woken · Man');
  assert.equal(stripCards(facts(roster, { live: { name: null, hero: 'woman', level: 3 } }))[1]?.detail, 'Level 3 · Woman');
  assert.equal(stripCards(facts(roster, { live: { ...UNWOKEN, hero: 'woman' } }))[0]?.detail, 'Level 4 · Man');
});

void test('a character made on the device when the account had no room says it is not on the account', (): void => {
  const roster: Roster = { active: 'first', account: 'acc', slots: [{ ...firstSlot(), id: 'acc' }, slot('b', 'Local', 2, null)] };
  assert.equal(stripCards(facts(roster, { accountFull: true }))[1]?.note, STRIP_TEXT.offAccount);
  assert.equal(stripCards(facts(roster))[1]?.note, null);
});

void test('refusals read as the same words the name step uses, and deleting the only character reads as starting over', (): void => {
  assert.equal(createRefusalText('name_taken'), NAME_MESSAGES.name_taken);
  assert.equal(createRefusalText('character_limit'), STRIP_TEXT.full);
  assert.deepEqual(deleteWording('Grey Heron', true), { ask: 'Start over? Grey Heron and everything they carry is gone for good.', yes: STRIP_TEXT.startOverYes });
  assert.equal(deleteWording('Grey Heron', false).yes, STRIP_TEXT.deleteYes);
  assert.equal(removeRefusalText('removed', 'Grey Heron'), null);
  assert.equal(removeRefusalText('listed', 'Grey Heron'), `Grey Heron ${STRIP_TEXT.listed}`);
  assert.equal(removeRefusalText('offline', 'Grey Heron'), STRIP_TEXT.offline);
});

void test('the same cards in the same order are the same, and nothing is the same as no render yet', (): void => {
  const roster: Roster = { active: 'b', account: null, slots: [{ ...firstSlot(), name: 'Grey Heron', level: 4, hero: 'man' }, slot('b', 'Bright Reed', null, 'woman')] };
  const cards: readonly CardView[] = stripCards(facts(roster));
  assert.equal(sameCards(cards, stripCards(facts(roster))), true);
  assert.equal(sameCards(null, cards), false);
  assert.equal(sameCards([], []), true);
});

void test('a card that shows something different is a different set of cards', (): void => {
  const roster: Roster = { active: 'b', account: null, slots: [{ ...firstSlot(), name: 'Grey Heron', level: 4, hero: 'man' }, slot('b', 'Bright Reed', null, 'woman')] };
  const cards: readonly CardView[] = stripCards(facts(roster));
  assert.equal(sameCards(cards, stripCards(facts({ ...roster, active: 'first' }))), false);
  assert.equal(sameCards(cards, stripCards(facts(roster, { live: { name: 'Bright Reed', hero: 'woman', level: 2 } }))), false);
  assert.equal(sameCards(cards, stripCards(facts(roster, { firstOnServer: false }))), false);
  assert.equal(sameCards(cards, cards.slice(0, 2)), false);
  assert.equal(sameCards(cards, [...cards.slice(0, 2).toReversed(), ...cards.slice(2)]), false);
});
