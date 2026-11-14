import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Group } from 'three';
import type { SkillDef } from '../../sim/content/types.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { EffectKit } from './effect-kit.ts';
import { createEffectKit, KIT_BUDGETS } from './effect-kit.ts';
import type { ParticleSystem } from './particles.ts';
import { createShockwave } from './shockwave.ts';

const QUIET: ParticleSystem = { burst(): void {}, setDensity(): void {}, update(): void {}, clear(): void {} };

interface Struck {
  readonly added: number;
  readonly strands: number;
}

function strike(struck: SkillDef): Struck {
  let added: number = 0;
  const kit: EffectKit = createEffectKit(new Group(), QUIET, (): void => {}, () => KIT_BUDGETS.desktop);
  const shockwave = createShockwave({ add: (): void => void (added += 1), spray: (): void => {}, flashLight: (): void => {}, shade: (): void => {}, kit, dust: new Color() });
  shockwave(0, 0, 4, new Color(0x7fd4ff), struck);
  return { added, strands: kit.strands.active };
}

function skillOf(id: string): SkillDef {
  const found: SkillDef | undefined = loadContent().skills.get(id);
  assert.ok(found !== undefined, id);
  return found;
}

void test('a shockwave with a lightning look strikes from the sky with strands instead of the flickering bolt', (): void => {
  const lit: Struck = strike(skillOf('thunderclap'));
  const plain: Struck = strike(skillOf('colossus_slam'));
  assert.ok(lit.strands > 0);
  assert.equal(plain.strands, 0);
  assert.equal(plain.added - lit.added, 2);
});
