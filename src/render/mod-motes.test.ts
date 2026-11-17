import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterDef } from '../../sim/content/types.ts';
import { withMods } from '../../sim/world/elites.ts';
import { MOD_MOTES, motesDue, motesOf } from './mod-motes.ts';

void test('a monster gives off the motes of every modifier that has a look, and a plain one none', (): void => {
  const taker: MonsterDef = must(ARENA_CONTENT.monsters.get('unfinished_taker'), 'taker');
  assert.deepEqual(motesOf(ARENA_CONTENT, taker), []);
  const stormlit = must(ARENA_CONTENT.monsterMods.get('stormlit'), 'stormlit');
  const hulking = must(ARENA_CONTENT.monsterMods.get('hulking'), 'hulking');
  assert.deepEqual(motesOf(ARENA_CONTENT, withMods(taker, [stormlit, hulking])), [stormlit.motes]);
});

void test('motes come at their rate over many frames, and a long frame never bursts more than a few', (): void => {
  let carry: number = 0;
  let given: number = 0;
  for (let frame: number = 0; frame < 600; frame += 1) {
    const due = motesDue(carry, 8, 1 / 60);
    carry = due.carry;
    given += due.count;
  }
  assert.ok(Math.abs(given - 80) <= 1);
  assert.ok(motesDue(0, 8, 5).count <= MOD_MOTES.most);
});
