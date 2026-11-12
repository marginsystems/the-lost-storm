import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

void test('pointer presses become world input only on the canvas, so a click on the HUD never moves the hero', (): void => {
  const source: string = readFileSync('src/input.ts', 'utf8');
  const listeners: string[] = [...source.matchAll(/(\w+)\.addEventListener\(\s*'(pointer\w+|mouse\w+|click|touch\w+)'/g)].map((match: RegExpExecArray): string => `${match[1] ?? ''}.${match[2] ?? ''}`);
  assert.ok(listeners.includes('canvas.pointerdown'));
  for (const listener of listeners) assert.ok(listener.startsWith('canvas.'), `${listener} listens outside the canvas`);
});
