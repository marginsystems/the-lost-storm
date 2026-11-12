import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { holdFor, sameBanner } from './banners.ts';

function ruleBody(selector: string): string {
  const sheet: string = readFileSync(new URL('./hud.css', import.meta.url), 'utf8');
  const rules: RegExpMatchArray[] = [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const found: RegExpMatchArray | undefined = rules.find((rule: RegExpMatchArray): boolean => (rule[1] ?? '').trim() === selector);
  return found?.[2] ?? '';
}

void test('a banner holds for less time while others wait behind it', (): void => {
  assert.ok(holdFor('quest', 2) < holdFor('quest', 0));
  assert.ok(holdFor('zone', 1) < holdFor('zone', 0));
});

void test('an act banner keeps its long hold even with others waiting', (): void => {
  assert.equal(holdFor('act', 3), holdFor('act', 0));
  assert.ok(holdFor('act', 0) > holdFor('quest', 0));
});

void test('banners with the same title, subtitle and tone count as one', (): void => {
  assert.ok(sameBanner({ title: 'The Shallows', subtitle: null, tone: 'zone' }, { title: 'The Shallows', subtitle: null, tone: 'zone' }));
  assert.ok(!sameBanner({ title: 'Out of the Mist', subtitle: 'New quest', tone: 'quest' }, { title: 'Out of the Mist', subtitle: 'Quest complete', tone: 'quest' }));
});

void test('banners share one spot so a leaving banner and the next one overlap instead of stacking', (): void => {
  assert.match(ruleBody('.hud-banners'), /display:\s*grid;/);
  assert.match(ruleBody('.banner'), /grid-area:\s*1 \/ 1;/);
});
