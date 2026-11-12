import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterCount, afterFeedback, ALPHA, cleanBuild, cleanText, codePoints, EMPTY_STATE, feedbackBody, markEndShown, noteEvent, outcomeOf, queueFeedback, reachedEvents, readAlphaRules, readLaunchState, retryDelay, serializeLaunchState, shouldShowEnd, takeEnd } from './alpha.ts';
import type { AlphaRules, FeedbackBody, FeedbackContext, LaunchState } from './alpha.ts';

const RULES: AlphaRules = readAlphaRules({
  complete: { flag: 'alpha_slice_complete' },
  milestones: [
    { event: 'picked_journal', flag: 'first_choice', is: 'took_journal' },
    { event: 'reached_shallows', zone: 'shallows' },
  ],
});

const CONTEXT: FeedbackContext = { zone: 'shallows', level: 3, minutes: 12, device: 'phone', build: 'abc1234' };

void test('the rules file is read strictly', (): void => {
  assert.deepEqual(readAlphaRules({ complete: { act: 'act_1' }, milestones: [] }).complete, { kind: 'act', act: 'act_1' });
  assert.deepEqual(readAlphaRules({ complete: { flag: 'done' }, milestones: [] }).complete, { kind: 'flag', flag: 'done' });
  assert.deepEqual(RULES.milestones[0], { kind: 'flag', event: 'picked_journal', flag: 'first_choice', is: 'took_journal' });
  assert.deepEqual(RULES.milestones[1], { kind: 'zone', event: 'reached_shallows', zone: 'shallows' });
  assert.throws((): AlphaRules => readAlphaRules({ complete: { flag: '' }, milestones: [] }));
  assert.throws((): AlphaRules => readAlphaRules({ complete: { flag: 'x' }, milestones: [{ event: 'won', zone: 'a' }] }));
  assert.throws((): AlphaRules => readAlphaRules(null));
});

void test('milestones are reached from the zone, the flags and the hero being down', (): void => {
  assert.deepEqual(reachedEvents(RULES, { zone: 'between', flags: {}, alive: true }), []);
  assert.deepEqual(reachedEvents(RULES, { zone: 'between', flags: { first_choice: 'left_journal' }, alive: true }), []);
  assert.deepEqual(reachedEvents(RULES, { zone: 'shallows', flags: { first_choice: 'took_journal' }, alive: false }), ['picked_journal', 'reached_shallows', 'died']);
});

void test('the end card is due once, after the slice flag is set', (): void => {
  const none: ReadonlySet<string> = new Set<string>();
  assert.equal(shouldShowEnd(EMPTY_STATE, RULES, { flags: {}, ended: none }), false);
  assert.equal(shouldShowEnd(EMPTY_STATE, RULES, { flags: { alpha_slice_complete: '' }, ended: none }), false);
  assert.equal(shouldShowEnd(EMPTY_STATE, RULES, { flags: { alpha_slice_complete: 'yes' }, ended: none }), true);
  assert.equal(shouldShowEnd(markEndShown(EMPTY_STATE), RULES, { flags: { alpha_slice_complete: 'yes' }, ended: none }), false);
  const byAct: AlphaRules = { ...RULES, complete: { kind: 'act', act: 'act_1' } };
  assert.equal(shouldShowEnd(EMPTY_STATE, byAct, { flags: {}, ended: new Set<string>(['act_1']) }), true);
  assert.equal(shouldShowEnd(EMPTY_STATE, byAct, { flags: { alpha_slice_complete: 'yes' }, ended: none }), false);
});

void test('text becomes one clean line of at most 600 characters', (): void => {
  assert.equal(cleanText('  too\n\n dark \tat night  '), 'too dark at night');
  assert.equal(cleanText('bell\u0007s'), 'bells');
  assert.equal(codePoints(cleanText('🌩'.repeat(ALPHA.textChars + 50))), ALPHA.textChars);
});

void test('a feedback body always passes the server checks', (): void => {
  const body: FeedbackBody = feedbackBody('up', ' good ', { zone: '../x', level: 0, minutes: -4.5, device: 'desktop', build: 'not ok' });
  assert.deepEqual(body, { rating: 'up', text: 'good', context: { zone: 'unknown', level: 1, minutes: 0, device: 'desktop', build: 'dev' } });
  assert.equal(feedbackBody('down', '', { ...CONTEXT, level: 5000, minutes: Number.NaN }).context.level, ALPHA.maxLevel);
  assert.equal(cleanBuild(undefined), 'dev');
  assert.equal(cleanBuild('fe67554'), 'fe67554');
});

