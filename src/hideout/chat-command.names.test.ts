import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChat } from './chat-command.ts';

const KNOWN: readonly string[] = ['Bo Reed', 'Ash'];

void test('/invite, /kick and /lead take the whole line as the name, so a two-word name nobody has said in chat still reaches its player', (): void => {
  assert.deepEqual(parseChat('/invite Alder Dogfood', KNOWN), { kind: 'invite', name: 'Alder Dogfood' });
  assert.deepEqual(parseChat('/inv   rowan   fairfield ', KNOWN), { kind: 'invite', name: 'rowan fairfield' });
  assert.deepEqual(parseChat('/kick Ash Walker', KNOWN), { kind: 'kick', name: 'Ash Walker' });
  assert.deepEqual(parseChat('/lead Cold Fen Marsh', KNOWN), { kind: 'lead', name: 'Cold Fen Marsh' });
});

void test('a party command still spells a known name the way its player does, and still takes a quoted name', (): void => {
  assert.deepEqual(parseChat('/invite bo reed', KNOWN), { kind: 'invite', name: 'Bo Reed' });
  assert.deepEqual(parseChat('/kick "Cold Fen"', KNOWN), { kind: 'kick', name: 'Cold Fen' });
  assert.deepEqual(parseChat('/lead ""', KNOWN), { kind: 'no_name', command: '/lead' });
});

void test('a whisper still splits its name from its words', (): void => {
  assert.deepEqual(parseChat('/dm Ash hello there', KNOWN), { kind: 'whisper', name: 'Ash', text: 'hello there' });
  assert.deepEqual(parseChat('/dm bo reed hi', KNOWN), { kind: 'whisper', name: 'Bo Reed', text: 'hi' });
});
