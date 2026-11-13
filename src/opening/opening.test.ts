import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const LOBBY_MARK: string = '[data-lobby]';
const css: string = readFileSync(new URL('./opening.css', import.meta.url), 'utf8');

function selectorsWith(property: string): string[] {
  return css
    .split('}')
    .filter((block: string): boolean => block.includes(`${property}:`))
    .map((block: string): string => (block.split('{')[0] ?? '').trim());
}

void test('the wake-up blurs the game canvas only while the lobby is not showing, so a hero who has not woken stands sharp in the lobby', (): void => {
  const blurred: string[] = selectorsWith('filter').filter((selector: string): boolean => selector.includes('#scene'));
  assert.equal(blurred.length, 1);
  const [selector] = blurred;
  assert.ok(selector !== undefined && selector.includes("[data-wake-blur='on']"));
  assert.ok(selector.includes(`:not(${LOBBY_MARK})`), selector);
  assert.ok(readFileSync(new URL('../lobby/lobby-screen.css', import.meta.url), 'utf8').includes(`body${LOBBY_MARK} `));
});
