import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import type { Bubble, SpeechState, SpokenLine } from './speech.ts';
import { expire, heard, NO_SPEECH, readingMs, say, shownBubbles, SPEECH, speakerKey, spokenOf, voiceEnded, voiceFailed, voiceStarted } from './speech.ts';

const KEY: string = 'a'.repeat(64);
const MINE: ChatLine = { id: 1, from: 'p1', name: 'Ash', text: 'hello there', at: null, own: true };
const THEIRS: ChatLine = { id: 2, from: 'p2', name: 'Bo', text: 'well met', at: null, own: false };
const WAYFARER: ChatLine = { id: 3, from: 'w1', name: 'Wayfarer', text: 'The road is long.', at: null, own: false, resident: true, voice: KEY };

function said(line: ChatLine): LiveEvent {
  return { type: 'said', line };
}

function spoken(state: SpeechState, event: LiveEvent): SpokenLine {
  const line: SpokenLine | null = spokenOf(state, event);
  assert.ok(line !== null);
  return line;
}

function only(state: SpeechState): Bubble {
  const [bubble] = state.bubbles;
  assert.ok(bubble !== undefined && state.bubbles.length === 1);
  return bubble;
}

void test('the player’s own line speaks from their hero, another’s from their figure, the resident’s from him', (): void => {
  assert.deepEqual(spoken(NO_SPEECH, said(MINE)), { speaker: { kind: 'self' }, line: 1, text: 'hello there', voiced: false });
  assert.deepEqual(spoken(NO_SPEECH, said(THEIRS)).speaker, { kind: 'other', id: 'p2' });
  assert.deepEqual(spoken(NO_SPEECH, said(WAYFARER)), { speaker: { kind: 'resident', id: 'w1', name: 'Wayfarer' }, line: 3, text: 'The road is long.', voiced: true });
});

void test('a line with no own flag is the player’s when it comes from their id', (): void => {
  const known: SpeechState = heard(heard(NO_SPEECH, { type: 'welcome', you: 'p1', chat: [] }), { type: 'present', you: 'h9', players: [], chat: null });
  assert.deepEqual(spoken(known, said({ ...MINE, own: null })).speaker, { kind: 'self' });
  assert.deepEqual(spoken(known, said({ ...MINE, own: null, from: 'h9' })).speaker, { kind: 'self' });
  assert.deepEqual(spoken(known, said({ ...THEIRS, own: null })).speaker, { kind: 'other', id: 'p2' });
});

void test('whispers between players get no bubble, nor blank lines or lines from no one', (): void => {
  assert.equal(spokenOf(NO_SPEECH, { type: 'whisper', dir: 'from', with: 'Bo', line: THEIRS }), null);
  assert.equal(spokenOf(NO_SPEECH, { type: 'whisper', dir: 'to', with: 'Bo', line: MINE }), null);
  assert.equal(spokenOf(NO_SPEECH, said({ ...THEIRS, text: '   ' })), null);
  assert.equal(spokenOf(NO_SPEECH, said({ ...THEIRS, from: null })), null);
  assert.equal(spokenOf(NO_SPEECH, { type: 'welcome', you: 'p1', chat: [THEIRS] }), null);
});

void test('the resident’s voiced answer to the player shows over him', (): void => {
  assert.deepEqual(spokenOf(NO_SPEECH, { type: 'whisper', dir: 'from', with: 'Wayfarer', line: WAYFARER })?.speaker, { kind: 'resident', id: 'w1', name: 'Wayfarer' });
  const { voice: _voice, ...unvoiced } = WAYFARER;
  assert.equal(_voice, KEY);
  assert.equal(spokenOf(NO_SPEECH, { type: 'whisper', dir: 'from', with: 'Wayfarer', line: unvoiced }), null);
});

void test('reading time grows with the text and stays within bounds', (): void => {
  assert.equal(readingMs('hi'), SPEECH.readMinMs);
  assert.equal(readingMs('x'.repeat(800)), SPEECH.readMaxMs);
  const middle: number = readingMs('x'.repeat(60));
  assert.equal(middle, SPEECH.readBaseMs + 60 * SPEECH.readPerCharMs);
  assert.ok(middle > SPEECH.readMinMs && middle < SPEECH.readMaxMs);
});

