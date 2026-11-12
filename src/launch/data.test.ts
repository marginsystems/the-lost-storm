import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ALPHA_RULES, LINKS } from './data.ts';

void test('the shipped links have the site, the game and the repository', (): void => {
  assert.equal(LINKS.site, 'https://theloststorm.com');
  assert.equal(LINKS.play, 'https://theloststorm.com/play/');
  assert.match(LINKS.github, /^https:\/\/github\.com\//);
  assert.equal(LINKS.discord, 'https://discord.gg/XTRePF4HJs');
});

void test('every page names only links the data knows', (): void => {
  for (const page of ['index.html', 'play/index.html']) {
    const html: string = readFileSync(page, 'utf8');
    for (const match of html.matchAll(/data-link="([a-z]+)"/g)) assert.ok(['discord', 'github', 'x'].includes(match[1] ?? ''), `${page} names ${match[1] ?? ''}`);
  }
});

void test('the slice ends on the alpha flag', (): void => {
  assert.deepEqual(ALPHA_RULES.complete, { kind: 'flag', flag: 'alpha_slice_complete' });
  assert.ok(ALPHA_RULES.milestones.some((milestone) => milestone.event === 'reached_waystation'));
});

void test('every milestone zone is a zone in the world', (): void => {
  const zones: ReadonlySet<string> = new Set<string>(readdirSync('data/zones').map((file: string): string => file.replace(/\.json$/, '')));
  for (const milestone of ALPHA_RULES.milestones) if (milestone.kind === 'zone') assert.ok(zones.has(milestone.zone), `no zone ${milestone.zone}`);
});
