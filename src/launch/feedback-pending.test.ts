import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, EMPTY_PENDING, stepPending } from './feedback-pending.ts';
import type { Pending, PendingEvent, PendingPost } from './feedback-pending.ts';

function run(events: readonly PendingEvent[]): { readonly pending: Pending; readonly posts: readonly PendingPost[] } {
  let pending: Pending = EMPTY_PENDING;
  const posts: PendingPost[] = [];
  for (const event of events) {
    const step = stepPending(pending, event);
    pending = step.pending;
    if (step.post !== null) posts.push(step.post);
  }
  return { pending, posts };
}

void test('a thumb tap alone posts nothing yet and arms the send', (): void => {
  const { pending, posts } = run([{ kind: 'rate', rating: 'up' }]);
  assert.deepEqual(posts, []);
  assert.equal(armed(pending), true);
  assert.equal(armed(EMPTY_PENDING), false);
});

void test('tap then close posts the rating once with no text', (): void => {
  assert.deepEqual(run([{ kind: 'rate', rating: 'up' }, { kind: 'close' }]).posts, [{ rating: 'up', text: '' }]);
});

void test('tap, type and Send posts once with the text', (): void => {
  const { posts } = run([{ kind: 'rate', rating: 'down' }, { kind: 'type', text: 'too dark' }, { kind: 'submit' }, { kind: 'close' }]);
  assert.deepEqual(posts, [{ rating: 'down', text: 'too dark' }]);
});

void test('tap then idle posts once, and a later close does not post again', (): void => {
  const { posts } = run([{ kind: 'rate', rating: 'up' }, { kind: 'idle' }, { kind: 'close' }, { kind: 'idle' }]);
  assert.deepEqual(posts, [{ rating: 'up', text: '' }]);
});

void test('tap then page hide posts once, and a later page hide does not post again', (): void => {
  const { posts } = run([{ kind: 'rate', rating: 'up' }, { kind: 'hide' }, { kind: 'hide' }, { kind: 'close' }]);
  assert.deepEqual(posts, [{ rating: 'up', text: '' }]);
});

void test('tapping the other thumb before the send changes the pending rating and still posts one body', (): void => {
  const { posts } = run([{ kind: 'rate', rating: 'up' }, { kind: 'rate', rating: 'down' }, { kind: 'type', text: 'hmm' }, { kind: 'rate', rating: 'up' }, { kind: 'close' }]);
  assert.deepEqual(posts, [{ rating: 'up', text: 'hmm' }]);
});

void test('typing keeps the latest text, not the first', (): void => {
  const { posts } = run([{ kind: 'rate', rating: 'up' }, { kind: 'type', text: 'a' }, { kind: 'type', text: 'ab' }, { kind: 'idle' }]);
  assert.deepEqual(posts, [{ rating: 'up', text: 'ab' }]);
});

void test('nothing posts without a rating, whatever else happens', (): void => {
  const { pending, posts } = run([{ kind: 'type', text: 'x' }, { kind: 'submit' }, { kind: 'close' }, { kind: 'idle' }, { kind: 'hide' }]);
  assert.deepEqual(posts, []);
  assert.deepEqual(pending, EMPTY_PENDING);
});

void test('after the post the rating and text can no longer change or post', (): void => {
  const { pending, posts } = run([{ kind: 'rate', rating: 'up' }, { kind: 'submit' }, { kind: 'rate', rating: 'down' }, { kind: 'type', text: 'late' }, { kind: 'submit' }]);
  assert.deepEqual(posts, [{ rating: 'up', text: '' }]);
  assert.equal(pending.rating, 'up');
  assert.equal(pending.text, '');
  assert.equal(armed(pending), false);
});
