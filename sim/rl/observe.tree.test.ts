import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { heldTriggers } from '../powers.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import type { Build } from './build.ts';
import { RL, SELF_FEATURES, SLOT_FEATURES } from './contract.ts';
import { DUEL_KIT } from './kit.ts';
import { treeBuildFor } from './tree-build.ts';

const CONTENT: Content = loadContent();
const TOP: number = CONTENT.player.xp.maxLevel;
const BUILT: readonly string[] = ['damage_percent', 'crit_multiplier', 'life_regen', 'mana_regen', 'storm_resist', 'frost_resist', 'powers'];
const SLOT_BUILT: readonly string[] = ['life_on_hit', 'leech', 'pierce', 'echo', 'momentum'];

function selfOf(arena: Arena): number[] {
  return Array.from(arenaObservation(arena).obs.subarray(0, SELF_FEATURES.length));
}

function slotsOf(arena: Arena): number[][] {
  const obs: Float32Array = arenaObservation(arena).obs;
  return Array.from({ length: RL.slots }, (_unused: unknown, slot: number): number[] => Array.from(obs.subarray(SELF_FEATURES.length + slot * SLOT_FEATURES.length, SELF_FEATURES.length + (slot + 1) * SLOT_FEATURES.length)));
}

function arenaWith(seed: number, level: number): Arena {
  const build: Build = treeBuildFor(CONTENT, DUEL_KIT, seed, level);
  return createArena(CONTENT, { seed, jitter: 0, waves: 1, level, build });
}

void test('the hero sees the stats its tree raises', (): void => {
  const arena: Arena = arenaWith(3, TOP);
  const self: number[] = selfOf(arena);
  const stats = arena.world.player.stats;
  const at = (name: string): number => self[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
  assert.ok(Math.abs(at('damage_percent') - stats.damagePercent) < 1e-6);
  assert.ok(Math.abs(at('crit_multiplier') - (stats.critMultiplier - 1)) < 1e-6);
  assert.ok(Math.abs(at('storm_resist') - stats.stormResist) < 1e-6);
  assert.ok(Math.abs(at('frost_resist') - stats.frostResist) < 1e-6);
  assert.ok(at('life_regen') > 0);
  assert.ok(Math.abs(at('powers') - heldTriggers(CONTENT, arena.world.player) / RL.countScale) < 1e-6);
});

void test('tree builds across seeds move every new feature, and none reaches the clip', (): void => {
  const moved: Set<string> = new Set<string>();
  for (let seed: number = 0; seed < 48; seed += 1) {
    const arena: Arena = arenaWith(seed, TOP);
    const self: number[] = selfOf(arena);
    for (const name of BUILT) {
      const value: number = self[SELF_FEATURES.indexOf(name)] ?? 0;
      assert.ok(Math.abs(value) < RL.clip, `${name} at seed ${seed}`);
      if (value !== 0) moved.add(name);
    }
    for (const slot of slotsOf(arena)) {
      for (const name of SLOT_BUILT) {
        const value: number = slot[SLOT_FEATURES.indexOf(name)] ?? 0;
        assert.ok(Math.abs(value) < RL.clip, `${name} at seed ${seed}`);
        if (value !== 0) moved.add(name);
      }
    }
  }
  assert.deepEqual([...BUILT, ...SLOT_BUILT].filter((name: string): boolean => !moved.has(name)), []);
});