void test('a plain line shows at once and leaves after its reading time', (): void => {
  const shown: SpeechState = say(NO_SPEECH, spoken(NO_SPEECH, said(THEIRS)), 1000);
  assert.equal(shownBubbles(shown).length, 1);
  const until: number = 1000 + readingMs(THEIRS.text);
  assert.equal(expire(shown, until - 1), shown);
  assert.deepEqual(expire(shown, until).bubbles, []);
});

void test('a new line from the same speaker replaces the old bubble, others keep theirs', (): void => {
  const first: SpeechState = say(NO_SPEECH, spoken(NO_SPEECH, said(THEIRS)), 0);
  const both: SpeechState = say(first, spoken(first, said(MINE)), 10);
  const replaced: SpeechState = say(both, spoken(both, said({ ...THEIRS, id: 9, text: 'again' })), 20);
  assert.deepEqual(
    replaced.bubbles.map((bubble: Bubble): string => `${bubble.key}=${bubble.text}`),
    ['self=hello there', 'other:p2=again'],
  );
});

void test('a voiced line waits for the voice, shows while it is spoken and leaves just after it ends', (): void => {
  const waiting: SpeechState = say(NO_SPEECH, spoken(NO_SPEECH, said(WAYFARER)), 0);
  assert.deepEqual(shownBubbles(waiting), []);
  const speaking: SpeechState = voiceStarted(waiting, WAYFARER.id, 800);
  assert.equal(shownBubbles(speaking).length, 1);
  assert.equal(expire(speaking, 60000), speaking);
  const ended: SpeechState = voiceEnded(speaking, WAYFARER.id, 4800);
  assert.deepEqual(only(ended).phase, { kind: 'reading', until: 4800 + SPEECH.lingerMs });
  assert.deepEqual(expire(ended, 4800 + SPEECH.lingerMs).bubbles, []);
});

void test('a voice that fails, is never heard or never comes falls back to the reading time', (): void => {
  const waiting: SpeechState = say(NO_SPEECH, spoken(NO_SPEECH, said(WAYFARER)), 0);
  const reading: number = readingMs(WAYFARER.text);
  assert.deepEqual(only(voiceFailed(waiting, WAYFARER.id, 500)).phase, { kind: 'reading', until: 500 + reading });
  const silent: SpeechState = voiceEnded(voiceStarted(waiting, WAYFARER.id, 500), WAYFARER.id, 500 + SPEECH.heardMinMs - 1);
  assert.deepEqual(only(silent).phase, { kind: 'reading', until: 500 + reading });
  assert.deepEqual(only(voiceEnded(waiting, WAYFARER.id, 700)).phase, { kind: 'reading', until: 700 + reading });
  const late: SpeechState = expire(waiting, SPEECH.voiceWaitMs);
  assert.deepEqual(only(late).phase, { kind: 'reading', until: SPEECH.voiceWaitMs + reading });
  assert.equal(shownBubbles(late).length, 1);
});

void test('voice news about a replaced line changes nothing', (): void => {
  const waiting: SpeechState = say(NO_SPEECH, spoken(NO_SPEECH, said(WAYFARER)), 0);
  const replaced: SpeechState = say(waiting, spoken(waiting, said({ ...WAYFARER, id: 4, text: 'Rest here.' })), 100);
  assert.equal(voiceStarted(replaced, WAYFARER.id, 200), replaced);
  assert.equal(voiceFailed(replaced, WAYFARER.id, 200), replaced);
});

void test('leaving the shared space drops everyone’s bubbles but the player’s own', (): void => {
  const first: SpeechState = say(NO_SPEECH, spoken(NO_SPEECH, said(THEIRS)), 0);
  const both: SpeechState = say(first, spoken(first, said(MINE)), 0);
  assert.deepEqual(
    heard(both, { type: 'away' }).bubbles.map((bubble: Bubble): string => bubble.key),
    ['self'],
  );
  assert.equal(speakerKey({ kind: 'resident', id: null, name: 'Wayfarer' }), 'resident:wayfarer');
  assert.equal(speakerKey({ kind: 'resident', id: 'w1', name: 'Wayfarer' }), 'other:w1');
});
