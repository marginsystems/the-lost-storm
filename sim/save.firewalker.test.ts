import assert from 'node:assert/strict';
import { test } from 'node:test';
import { made, played, roundTrip, saveContent } from '../test/save-support.ts';
import { must } from '../test/support.ts';
import type { WeaponGroup } from './content/chart-types.ts';
import type { SkillDef } from './content/types.ts';
import { allocateNode, refundNode } from './world/character.ts';
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
  assert.deepEqual(world.player.bar, [...old.player.bar, 'ember_swift']);
  assert.deepEqual(world.player.changes, old.player.changes);
  assert.deepEqual(world.player.skills.map((skill: SkillDef | null): string | null => skill?.name ?? null), [null, 'Fire Slam', 'Held Breath', 'Flashover', 'Firewall', 'Dodge Roll', 'Ember Swift']);
  const manual = [...world.player.bar];
  manual[6] = null;
  world.player.bar = manual;
  assert.deepEqual(createWorld(saveContent, { seed: 4, save: roundTrip(world) }).player.bar, manual);
  const roll: SkillDef = must(world.player.skills[5], 'dodge');
  const base: SkillDef = must(saveContent.skills.get('dodge_roll'), 'base dodge');
  assert.ok(roll.delivery.type === 'dash' && base.delivery.type === 'dash');
  assert.ok(Math.abs(roll.delivery.distance - base.delivery.distance * 1.3) < 1e-9);
});

function forkLength(world: World): number | undefined {
  const skill: SkillDef = must(world.player.skills[1], 'Q');
  assert.equal(skill.form, 'thunderclap_gathered');
  return skill.delivery.type === 'area' ? skill.delivery.fork?.length : undefined;
}

void test('Split Seam costs one point after Fire Slam, survives loading, and refunds independently', (): void => {
  const old: World = played();
  old.player.level = 12;
  old.player.bar[1] = 'thunderclap';
  old.player.skillPoints = 1;
  old.player.gold = 10000;
  old.player.allocated = ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock', 'stone_4'];
  allocateNode(old, 'split_seam');
  assert.equal(old.player.skillPoints, 1);
  old.player.allocated.push('gathered_clap');
  old.player.changes = { thunderclap: 'thunderclap_gathered' };
  const world: World = createWorld(saveContent, { seed: 4, save: roundTrip(old) });
  assert.equal(forkLength(world), 0);
  const before: number = world.player.skillPoints;
  allocateNode(world, 'split_seam');
  allocateNode(world, 'split_seam');
  assert.equal(world.player.skillPoints, before - 1);
  assert.equal(forkLength(world), 5);
  const loaded: World = createWorld(saveContent, { seed: 5, save: roundTrip(world) });
  assert.equal(forkLength(loaded), 5);
  const spent: number = loaded.player.skillPoints;
  refundNode(loaded, 'split_seam');
  assert.equal(loaded.player.skillPoints, spent + 1);
  assert.equal(forkLength(loaded), 0);
});
