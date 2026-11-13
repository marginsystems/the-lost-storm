import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VEIL } from './veil.ts';

const css: string = readFileSync(new URL('./veil.css', import.meta.url), 'utf8');

void test('the loading mark sits in the middle of whichever veil holds it, never in a corner', (): void => {
  const rules: string[] = css.split('}').filter((block: string): boolean => (block.split('{')[0] ?? '').includes(`.${VEIL.markClass}`));
  assert.equal(rules.length, 1);
  const [head, body] = (rules[0] ?? '').split('{');
  assert.equal((head ?? '').trim(), `.${VEIL.markClass}`);
  for (const wanted of ['position: absolute', 'left: 50%', 'top: 50%', 'translate: -50% -50%']) assert.ok((body ?? '').includes(wanted), wanted);
});
