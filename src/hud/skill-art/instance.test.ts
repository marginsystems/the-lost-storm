import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artInstance } from './instance.ts';
import type { ArtCounter } from './instance.ts';

const ART: string = '<svg viewBox="0 0 64 64"><defs><linearGradient id="energy"/><filter id="glow"/></defs><rect fill="url(#energy)" filter="url(#glow)"/></svg>';

function ids(svg: string): string[] {
  return [...svg.matchAll(/\bid="([^"]+)"/g)].map((match: RegExpMatchArray): string => match[1] ?? '');
}

void test('two copies of one icon on the page never share an id, and each copy points at its own gradients', (): void => {
  const counter: ArtCounter = { next: 0 };
  const first: string = artInstance(ART, counter);
  const second: string = artInstance(ART, counter);
  assert.equal(ids(first).filter((id: string): boolean => ids(second).includes(id)).length, 0);
  for (const copy of [first, second]) {
    const own: string[] = ids(copy);
    for (const match of copy.matchAll(/url\(#([^)]+)\)/g)) assert.ok(own.includes(match[1] ?? ''), copy);
  }
});

void test('an icon copy carries the class the HUD sizes it by', (): void => {
  assert.ok(artInstance(ART, { next: 0 }).startsWith('<svg class="skill-art" '));
});
