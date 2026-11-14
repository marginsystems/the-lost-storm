import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatLine } from '../backend/live-protocol.ts';
import type { ChatEntry, ChatState, ChatStep } from './chat.ts';
import { addNote, CHAT, CHAT_WORDS, command, destination, EMPTY_CHAT, friendText, GENERAL, readers, receive, renameText, reportText, speaker, target, unsentText } from './chat.ts';
import { parseChat } from './chat-command.ts';

function line(id: number, from: string | null, name: string, text: string, own: boolean | null = null): ChatLine {
  return { id, from, name, text, at: '2026-11-14T10:00:00.000Z', own };
}

function texts(state: ChatState): string[] {
  return state.entries.map((entry: ChatEntry): string => {
    switch (entry.kind) {
      case 'line':
        return `${entry.line.name}: ${entry.line.text}`;
      case 'whisper':
        return `${entry.dir === 'from' ? 'From' : 'To'} ${entry.with}: ${entry.line.text}`;
      case 'note':
        return `(${entry.text})`;
    }
    return '';
  });
}

const EVERYONE: ChatState = receive(EMPTY_CHAT, { type: 'welcome', you: 'c1', chat: [] });

function typed(state: ChatState, raw: string): ChatStep {
  return command(state, parseChat(raw, state.names));
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
  assert.equal(receive(state, { type: 'away' }), state);
});

void test('a server with chat everywhere makes General everyone online, and an older one only the Hideout', (): void => {
  assert.equal(EVERYONE.scope, 'everyone');
  assert.equal(readers(EVERYONE), 'Everyone online reads this.');
  const hideout: ChatState = receive(EMPTY_CHAT, { type: 'present', you: 'me', players: [], chat: [] });
  assert.equal(hideout.scope, 'hideout');
  assert.equal(readers(hideout), 'Everyone in the Hideout reads this.');
  assert.equal(receive(EVERYONE, { type: 'present', you: 'h1', players: [], chat: [] }).scope, 'everyone');
  assert.equal(destination(GENERAL), 'To General');
});

