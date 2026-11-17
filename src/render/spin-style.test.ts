import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SpinClips, SpinStyle } from './spin-style.ts';
import { lapDelta, shownTurn, SPIN_STYLE, SPIN_STYLES, spinCycle, spinLean, spinStyleFrom, turnStep } from './spin-style.ts';

const LAP: number = Math.PI * 2;

void test('the page option picks a spin style by number or name, and anything else gives the shipped one', (): void => {
  assert.equal(spinStyleFrom('').id, SPIN_STYLE.shipped);
  assert.equal(SPIN_STYLE.shipped, 'twohand');
  assert.equal(spinStyleFrom('?spin=0').id, 'now');
  assert.equal(spinStyleFrom('?spin=1').id, 'upright');
  assert.equal(spinStyleFrom('?spin=2').id, 'heavy');
  assert.equal(spinStyleFrom('?spin=3').id, 'stepping');
  assert.equal(spinStyleFrom('?spin=heavy').id, 'heavy');
  assert.equal(spinStyleFrom('?spin=9').id, SPIN_STYLE.shipped);
  assert.equal(spinStyleFrom('?spin=wobbly').id, SPIN_STYLE.shipped);
  assert.equal(spinStyleFrom('?spin=').id, SPIN_STYLE.shipped);
  assert.equal(spinStyleFrom('?spin').id, SPIN_STYLE.shipped);
  assert.equal(spinStyleFrom('?spin=%20').id, SPIN_STYLE.shipped);
});

void test('a stepping turn lands on every whole lap, never runs backwards, and lingers then hurries inside a lap', (): void => {
  const style: SpinStyle = SPIN_STYLES.stepping;
  for (const laps of [0, 1, 2, 5]) assert.ok(Math.abs(shownTurn(style, laps * LAP) - laps * LAP) < 1e-9);
  let last: number = -Infinity;
  for (let step: number = 0; step <= 400; step += 1) {
    const shown: number = shownTurn(style, (step / 100) * LAP);
    assert.ok(shown >= last - 1e-9);
    last = shown;
  }
  assert.ok(shownTurn(style, LAP * 0.1) < LAP * 0.1);
  assert.ok(shownTurn(style, LAP * 0.5) - shownTurn(style, LAP * 0.4) > LAP * 0.1);
});

void test('a smooth style shows the turn as it is', (): void => {
  for (const id of ['now', 'upright', 'heavy'] as const) assert.equal(shownTurn(SPIN_STYLES[id], 3.7), 3.7);
});

void test('the heavy turn starts slow and reaches full speed with momentum, and the upright turn is quick at any momentum', (): void => {
  assert.ok(turnStep(SPIN_STYLES.heavy, 1, 0) < turnStep(SPIN_STYLES.heavy, 1, 1));
  assert.equal(turnStep(SPIN_STYLES.heavy, 1, 1), 1);
  assert.equal(turnStep(SPIN_STYLES.upright, 1, 0), turnStep(SPIN_STYLES.upright, 1, 1));
  assert.ok(turnStep(SPIN_STYLES.upright, 1, 0) > 1);
  assert.equal(turnStep(SPIN_STYLES.now, 0.4, 0.5), 0.4);
});

void test('only the stepping style plays the swing through, once a lap', (): void => {
  assert.equal(spinCycle(SPIN_STYLES.upright, 2), null);
  assert.ok(Math.abs((spinCycle(SPIN_STYLES.stepping, LAP * 2.25) ?? -1) - 0.25) < 1e-9);
});

void test('the heavy lean is deeper in a glide and grows with momentum, and the upright hero never leans', (): void => {
  assert.equal(spinLean(SPIN_STYLES.upright, 1, true), 0);
  assert.ok(spinLean(SPIN_STYLES.heavy, 1, true) > spinLean(SPIN_STYLES.heavy, 0, true));
  assert.ok(spinLean(SPIN_STYLES.heavy, 1, true) > spinLean(SPIN_STYLES.heavy, 1, false));
  assert.equal(spinLean(SPIN_STYLES.heavy, 0, false), 0);
});

void test('the turn read across the sim wrapping a lap is the small step forward, so no look jumps once a lap', (): void => {
  assert.ok(Math.abs(lapDelta(LAP - 0.1, 0.05) - 0.15) < 1e-9);
  assert.ok(Math.abs(lapDelta(0.2, 0.5) - 0.3) < 1e-9);
  for (const id of ['upright', 'heavy', 'stepping'] as const) {
    let sim: number = 0;
    let shown: number = 0;
    for (let step: number = 0; step < 200; step += 1) {
      const next: number = (sim + 0.13) % LAP;
      const moved: number = turnStep(SPIN_STYLES[id], lapDelta(sim, next), 0.5);
      assert.ok(moved > 0 && moved < 0.5, id);
      shown += moved;
      sim = next;
    }
  }
});

void test('the page option reaches the four clip-driven looks by number, and only they play their own clips', (): void => {
  assert.equal(spinStyleFrom('?spin=4').id, 'mocap');
  assert.equal(spinStyleFrom('?spin=5').id, 'skate');
  assert.equal(spinStyleFrom('?spin=6').id, 'twohand');
  assert.equal(spinStyleFrom('?spin=7').id, 'low');
  for (const id of ['now', 'upright', 'heavy', 'stepping'] as const) assert.equal(SPIN_STYLES[id].clips, null);
  for (const id of ['mocap', 'skate', 'twohand', 'low'] as const) {
    const clips: SpinClips | null = SPIN_STYLES[id].clips;
    assert.ok(clips !== null);
    assert.deepEqual([clips.start, clips.loop, clips.end], [`spin_${id}_in`, `spin_${id}_loop`, `spin_${id}_out`]);
    assert.equal(spinCycle(SPIN_STYLES[id], LAP * 1.5), null);
  }
});
