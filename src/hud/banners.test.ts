import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BannerRequest } from './banners.ts';
import { admits, bannerHoldMs, zoneBannersAfter } from './banners.ts';

void test('a banner with others waiting behind it holds for a shorter time, and an act banner always holds long', (): void => {
  assert.ok(bannerHoldMs('quest', 2) < bannerHoldMs('quest', 0));
  assert.equal(bannerHoldMs('act', 3), bannerHoldMs('act', 0));
  assert.ok(bannerHoldMs('act', 0) > bannerHoldMs('zone', 0));
});

void test('a fallen boss banner holds as long as an act banner, even with others waiting', (): void => {
  assert.equal(bannerHoldMs('boss', 2), bannerHoldMs('act', 0));
});

void test('a banner equal to the one showing or to one already waiting is dropped, a different one is kept', (): void => {
  const zone: BannerRequest = { title: 'The Hall of Time', subtitle: null, tone: 'zone' };
  const skill: BannerRequest = { title: 'Dodge Roll', subtitle: 'New skill', tone: 'quest' };
  assert.equal(admits(zone, [], zone), false);
  assert.equal(admits(null, [skill], skill), false);
  assert.equal(admits(zone, [], skill), true);
  assert.equal(admits(null, [], zone), true);
});

void test('only zone banners count toward quieting the exit labels', (): void => {
  assert.equal(zoneBannersAfter(0, 'zone', 1), 1);
  assert.equal(zoneBannersAfter(0, 'quest', 1), 0);
  assert.equal(zoneBannersAfter(1, 'level', -1), 1);
});

void test('two zone banners that overlap while the first fades keep the exit labels quiet until both are gone', (): void => {
  const first: number = zoneBannersAfter(0, 'zone', 1);
  const both: number = zoneBannersAfter(first, 'zone', 1);
  const firstGone: number = zoneBannersAfter(both, 'zone', -1);
  assert.ok(firstGone > 0);
  assert.equal(zoneBannersAfter(firstGone, 'zone', -1), 0);
  assert.equal(zoneBannersAfter(0, 'zone', -1), 0);
});