void test('the welcome history marks own lines by the server flag, or by handle on an older server', (): void => {
  const state: ChatState = receive(EMPTY_CHAT, { type: 'welcome', you: 'c1', chat: [line(1, null, 'Wren', 'mine', true), line(2, null, 'Ash', 'theirs', false), line(3, 'c1', 'Wren', 'by handle')] });
  assert.deepEqual(
    state.entries.map((entry: ChatEntry): boolean => entry.kind === 'line' && entry.own),
    [true, false, true],
  );
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

void test('a whisper in and out is shown with its direction, and one from someone sets who /r answers', (): void => {
  let state: ChatState = receive(EVERYONE, { type: 'whisper', dir: 'to', with: 'Bo Reed', line: line(7, 'c1', 'Wren', 'psst', true) });
  assert.equal(state.replyTo, null);
  state = receive(state, { type: 'whisper', dir: 'from', with: 'Ash', line: line(8, 'c2', 'Ash', 'hi', false) });
  state = receive(state, { type: 'whisper', dir: 'from', with: 'Ash', line: line(8, 'c2', 'Ash', 'hi', false) });
  assert.deepEqual(texts(state), ['To Bo Reed: psst', 'From Ash: hi']);
  assert.equal(state.replyTo, 'Ash');
  assert.equal(speaker(state.entries[1] ?? { kind: 'note', key: 'x', text: '', note: 'plain' }), 'Ash');
  assert.deepEqual(state.names, ['Bo Reed', 'Ash']);
});

void test('every reason a whisper was not sent has a plain line', (): void => {
  assert.equal(unsentText('no_such_player', 'Cold'), 'No one is called Cold. Put a name with spaces in quotes: /dm "Ash Walker" hello');
  assert.equal(unsentText('offline', 'Bo Reed'), 'Bo Reed is not online.');
  assert.equal(unsentText('ignored', 'Bo Reed'), 'Bo Reed is not taking your whispers.');
  assert.equal(unsentText('self', 'Wren'), 'That is you.');
  assert.equal(unsentText('slow_down', 'Bo'), 'Too fast. Wait a moment.');
  const state: ChatState = receive(EVERYONE, { type: 'unsent', reason: 'name_needed', to: 'Bo' });
  assert.deepEqual(
    state.entries.map((entry: ChatEntry): string => (entry.kind === 'note' ? `${entry.note}:${entry.text}` : '')),
    ['name:Choose a name to whisper.'],
  );
});

void test('/dm name message whispers and keeps talking to that player until /g', (): void => {
  let step: ChatStep = typed(EVERYONE, '/dm Bo hello');
  assert.deepEqual(step.action, { kind: 'whisper', to: 'Bo', text: 'hello' });
  assert.deepEqual(step.state.target, { kind: 'whisper', name: 'Bo' });
  assert.equal(readers(step.state), 'Only you and Bo read this.');
  assert.equal(destination(step.state.target), 'To Bo');
  step = typed(step.state, 'still you?');
  assert.deepEqual(step.action, { kind: 'whisper', to: 'Bo', text: 'still you?' });
  step = typed(step.state, '/g');
  assert.deepEqual(step.action, { kind: 'none' });
  assert.equal(step.keepOpen, true);
  assert.deepEqual(step.state.target, GENERAL);
  step = typed(step.state, 'hello all');
  assert.deepEqual(step.action, { kind: 'say', text: 'hello all' });
});

void test('/dm name alone switches the channel and keeps the input open; /g message says it in General', (): void => {
  const step: ChatStep = typed(EVERYONE, '/w Ash');
  assert.deepEqual(step.action, { kind: 'none' });
  assert.equal(step.keepOpen, true);
  assert.deepEqual(step.state.target, { kind: 'whisper', name: 'Ash' });
  const back: ChatStep = typed(step.state, '/g hi all');
  assert.deepEqual(back.action, { kind: 'say', text: 'hi all' });
  assert.deepEqual(back.state.target, GENERAL);
});

void test('a name seen in chat is matched whole even with spaces', (): void => {
  const state: ChatState = receive(EVERYONE, { type: 'said', line: line(3, 'c2', 'Bo Reed', 'hey', false) });
  assert.deepEqual(typed(state, '/dm bo reed are you there').action, { kind: 'whisper', to: 'Bo Reed', text: 'are you there' });
});

void test('/r answers the last whisper, or says no one has whispered', (): void => {
  const none: ChatStep = typed(EVERYONE, '/r hi');
  assert.deepEqual(none.action, { kind: 'none' });
  assert.deepEqual(texts(none.state), [`(${CHAT_WORDS.noReply})`]);
  const heard: ChatState = receive(EVERYONE, { type: 'whisper', dir: 'from', with: 'Ash', line: line(8, 'c2', 'Ash', 'hi', false) });
  const answered: ChatStep = typed(heard, '/r on my way');
  assert.deepEqual(answered.action, { kind: 'whisper', to: 'Ash', text: 'on my way' });
  assert.deepEqual(answered.state.target, { kind: 'whisper', name: 'Ash' });
});

void test('an unknown command, a whisper with no name and /help add a line and send nothing', (): void => {
  const unknown: ChatStep = typed(EVERYONE, '/dance');
  assert.deepEqual(unknown.action, { kind: 'none' });
  assert.deepEqual(texts(unknown.state), ['(/dance is not a command. Try /dm name, /r or /g.)']);
  const nameless: ChatStep = typed(EVERYONE, '/dm');
  assert.deepEqual(texts(nameless.state), ['(Name a player: /dm name message)']);
  const help: ChatStep = typed(EVERYONE, '/help');
  assert.equal(help.state.entries[0]?.kind === 'note' ? help.state.entries[0].note : '', 'hint');
});

void test('on a server without whispers a whisper says so and General stays the channel', (): void => {
  const hideout: ChatState = receive(EMPTY_CHAT, { type: 'present', you: 'me', players: [], chat: [] });
  const step: ChatStep = typed(hideout, '/dm Bo hi');
  assert.deepEqual(step.action, { kind: 'none' });
  assert.deepEqual(step.state.target, GENERAL);
  assert.deepEqual(texts(step.state), [`(${CHAT_WORDS.noWhispers})`]);
});

void test('choosing Message on a name aims the chat at that player and General puts it back', (): void => {
  const aimed: ChatState = target(EVERYONE, { kind: 'whisper', name: 'Cy' });
  assert.equal(destination(aimed.target), 'To Cy');
  assert.deepEqual(aimed.names, ['Cy']);
  assert.deepEqual(target(aimed, GENERAL).target, GENERAL);
  assert.equal(target(EVERYONE, GENERAL), EVERYONE);
});

void test('players who enter or are renamed in the Hideout become names the parser knows', (): void => {
  let state: ChatState = receive(EVERYONE, { type: 'joined', player: { id: 'h2', name: 'Grim Hollow', hero: null, worn: {}, x: 0, z: 0, facing: 0 } });
  state = receive(state, { type: 'look', id: 'h2', name: 'Grim Vale', hero: null, worn: {} });
  assert.deepEqual(state.names, ['Grim Hollow', 'Grim Vale']);
  assert.deepEqual(typed(state, '/dm grim vale hello').action, { kind: 'whisper', to: 'Grim Vale', text: 'hello' });
});
