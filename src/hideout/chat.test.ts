import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatLine } from '../backend/live-protocol.ts';
import type { ChatEntry, ChatState } from './chat.ts';
import { addNote, CHAT, EMPTY_CHAT, friendText, receive, renameText, reportText, speaker } from './chat.ts';

function line(id: number, from: string, name: string, text: string): ChatLine {
  return { id, from, name, text, at: '2026-11-14T10:00:00.000Z' };
}

function texts(state: ChatState): string[] {
  return state.entries.map((entry: ChatEntry): string => (entry.kind === 'line' ? `${entry.line.name}: ${entry.line.text}` : `(${entry.text})`));
}

void test('the history from the welcome and each said line are shown once, oldest first', (): void => {
  let state: ChatState = receive(EMPTY_CHAT, { type: 'present', you: 'me', players: [], chat: [line(1, 'a', 'Ash', 'hello'), line(2, 'me', 'Wren', 'hi')] });
  state = receive(state, { type: 'said', line: line(3, 'a', 'Ash', 'welcome') });
  state = receive(state, { type: 'said', line: line(3, 'a', 'Ash', 'welcome') });
  state = receive(state, { type: 'present', you: 'me2', players: [], chat: [line(2, 'me', 'Wren', 'hi'), line(3, 'a', 'Ash', 'welcome')] });
  assert.deepEqual(texts(state), ['Ash: hello', 'Wren: hi', 'Ash: welcome']);
  const own: ChatEntry | undefined = state.entries[1];
  assert.equal(own?.kind === 'line' && own.own, true);
  assert.equal(speaker(own ?? state.entries[0] ?? { kind: 'note', key: 'x', text: '', note: 'plain' }), null);
  assert.equal(speaker(state.entries[0] ?? { kind: 'note', key: 'x', text: '', note: 'plain' }), 'Ash');
});

void test('a server without chat sends no history and the chat stays empty', (): void => {
  const state: ChatState = receive(EMPTY_CHAT, { type: 'present', you: 'me', players: [], chat: null });
  assert.deepEqual(state, EMPTY_CHAT);
  assert.equal(receive(state, { type: 'gone' }), state);
});

void test('a refusal becomes a dimmed note, and name_needed offers the name field', (): void => {
  let state: ChatState = receive(EMPTY_CHAT, { type: 'refused', reason: 'slow_down' });
  state = receive(state, { type: 'refused', reason: 'name_needed' });
  assert.deepEqual(
    state.entries.map((entry: ChatEntry): string => (entry.kind === 'note' ? `${entry.note}:${entry.text}` : '')),
    ['plain:Too fast. Wait a moment.', 'name:Choose a name to speak.'],
  );
});

void test('only the last lines are kept', (): void => {
  let state: ChatState = EMPTY_CHAT;
  for (let id: number = 1; id <= CHAT.keep + 10; id += 1) state = receive(state, { type: 'said', line: line(id, 'a', 'Ash', `line ${id}`) });
  state = addNote(state, 'a note');
  assert.equal(state.entries.length, CHAT.keep);
  assert.deepEqual(texts(state).slice(-2), [`Ash: line ${CHAT.keep + 10}`, '(a note)']);
});

void test('every report and friend answer has words for the player', (): void => {
  assert.equal(reportText('reported'), 'Reported. Thank you.');
  assert.equal(reportText('unsupported'), 'Reports are not available here.');
  assert.equal(friendText({ kind: 'ok', state: 'requested' }, 'Ash'), 'Friend request sent to Ash.');
  assert.equal(friendText({ kind: 'ok', state: 'friends' }, 'Ash'), 'You and Ash are friends.');
  assert.equal(friendText({ kind: 'refused', reason: 'no_such_character' }, 'Ash'), 'No one is called Ash.');
  assert.equal(friendText({ kind: 'unsupported' }, 'Ash'), 'Friends are not available here.');
  assert.equal(renameText({ kind: 'ok', name: 'Wren' }), 'You are Wren now. Say it again.');
  assert.equal(renameText({ kind: 'invalid', reason: 'name_taken' }), 'Someone already has that name.');
  assert.equal(renameText({ kind: 'retry', afterMs: null }), 'The ladder is out of reach. Try again in a moment.');
});
