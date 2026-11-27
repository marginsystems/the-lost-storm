import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuraReading } from '../../sim/world/aura.ts';
import { shapeSkill } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import { createAuraSignState, readAuraSign } from './aura-sign.ts';
import type { AuraChipReading, AuraSignState } from './aura-sign.ts';

void test('refreshing Held Breath keeps one visible chip and resets its countdown', (): void => {
  const state: AuraSignState = createAuraSignState();
  const fading: AuraReading = { id: 7, skill: shapeSkill('held_breath'), timeLeft: 3, duration: 20 };
  readAuraSign(state, [fading], 0.1);
  const refreshed: readonly AuraChipReading[] = readAuraSign(state, [{ ...fading, id: 8, timeLeft: 20 }], 0.1);
  assert.equal(refreshed.length, 1);
  const chip: AuraChipReading = must(refreshed[0], 'active chip');
  assert.deepEqual([chip.name, chip.seconds, chip.up], ['Held Breath', '20s', true]);
});
