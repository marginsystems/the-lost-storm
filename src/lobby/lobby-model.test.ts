import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoardRow, Leaderboard } from '../backend/lobby-api.ts';
import { agoText, asksForName, charactersText, levelUpText, nameProblem, passedNames, tidyName } from './lobby-model.ts';

function row(rank: number, name: string, level: number): BoardRow {
  return { rank, name, level, furthest: 'Stillhold', online: false };
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