void test('each event is counted once per browser', (): void => {
  const noted: LaunchState = noteEvent(noteEvent(EMPTY_STATE, 'opened_game'), 'opened_game');
  assert.deepEqual(noted.pending, ['opened_game']);
  assert.equal(afterCount(noted, 'opened_game', 'retry'), noted);
  const sent: LaunchState = afterCount(noted, 'opened_game', 'sent');
  assert.deepEqual(sent.pending, []);
  assert.deepEqual(sent.counted, ['opened_game']);
  assert.equal(noteEvent(sent, 'opened_game'), sent);
  assert.deepEqual(afterCount(noteEvent(EMPTY_STATE, 'died'), 'died', 'rejected').counted, ['died']);
});

void test('the outbox keeps the newest few and drops what was delivered or refused', (): void => {
  let state: LaunchState = EMPTY_STATE;
  const bodies: FeedbackBody[] = [];
  for (let index = 0; index < ALPHA.outboxSize + 2; index += 1) {
    const body: FeedbackBody = feedbackBody('up', `note ${index}`, CONTEXT);
    bodies.push(body);
    state = queueFeedback(state, body);
  }
  assert.equal(state.outbox.length, ALPHA.outboxSize);
  assert.equal(state.outbox[0], bodies[2]);
  const first: FeedbackBody | undefined = state.outbox[0];
  assert.ok(first !== undefined);
  assert.equal(afterFeedback(state, first, 'retry'), state);
  assert.equal(afterFeedback(state, first, 'sent').outbox.length, ALPHA.outboxSize - 1);
});

void test('answers are sorted into sent, refused and try again', (): void => {
  assert.equal(outcomeOf(200), 'sent');
  assert.equal(outcomeOf(201), 'sent');
  assert.equal(outcomeOf(400), 'rejected');
  assert.equal(outcomeOf(413), 'rejected');
  assert.equal(outcomeOf(429), 'retry');
  assert.equal(outcomeOf(503), 'retry');
  assert.equal(outcomeOf(404), 'retry');
});

void test('retries back off and stop growing', (): void => {
  assert.equal(retryDelay(1), ALPHA.firstRetryMs);
  assert.equal(retryDelay(2), ALPHA.firstRetryMs * 2);
  assert.equal(retryDelay(40), ALPHA.maxRetryMs);
});

void test('the stored state survives a round trip and anything malformed is dropped', (): void => {
  const state: LaunchState = { endShown: true, counted: ['opened_game'], pending: ['died'], outbox: [feedbackBody('down', 'hard', CONTEXT)] };
  assert.deepEqual(readLaunchState(serializeLaunchState(state)), state);
  assert.deepEqual(readLaunchState(null), EMPTY_STATE);
  assert.deepEqual(readLaunchState('{'), EMPTY_STATE);
  assert.deepEqual(readLaunchState('[]'), EMPTY_STATE);
  const messy: LaunchState = readLaunchState(JSON.stringify({ endShown: 'yes', counted: ['died', 'won', 'died'], pending: ['died', 'opened_game'], outbox: [{ rating: 'meh' }, { rating: 'up', text: 'ok', context: CONTEXT }] }));
  assert.deepEqual(messy, { endShown: false, counted: ['died'], pending: ['opened_game'], outbox: [{ rating: 'up', text: 'ok', context: CONTEXT }] });
});

void test('the end is taken once, from the stored state alone', (): void => {
  const reached = { flags: { alpha_slice_complete: 'yes' }, ended: new Set<string>() };
  assert.equal(takeEnd(EMPTY_STATE, RULES, { flags: {}, ended: new Set<string>() }), null);
  const taken: LaunchState | null = takeEnd(EMPTY_STATE, RULES, reached);
  assert.ok(taken !== null);
  assert.equal(taken.endShown, true);
  assert.equal(takeEnd(readLaunchState(serializeLaunchState(taken)), RULES, reached), null);
});
