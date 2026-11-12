import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ECHO, echoBeat, echoRepeats, echoTail } from './echo.ts';
import type { EchoRepeat } from './echo.ts';

void test('the repeats fall on a steady grid of one beat at 150 bpm', (): void => {
  assert.equal(echoBeat(), 0.4);
  const repeats: readonly EchoRepeat[] = echoRepeats();
  assert.equal(repeats.length, ECHO.repeats);
  repeats.forEach((repeat: EchoRepeat, index: number): void => {
    assert.ok(Math.abs(repeat.delay - 0.4 * (index + 1)) < 1e-9, `repeat ${index} lands at ${repeat.delay}`);
  });
});

void test('the dry voice comes first and each repeat is quieter and darker than the last', (): void => {
  const repeats: readonly EchoRepeat[] = echoRepeats();
  const first: EchoRepeat | undefined = repeats[0];
  assert.ok(first !== undefined && first.delay > 0 && first.gain < ECHO.dry);
  for (let index: number = 1; index < repeats.length; index += 1) {
    const before: EchoRepeat | undefined = repeats[index - 1];
    const after: EchoRepeat | undefined = repeats[index];
    assert.ok(before !== undefined && after !== undefined);
    assert.ok(Math.abs(after.gain / before.gain - ECHO.feedback) < 1e-9);
    assert.ok(after.cutoff < before.cutoff);
  }
});

void test('the echo rings out a little after its last repeat and no longer', (): void => {
  const last: EchoRepeat | undefined = echoRepeats().at(-1);
  assert.ok(last !== undefined && echoTail() > last.delay && echoTail() < last.delay + 1.5);
});
