import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { TailwindDef } from '../../sim/content/tailwind-types.ts';
import { calmTailwind } from '../../sim/world/tailwind.ts';
import type { TailwindState } from '../../sim/world/tailwind-types.ts';
import type { TailwindMeterState, TailwindReading } from './tailwind-reading.ts';
import { createTailwindMeter, readTailwind, spendTailwind, TAILWIND_METER, windfallText } from './tailwind-reading.ts';

const DT: number = 1 / 60;
const DEF: TailwindDef = loadContent().tailwind;

function burning(tier: number, fuse: number): TailwindState {
  const full: number = DEF.tiers[tier - 1]?.fuse ?? DEF.fuse;
  return { ...calmTailwind(), points: DEF.tiers[tier - 1]?.at ?? 1, kills: 5, tier, best: tier, fuse, full };
}

function settle(state: TailwindMeterState, live: TailwindState, seconds: number): TailwindReading {
  let reading: TailwindReading = readTailwind(state, live, DEF, DT);
  for (let at: number = DT; at < seconds; at += DT) reading = readTailwind(state, live, DEF, DT);
  return reading;
}

void test('the meter stays hidden for a calm streak and below the first tier', (): void => {
  const state: TailwindMeterState = createTailwindMeter();
  assert.equal(settle(state, calmTailwind(), 1).shown, 0);
  const below: TailwindReading = settle(state, { ...calmTailwind(), points: 1, kills: 1, fuse: DEF.fuse, full: DEF.fuse }, 1);
  assert.equal(below.phase, 'calm');
  assert.equal(below.shown, 0);
});

void test('a live tier eases the meter in with its name, its count and its fuse, and never jumps in one frame', (): void => {
  const state: TailwindMeterState = createTailwindMeter();
  const live: TailwindState = burning(1, DEF.tiers[0]?.fuse ?? 1);
  const first: TailwindReading = readTailwind(state, live, DEF, DT);
  assert.equal(first.phase, 'live');
  assert.equal(first.rose, true);
  assert.equal(first.name, DEF.tiers[0]?.name);
  assert.equal(first.count, String(live.points));
  assert.ok(first.shown > 0 && first.shown < 0.5, `${first.shown}`);
  assert.ok(first.fuse > 0 && first.fuse < 0.5);
  const later: TailwindReading = settle(state, live, 2);
  assert.equal(later.rose, false);
  assert.ok(later.shown > 0.98 && later.fuse > 0.98);
});

void test('a rise to a new tier is flagged once and warms the meter', (): void => {
  const state: TailwindMeterState = createTailwindMeter();
  const low: TailwindReading = settle(state, burning(1, 4), 2);
  const up: TailwindReading = readTailwind(state, burning(3, 5), DEF, DT);
  assert.equal(up.rose, true);
  assert.equal(up.name, DEF.tiers[2]?.name);
  assert.equal(readTailwind(state, burning(3, 5), DEF, DT).rose, false);
  assert.ok(settle(state, burning(3, 5), 2).heat > low.heat);
});

void test('a fuse filled past its length shows as overfill, not as more than a full bar', (): void => {
  const state: TailwindMeterState = createTailwindMeter();
  const full: number = DEF.tiers[1]?.fuse ?? 1;
  const reading: TailwindReading = settle(state, burning(2, full * DEF.burst.most), 2);
  assert.ok(reading.fuse <= 1 && reading.fuse > 0.98);
  assert.ok(reading.over > 0.98);
});

void test('a spent streak holds its best tier and windfall, then falls away softly', (): void => {
  const state: TailwindMeterState = createTailwindMeter();
  settle(state, burning(4, 5), 2);
  spendTailwind(state, 4, 41, 120, 37);
  const held: TailwindReading = readTailwind(state, calmTailwind(), DEF, DT);
  assert.equal(held.phase, 'ended');
  assert.equal(held.name, DEF.tiers[3]?.name);
  assert.equal(held.count, '41');
  assert.equal(held.windfall, '+37 gold  +120 experience');
  assert.ok(held.shown > 0.9);
  assert.ok(held.fuse < 1);
  const fading: TailwindReading = settle(state, calmTailwind(), TAILWIND_METER.endHold - TAILWIND_METER.endFade + 0.05);
  assert.ok(fading.shown < 1 && fading.shown > 0, `${fading.shown}`);
  const gone: TailwindReading = settle(state, calmTailwind(), TAILWIND_METER.endFade + 1);
  assert.equal(gone.phase, 'calm');
  assert.ok(gone.shown < 0.01);
});

void test('a new streak cuts the spent one short, and a streak that never reached a tier leaves nothing to show', (): void => {
  const state: TailwindMeterState = createTailwindMeter();
  spendTailwind(state, 2, 12, 10, 5);
  assert.equal(readTailwind(state, burning(1, 4), DEF, DT).phase, 'live');
  assert.equal(state.spent, null);
  spendTailwind(state, 0, 2, 0, 0);
  assert.equal(state.spent, null);
});

void test('the windfall line names only what was paid', (): void => {
  assert.equal(windfallText(0, 0), '');
  assert.equal(windfallText(15, 0), '+15 experience');
  assert.equal(windfallText(0, 8), '+8 gold');
});
