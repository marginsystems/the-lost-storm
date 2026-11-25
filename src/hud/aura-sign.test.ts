import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { AuraReading } from '../../sim/world/aura.ts';
import { must } from '../../test/support.ts';
import type { AuraChipReading, AuraSignState } from './aura-sign.ts';
import { AURA_SIGN, createAuraSignState, readAuraSign } from './aura-sign.ts';

const DT: number = 1 / 60;
const STATIC_FIELD: SkillDef = must(loadContent().skills.get('static_field'), 'static_field');

function held(timeLeft: number): AuraReading {
  return { id: 7, skill: STATIC_FIELD, timeLeft, duration: 30 };
}

function only(readings: readonly AuraChipReading[]): AuraChipReading {
  assert.equal(readings.length, 1);
  return must(readings[0], 'one chip');
}

void test('a new aura shows its name, icon, whole seconds left and a fuse that follows the time left', (): void => {
  const state: AuraSignState = createAuraSignState();
  const first: AuraChipReading = only(readAuraSign(state, [held(29.98)], DT));
  assert.equal(first.up, true);
  assert.equal(first.name, 'Static Field');
  assert.equal(first.icon, 'static_field');
  assert.equal(first.seconds, '30s');
  assert.ok(Math.abs(first.fuse - 29.98 / 30) < 0.001, `${first.fuse}`);
  let reading: AuraChipReading = first;
  for (let frame: number = 0; frame < 90; frame += 1) reading = readAuraSign(state, [held(29.98 - frame * DT)], DT)[0] ?? reading;
  assert.ok(Math.abs(reading.fuse - 28.48 / 30) < 0.02, `${reading.fuse}`);
  assert.equal(reading.seconds, '29s');
});

void test('an aura that ends keeps its sign while it eases out, then drops it', (): void => {
  const state: AuraSignState = createAuraSignState();
  for (let frame: number = 0; frame < 90; frame += 1) readAuraSign(state, [held(5)], DT);
  const fading: AuraChipReading = only(readAuraSign(state, [], DT));
  assert.equal(fading.up, false);
  assert.equal(fading.seconds, '5s');
  let left: readonly AuraChipReading[] = [fading];
  let frames: number = 1;
  for (; frames < 120 && left.length > 0; frames += 1) left = readAuraSign(state, [], DT);
  assert.deepEqual(left, []);
  assert.ok(frames * DT >= AURA_SIGN.leave, `${frames} frames`);
});
