import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHART_OVERVIEW, linkMark, overviewWanted, placeMark } from './chart-overview.ts';
import type { PlaceMark } from './chart-overview.ts';

void test('the overview takes over only when zoomed past the enter scale, and gives back only past the leave scale', (): void => {
  const between: number = (CHART_OVERVIEW.enterScale + CHART_OVERVIEW.leaveScale) / 2;
  assert.equal(overviewWanted(between, false), false);
  assert.equal(overviewWanted(between, true), true);
  assert.equal(overviewWanted(CHART_OVERVIEW.enterScale - 0.01, false), true);
  assert.equal(overviewWanted(CHART_OVERVIEW.leaveScale + 0.01, true), false);
});

void test('a taken place is the only place drawn in colour; every other status is grey', (): void => {
  assert.equal(placeMark('allocated', false), 'taken');
  assert.equal(placeMark('allocated', true), 'taken');
  assert.equal(placeMark('available', false), 'open');
  assert.equal(placeMark('no_points', false), 'idle');
  assert.equal(placeMark('locked', false), 'idle');
  assert.equal(placeMark('closed', true), 'shut');
  assert.equal(placeMark('locked', true), 'route');
});

void test('a link is lit only between two taken places', (): void => {
  const all: readonly PlaceMark[] = ['taken', 'open', 'route', 'idle', 'shut'];
  for (const from of all) {
    for (const to of all) {
      const lit: boolean = linkMark(from, to) === 'lit';
      assert.equal(lit, from === 'taken' && to === 'taken', `${from} to ${to}`);
    }
  }
});

void test('a link on the hovered route shows the route, a closed end shuts it, anything else stays idle', (): void => {
  assert.equal(linkMark('taken', 'route'), 'route');
  assert.equal(linkMark('route', 'route'), 'route');
  assert.equal(linkMark('route', 'idle'), 'idle');
  assert.equal(linkMark('taken', 'open'), 'idle');
  assert.equal(linkMark('shut', 'taken'), 'shut');
});
