import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nameKey, parseChat } from './chat-command.ts';

const KNOWN: readonly string[] = ['Bo Reed', 'Ash', 'Grim Hollow Vale', 'Wren'];

void test('plain text is said to the current channel, and blank input is nothing', (): void => {
  assert.deepEqual(parseChat('  hello there  ', KNOWN), { kind: 'say', text: 'hello there' });
  assert.deepEqual(parseChat('   ', KNOWN), { kind: 'empty' });
  assert.deepEqual(parseChat('', KNOWN), { kind: 'empty' });
  assert.deepEqual(parseChat('half/way', KNOWN), { kind: 'say', text: 'half/way' });
});

void test('/dm, /w and /whisper name a player and carry a message, in any case', (): void => {
  for (const word of ['dm', 'w', 'whisper', 'DM', 'Whisper']) {
    assert.deepEqual(parseChat(`/${word} Ash well met`, KNOWN), { kind: 'whisper', name: 'Ash', text: 'well met' }, word);
  }
});

void test('a whisper with only a name switches to that player without sending', (): void => {
  assert.deepEqual(parseChat('/dm Ash', KNOWN), { kind: 'whisper', name: 'Ash', text: null });
  assert.deepEqual(parseChat('/w   ash   ', KNOWN), { kind: 'whisper', name: 'Ash', text: null });
});

void test('a known name with spaces is found by the longest match, ignoring case and spacing', (): void => {
  assert.deepEqual(parseChat('/dm bo reed are you there', KNOWN), { kind: 'whisper', name: 'Bo Reed', text: 'are you there' });
  assert.deepEqual(parseChat('/dm Grim Hollow Vale hi', KNOWN), { kind: 'whisper', name: 'Grim Hollow Vale', text: 'hi' });
  assert.deepEqual(parseChat('/dm BO    REED', KNOWN), { kind: 'whisper', name: 'Bo Reed', text: null });
});

void test('a name in quotes is taken whole, known or not', (): void => {
  assert.deepEqual(parseChat('/dm "Cold Fen" hello there', KNOWN), { kind: 'whisper', name: 'Cold Fen', text: 'hello there' });
  assert.deepEqual(parseChat('/dm "Cold   Fen"', KNOWN), { kind: 'whisper', name: 'Cold Fen', text: null });
  assert.deepEqual(parseChat('/dm "Cold Fen', KNOWN), { kind: 'whisper', name: 'Cold Fen', text: null });
});

void test('an unknown name without quotes is its first word, so the server can say no one has it', (): void => {
  assert.deepEqual(parseChat('/dm Cold Fen hello', KNOWN), { kind: 'whisper', name: 'Cold', text: 'Fen hello' });
});

void test('/dm with no name, or an empty quoted name, asks for one', (): void => {
  assert.deepEqual(parseChat('/dm', KNOWN), { kind: 'no_name', command: '/dm' });
  assert.deepEqual(parseChat('/w   ', KNOWN), { kind: 'no_name', command: '/w' });
  assert.deepEqual(parseChat('/whisper "" hi', KNOWN), { kind: 'no_name', command: '/whisper' });
});

void test('/r and /reply answer the last whisper, with or without a message', (): void => {
  assert.deepEqual(parseChat('/r on my way', KNOWN), { kind: 'reply', text: 'on my way' });
  assert.deepEqual(parseChat('/reply', KNOWN), { kind: 'reply', text: null });
});

void test('/g and /general go back to General, with or without a message', (): void => {
  assert.deepEqual(parseChat('/g', KNOWN), { kind: 'general', text: null });
  assert.deepEqual(parseChat('/general hello all', KNOWN), { kind: 'general', text: 'hello all' });
});

void test('/help and /? show the commands', (): void => {
  assert.deepEqual(parseChat('/help', KNOWN), { kind: 'help' });
  assert.deepEqual(parseChat('/?', KNOWN), { kind: 'help' });
});

void test('an unknown slash command is named back and nothing is sent', (): void => {
  assert.deepEqual(parseChat('/dance now', KNOWN), { kind: 'unknown', command: '/dance' });
  assert.deepEqual(parseChat('/', KNOWN), { kind: 'unknown', command: '/' });
  assert.deepEqual(parseChat('/DMx Ash hi', KNOWN), { kind: 'unknown', command: '/dmx' });
});

void test('a name key ignores case and spacing like the server', (): void => {
  assert.equal(nameKey('Bo  Reed'), nameKey('boreed'));
});
