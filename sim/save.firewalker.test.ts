import assert from 'node:assert/strict';
import { test } from 'node:test';
import { made, played, roundTrip, saveContent } from '../test/save-support.ts';
import { must } from '../test/support.ts';
import type { WeaponGroup } from './content/chart-types.ts';
import type { SkillDef } from './content/types.ts';
import { createWorld } from './world/create.ts';
import type { World } from './world/types.ts';

void test('a saved Firewalker with an empty click slot and a chosen Gathered Clap loads the hammer, aura, flock, wall and longer roll', (): void => {
  const old: World = played();
  old.player.level = 20;
  old.player.allocated = ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock', 'stone_held_breath', 'stone_4', 'gathered_clap', 'stone_7', 'stone_bellows', 'mountain_falls', 'stone_banked_fire', 'stone_flashover', 'stone_5', 'stone_6', 'stone_fire_burst'];
  old.player.changes = { thunderclap: 'thunderclap_gathered' };
  old.player.learned.push('dodge_roll');
  old.player.bar = [null, 'thunderclap', 'held_breath', 'banked_fire', 'firewall', 'dodge_roll'];
  old.player.equipped.weapon = made(must(saveContent.chart.weaponGroups.find((group: WeaponGroup): boolean => group.id === 'heavy'), 'heavy weapons').starter, 'common', 18);
  const world: World = createWorld(saveContent, { seed: 4, save: roundTrip(old) });
  assert.deepEqual(world.player.bar, old.player.bar);
  assert.deepEqual(world.player.changes, old.player.changes);
  assert.deepEqual(world.player.skills.map((skill: SkillDef | null): string | null => skill?.name ?? null), [null, 'Fire Slam', 'Held Breath', 'Flashover', 'Firewall', 'Dodge Roll']);
  const roll: SkillDef = must(world.player.skills[5], 'dodge');
  const base: SkillDef = must(saveContent.skills.get('dodge_roll'), 'base dodge');
  assert.ok(roll.delivery.type === 'dash' && base.delivery.type === 'dash');
  assert.ok(Math.abs(roll.delivery.distance - base.delivery.distance * 1.3) < 1e-9);
});
