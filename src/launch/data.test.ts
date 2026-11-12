import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ALPHA_RULES, LINKS } from './data.ts';

void test('the shipped links have the site, the game and the repository', (): void => {
  assert.equal(LINKS.site, 'https://theloststorm.com');
  assert.equal(LINKS.play, 'https://theloststorm.com/play/');
  assert.match(LINKS.github, /^https:\/\/github\.com\//);
});

void test('every page names only links the data knows', (): void => {
  for (const page of ['index.html', 'play/index.html']) {
    const html: string = readFileSync(page, 'utf8');
    for (const match of html.matchAll(/data-link="([a-z]+)"/g)) assert.ok(['discord', 'github', 'x'].includes(match[1] ?? ''), `${page} names ${match[1] ?? ''}`);
  }
});

void test('the slice ends with an act the world defines', (): void => {
  const world: unknown = JSON.parse(readFileSync('data/world.json', 'utf8'));
  assert.ok(JSON.stringify(world).includes(`"id":"${ALPHA_RULES.completeAct}"`));
  assert.ok(ALPHA_RULES.milestones.some((milestone) => milestone.event === 'reached_waystation'));
});
