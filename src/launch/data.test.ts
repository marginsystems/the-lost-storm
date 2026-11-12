import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
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
  assert.deepEqual(
    ALPHA_RULES.milestones.map((milestone) => milestone.event),
    ['picked_journal', 'left_mist', 'reached_hall', 'cleared_moment', 'reached_fire'],
  );
});

void test('every milestone zone is a zone the world loads', (): void => {
  const zones: Content['zones'] = loadContent().zones;
  for (const milestone of ALPHA_RULES.milestones) if (milestone.kind === 'zone') assert.ok(zones.has(milestone.zone), `no zone ${milestone.zone}`);
});

void test('every page quiets a view transition the browser abandons before any stylesheet loads', (): void => {
  const guards: string[] = [];
  for (const page of ['index.html', 'play/index.html']) {
    const html: string = readFileSync(page, 'utf8');
    const guard: RegExpMatchArray | null = html.match(/<script>(?:(?!<\/script>)[\s\S])*pagereveal(?:(?!<\/script>)[\s\S])*<\/script>/);
    assert.ok(guard !== null, `${page} has no view transition guard`);
    const at: number = guard.index ?? -1;
    assert.ok(at >= 0 && at < html.indexOf('rel="stylesheet"'), `${page} guards after a stylesheet`);
    for (const name of ['pageswap', 'pagereveal', "'ready'", "'finished'", "'updateCallbackDone'", 'skipTransition', "visibilityState === 'hidden'"]) assert.ok(guard[0].includes(name), `${page} guard misses ${name}`);
    guards.push(guard[0]);
  }
  assert.equal(guards[0], guards[1]);
});
