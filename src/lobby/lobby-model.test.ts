import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoardRow, Leaderboard } from '../backend/api.ts';
import { agoText, asksForName, charactersText, CHOSEN_NAMES, chooseName, levelUpText, nameProblem, passedNames, spokenName, tidyName } from './lobby-model.ts';

function row(rank: number, name: string, level: number): BoardRow {
  return { rank, name, level, furthest: 'The Waystation', online: false, account: null };
}

function board(top: readonly BoardRow[], you: string | null, chosen: boolean = true): Leaderboard {
  const mine: BoardRow | undefined = top.find((entry: BoardRow): boolean => entry.name === you);
  return { top, you: mine === undefined ? null : { ...mine, chosen }, online: 1, characters: top.length, levelUps: [] };
}

void test('passing someone names everyone who was ahead and now is behind', (): void => {
  const before: Leaderboard = board([row(1, 'Ash', 6), row(2, 'Moth', 5), row(3, 'Wren', 5), row(4, 'Me', 4)], 'Me');
  const after: Leaderboard = board([row(1, 'Ash', 6), row(2, 'Me', 5), row(3, 'Moth', 5), row(4, 'Wren', 5)], 'Me');
  assert.deepEqual(passedNames(before, after), ['Moth', 'Wren']);
});

void test('a player who drops off the bottom of the board while the caller climbs onto it was passed', (): void => {
  const before: Leaderboard = { ...board([row(1, 'Ash', 6), row(2, 'Moth', 3)], null), you: { ...row(3, 'Me', 3), chosen: true } };
  const after: Leaderboard = board([row(1, 'Ash', 6), row(2, 'Me', 4)], 'Me');
  assert.deepEqual(passedNames(before, after), ['Moth']);
});

void test('no one is passed on the first read, when the rank holds or drops, or when the character changed', (): void => {
  const before: Leaderboard = board([row(1, 'Ash', 6), row(2, 'Me', 4)], 'Me');
  assert.deepEqual(passedNames(null, before), []);
  assert.deepEqual(passedNames(before, before), []);
  assert.deepEqual(passedNames(before, board([row(1, 'Ash', 6), row(2, 'Moth', 5), row(3, 'Me', 4)], 'Me')), []);
  assert.deepEqual(passedNames(before, board([row(1, 'Other', 7)], 'Other')), []);
  assert.deepEqual(passedNames(board([row(1, 'Ash', 6)], null), before), []);
});

void test('the name check mirrors the server rules it can know without asking', (): void => {
  assert.equal(nameProblem('Al'), 'name_length');
  assert.equal(nameProblem('  Al  '), 'name_length');
  assert.equal(nameProblem('Seventeen Letters'), 'name_length');
  assert.equal(nameProblem('Wren_1'), 'name_characters');
  assert.equal(nameProblem('123'), 'name_characters');
  assert.equal(nameProblem('Grey   Heron'), null);
  assert.equal(tidyName('  Grey   Heron '), 'Grey Heron');
});

void test('a fresh or unnamed character is asked for a name, a named one is not', (): void => {
  assert.equal(asksForName(board([], null)), true);
  assert.equal(asksForName(board([row(1, 'Ashen Wolf', 2)], 'Ashen Wolf', false)), true);
  assert.equal(asksForName(board([row(1, 'Wren', 2)], 'Wren', true)), false);
});

void test('times and counts read as short words', (): void => {
  assert.equal(agoText(0), 'just now');
  assert.equal(agoText(7), '7m ago');
  assert.equal(agoText(125), '2h ago');
  assert.equal(agoText(60 * 50), '2d ago');
  assert.equal(charactersText(1), '1 character');
  assert.equal(charactersText(12), '12 characters');
  assert.equal(levelUpText({ name: 'Wren', level: 4, minutesAgo: 1 }), 'Wren reached level 4');
});

void test('choose for me picks a name the rules accept and never one already refused', (): void => {
  const man: readonly string[] = CHOSEN_NAMES.man;
  for (const name of [...man, ...CHOSEN_NAMES.woman]) assert.equal(nameProblem(name), null);
  assert.equal(chooseName('man', (): number => 0, new Set<string>()), man[0]);
  assert.equal(chooseName('man', (): number => 0.9999, new Set<string>()), man.at(-1));
  assert.equal(chooseName('man', (): number => 0, new Set<string>([man[0] ?? ''])), man[1]);
  assert.equal(chooseName('man', (): number => 0.5, new Set<string>(man)), null);
});

void test('a man is never offered a woman\'s name, and the other way round', (): void => {
  const either: ReadonlySet<string> = new Set<string>(CHOSEN_NAMES.man.filter((name: string): boolean => CHOSEN_NAMES.woman.includes(name)));
  for (const name of ['Liesl', 'Anwen', 'Edda']) assert.ok(!CHOSEN_NAMES.man.includes(name));
  for (const name of ['Tavin', 'Joren', 'Teodor']) assert.ok(!CHOSEN_NAMES.woman.includes(name));
  for (let draw: number = 0; draw < 40; draw += 1) {
    const picked: string | null = chooseName('man', (): number => draw / 40, new Set<string>());
    assert.ok(picked !== null && (either.has(picked) || !CHOSEN_NAMES.woman.includes(picked)));
  }
});

void test('only a name the player chose is ever spoken', (): void => {
  assert.equal(spokenName(board([row(1, 'Guest 4821', 1)], 'Guest 4821', false)), null);
  assert.equal(spokenName(board([row(1, 'Tavin', 1)], 'Tavin', true)), 'Tavin');
  assert.equal(spokenName(board([row(1, 'Ash', 3)], null)), null);
  assert.equal(spokenName(null), null);
});
