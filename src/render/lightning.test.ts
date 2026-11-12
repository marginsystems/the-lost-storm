import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StrikeKind, StrikePlan } from './lightning.ts';
import { LIGHTNING, planStrike, sampleStrike, STRIKE_KINDS } from './lightning.ts';

function seeded(seed: number): () => number {
  let state: number = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed: number = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const LOUD = { soft: false, power: 1, budget: LIGHTNING.deepPerSecond } as const;

void test('a near strike is a leader and one to four return strokes, and the pattern changes from strike to strike', (): void => {
  const random: () => number = seeded(4);
  const counts: Set<number> = new Set<number>();
  for (let index: number = 0; index < 400; index += 1) {
    const plan: StrikePlan = planStrike('near', random, LOUD);
    assert.ok(plan.pulses.length >= 2 && plan.pulses.length <= 5);
    counts.add(plan.pulses.length);
    for (let stroke: number = 1; stroke < plan.pulses.length; stroke += 1) {
      const gap: number = (plan.pulses[stroke]?.at ?? 0) - (plan.pulses[stroke - 1]?.at ?? 0);
      assert.ok(gap >= LIGHTNING.strokeGapMin && gap <= LIGHTNING.strokeGapMax * 1.6, `gap ${gap}`);
    }
  }
  assert.deepEqual([...counts].toSorted((a: number, b: number): number => a - b), [2, 3, 4, 5]);
  const singles: number = Array.from({ length: 200 }, (): StrikePlan => planStrike('fork', random, LOUD)).filter((plan: StrikePlan): boolean => plan.pulses.length === 1).length;
  assert.ok(singles > 0);
});

void test('return strokes mostly fade but sometimes come back brighter', (): void => {
  const random: () => number = seeded(9);
  let rose: number = 0;
  let fell: number = 0;
  for (let index: number = 0; index < 300; index += 1) {
    const plan: StrikePlan = planStrike('near', random, LOUD);
    for (let stroke: number = 1; stroke < plan.pulses.length; stroke += 1) {
      if ((plan.pulses[stroke]?.peak ?? 0) > (plan.pulses[stroke - 1]?.peak ?? 0)) rose += 1;
      else fell += 1;
    }
  }
  assert.ok(rose > 0);
  assert.ok(fell > rose * 3);
});

void test('after the strokes a dimmer afterglow fades over about half a second, warmer than the strokes, with a short exposure dip', (): void => {
  const plan: StrikePlan = planStrike('near', seeded(2), LOUD);
  const leader: number = plan.pulses[0]?.peak ?? 0;
  const early = sampleStrike(plan, plan.glowAt + 0.02);
  assert.ok(early.light > 0.2 * leader && early.light < 0.4 * leader);
  assert.ok(early.stroke < early.light);
  assert.ok(sampleStrike(plan, plan.glowAt + 0.6).light < 0.03);
  assert.ok(sampleStrike(plan, plan.glowAt + LIGHTNING.dipRise).dip > 0.9);
  assert.ok(sampleStrike(plan, plan.end).dip < 0.1);
});

void test('sheet lightning is soft and has no direction, and a moment strike is brighter and closer than any weather', (): void => {
  const random: () => number = seeded(5);
  for (let index: number = 0; index < 100; index += 1) {
    const sheet: StrikePlan = planStrike('sheet', random, LOUD);
    assert.equal(sheet.sheet, 1);
    assert.ok(Math.max(...sheet.pulses.map((pulse): number => pulse.peak)) <= STRIKE_KINDS.sheet.peakMax);
    assert.ok((sheet.pulses[0]?.rise ?? 0) > 0.1);
  }
  const weather: StrikeKind[] = ['sheet', 'near', 'fork'];
  const brightest: number = Math.max(...weather.map((kind: StrikeKind): number => STRIKE_KINDS[kind].peakMax));
  const farthest: number = Math.min(...weather.map((kind: StrikeKind): number => STRIKE_KINDS[kind].distanceMin));
  assert.ok(STRIKE_KINDS.moment.peakMin > brightest);
  assert.ok(STRIKE_KINDS.moment.distanceMax < farthest);
});

void test('thunder follows each strike by its distance over the speed of sound', (): void => {
  const plan: StrikePlan = planStrike('near', seeded(3), LOUD);
  assert.equal(plan.thunderDelay, plan.distance / LIGHTNING.soundSpeed);
  assert.ok(plan.thunderDelay > 1);
});

void test('softened flashes are one gentle pulse with capped contrast', (): void => {
  const random: () => number = seeded(8);
  for (const kind of ['sheet', 'near', 'fork', 'moment'] as const) {
    const plan: StrikePlan = planStrike(kind, random, { soft: true, power: 1, budget: 3 });
    assert.equal(plan.pulses.length, 1);
    assert.ok((plan.pulses[0]?.peak ?? 1) <= LIGHTNING.softPeak);
    assert.ok((plan.pulses[0]?.rise ?? 0) >= LIGHTNING.softRise);
  }
});
