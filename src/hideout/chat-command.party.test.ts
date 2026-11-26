import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChat } from './chat-command.ts';

const KNOWN: readonly string[] = ['Bo Reed', 'Ash'];

void test('/p and /party speak to the party, or switch to it with no text', (): void => {
  assert.deepEqual(parseChat('/p this way', KNOWN), { kind: 'party', text: 'this way' });
  assert.deepEqual(parseChat('/party', KNOWN), { kind: 'party', text: null });
});

void test('/invite, /kick and /lead name one player, with known names that have spaces', (): void => {
  assert.deepEqual(parseChat('/invite bo reed', KNOWN), { kind: 'invite', name: 'Bo Reed' });
  assert.deepEqual(parseChat('/inv "Cold Fen"', KNOWN), { kind: 'invite', name: 'Cold Fen' });
  assert.deepEqual(parseChat('/kick Ash', KNOWN), { kind: 'kick', name: 'Ash' });
  assert.deepEqual(parseChat('/promote ash', KNOWN), { kind: 'lead', name: 'Ash' });
  assert.deepEqual(parseChat('/invite', KNOWN), { kind: 'no_name', command: '/invite' });
  assert.deepEqual(parseChat('/leave', KNOWN), { kind: 'leave' });
});
