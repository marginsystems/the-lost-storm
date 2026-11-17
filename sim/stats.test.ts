import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSIC_BAR, must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, PowerDef, SkillDef, SkillMod, SkillVariant, StatBlock } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { wornVariants } from './powers.ts';
import { createRng } from './rng.ts';
import { ANY_WEAPON } from './weapons.ts';
import { ADDED_ECHO, applyMods, armourReduction, averageHit, computeStats, damagePerSecond, damageTakenScale, modTargets, resistanceOf, resolveSkill, resolveSkillBar, variantChain } from './stats.ts';
import { addToInventory, equipFromInventory } from './world/character.ts';
import { echoedSkill } from './world/skills.ts';
import { createWorld } from './world/create.ts';
import type { Equipment, ItemInstance, World } from './world/types.ts';

const content: Content = loadContent();
const bare: Equipment = emptyEquipment();

function skillOf(id: string): SkillDef {
  return must(content.skills.get(id), id);
}

function item(base: string, level: number = 1): ItemInstance {
  return must(generateItem(content, createRng(1), 1, level, base, 'common'), base);
}

void test('an unequipped level 1 character has exactly the base stats', (): void => {
  assert.deepEqual(computeStats(content, 1, bare, []), content.player.baseStats);
});

void test('levels add the per-level modifiers', (): void => {
  const stats: StatBlock = computeStats(content, 5, bare, []);
  assert.equal(stats.maxLife, 100 + 12 * 4);
  assert.equal(stats.damageMax, 4 + 1 * 4);
});

void test('equipping a weapon raises damageMin and damageMax', (): void => {
  const before: StatBlock = computeStats(content, 1, bare, []);
  const after: StatBlock = computeStats(content, 1, { ...bare, weapon: item('rusted_blade') }, []);
  assert.equal(after.damageMin, before.damageMin + 3);
  assert.equal(after.damageMax, before.damageMax + 6);
});

void test('percent modifiers multiply the total of the flat ones', (): void => {
  const base: StatBlock = content.player.baseStats;
  const mixed: StatBlock = applyMods(base, [
    { stat: 'maxLife', op: 'add', value: 50 },
    { stat: 'maxLife', op: 'percent', value: 0.5 },
    { stat: 'maxLife', op: 'percent', value: 0.5 },
  ]);
  assert.equal(mixed.maxLife, (100 + 50) * 2);
  assert.ok(Math.abs(applyMods(base, [{ stat: 'maxLife', op: 'percent', value: 0.1 }]).maxLife - 110) < 1e-9);
  assert.equal(applyMods(base, [{ stat: 'armour', op: 'add', value: 7 }]).armour, 7);
  assert.equal(base.maxLife, 100);
});

void test('allocated nodes add stat modifiers', (): void => {
  const stats: StatBlock = computeStats(content, 1, bare, ['tempered_body', 'heavy_hands'], [], 'blade');
  assert.equal(stats.maxLife, 130);
  assert.ok(Math.abs(stats.damagePercent - 0.2) < 1e-9);
});

void test('the maximum damage never falls below the minimum', (): void => {
  const stats: StatBlock = applyMods(content.player.baseStats, [{ stat: 'damageMin', op: 'add', value: 20 }]);
  assert.ok(stats.damageMin > stats.damageMax);
  const bumped: StatBlock = computeStats({ ...content, player: { ...content.player, perLevel: [{ stat: 'damageMin', op: 'add', value: 20 }] } }, 2, bare, []);
  assert.ok(bumped.damageMax >= bumped.damageMin);
});

void test('Forked Bolt gives Storm Bolt three projectiles and one more pierce', (): void => {
  const plain: SkillDef = skillOf('storm_bolt');
  const forked: SkillDef = resolveSkill(content, plain, ['stormcallers_focus', 'forked_bolt']);
  assert.equal(plain.delivery.type, 'projectile');
  assert.equal(forked.delivery.type, 'projectile');
  assert.equal(forked.delivery.count, plain.delivery.count + 2);
  assert.equal(forked.delivery.count, 3);
  assert.equal(forked.delivery.pierce, plain.delivery.pierce + 1);
});

void test('Rolling Thunder widens Thunderclap and shortens its cooldown', (): void => {
  const plain: SkillDef = skillOf('thunderclap');
  const rolling: SkillDef = resolveSkill(content, plain, ['rolling_thunder']);
  assert.equal(plain.delivery.type, 'nova');
  assert.equal(rolling.delivery.type, 'nova');
  assert.ok(Math.abs(rolling.delivery.radius - plain.delivery.radius * 1.35) < 1e-9);
  assert.ok(Math.abs(rolling.cooldown - plain.cooldown * 0.75) < 1e-9);
  assert.ok(Math.abs(rolling.knockback - plain.knockback * 1.5) < 1e-9);
});

void test('a modifier on a group of skills reaches every skill in the group and nothing else', (): void => {
  const taken: readonly string[] = ['stormcallers_focus', 'storm_1'];
  const lightning: number = must(content.chart.groups.find((group): boolean => group.id === 'lightning'), 'lightning').skills.length;
  assert.ok(lightning > 3);
  for (const id of ['storm_bolt', 'squall', 'forkline']) {
    const plain: SkillDef = skillOf(id);
    assert.ok(resolveSkill(content, plain, taken).damage.weaponPercent > plain.damage.weaponPercent, id);
  }
  assert.equal(resolveSkill(content, skillOf('cleave'), taken), skillOf('cleave'));
});

function probe(skillMods: readonly SkillMod[]): Content {
  return { ...content, skillTree: [{ ...must(content.skillTree[0], 'node'), id: 'probe', skillMods, statMods: [] }] };
}

void test('range, duration, jumps and stagger modifiers reach the delivery', (): void => {
  const squall: SkillDef = resolveSkill(probe([{ target: { type: 'skill', skill: 'squall' }, field: 'durationPercent', value: 0.5 }, { target: { type: 'skill', skill: 'squall' }, field: 'rangePercent', value: 0.2 }]), skillOf('squall'), ['probe']);
  assert.ok(squall.delivery.type === 'area');
  assert.equal(squall.delivery.duration, 6);
  assert.ok(Math.abs(squall.delivery.range - 11 * 1.2) < 1e-9);
  const fork: SkillDef = resolveSkill(probe([{ target: { type: 'skill', skill: 'forkline' }, field: 'chains', value: 2 }, { target: { type: 'skill', skill: 'forkline' }, field: 'staggerPercent', value: 1 }]), skillOf('forkline'), ['probe']);
  assert.ok(fork.delivery.type === 'chain' && fork.delivery.jumps === 6);
  assert.ok(Math.abs(fork.stagger - skillOf('forkline').stagger * 2) < 1e-9);
});

void test('a variant place swaps how a skill is delivered but keeps its id and slot', (): void => {
  const lance: SkillDef = resolveSkill(content, skillOf('storm_bolt'), ['stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4', 'storm_lance']);
  assert.equal(lance.id, 'storm_bolt');
  assert.equal(lance.name, 'Storm Lance');
  assert.equal(lance.delivery.type, 'beam');
  const whirl: SkillDef = resolveSkill(content, skillOf('cleave'), ['heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave']);
  assert.equal(whirl.delivery.type, 'nova');
  assert.equal(whirl.combo, null);
  const echoed: SkillDef = resolveSkill(content, skillOf('storm_bolt'), ['first_echo', 'echo_1', 'long_squall', 'echo_4', 'twice_told_bolt']);
  assert.ok(echoed.echo > 0);
  for (const node of content.skillTree) {
    for (const variant of node.variants) {
      const base: SkillDef = skillOf(variant.skill);
      const changed: SkillDef = resolveSkill(content, base, [node.id]);
      assert.equal(changed.id, base.id, node.id);
      assert.notEqual(changed.name, base.name, node.id);
    }
  }
});

void test('skills without matching modifiers are returned untouched', (): void => {
  const cleave: SkillDef = skillOf('cleave');
  assert.equal(resolveSkill(content, cleave, ['rolling_thunder', 'forked_bolt']), cleave);
  const bar: (SkillDef | null)[] = resolveSkillBar(content, CLASSIC_BAR, []);
  assert.deepEqual(
    bar.map((skill: SkillDef | null): string | null => skill?.id ?? null),
    [...CLASSIC_BAR],
  );
});

void test('armour and damage helpers behave sensibly', (): void => {
  assert.equal(armourReduction(0, 1), 0);
  assert.equal(armourReduction(100, 1), 0.5);
  assert.equal(armourReduction(-50, 1), 0);
  const stats: StatBlock = content.player.baseStats;
  assert.ok(averageHit(stats) > (stats.damageMin + stats.damageMax) / 2);
  assert.ok(damagePerSecond(stats, skillOf('cleave')) > 0);
  assert.ok(damagePerSecond({ ...stats, attackSpeed: 2 }, skillOf('cleave')) > damagePerSecond(stats, skillOf('cleave')));
});

void test('every equipment slot adds its item to the stats', (): void => {
  const before: StatBlock = computeStats(content, 1, bare, []);
  const dressed: Equipment = {
    ...bare,
    head: item('wayfarer_hood'),
    chest: item('drowned_leathers'),
    hands: item('strapped_bracers'),
    legs: item('stalker_leggings'),
    feet: item('strider_boots'),
  };
  const after: StatBlock = computeStats(content, 1, dressed, []);
  assert.equal(after.armour, before.armour + 6 + 12 + 6 + 9 + 6);
  assert.equal(after.maxLife, before.maxLife + 14 + 10);
  assert.ok(Math.abs(after.critChance - (before.critChance + 0.02)) < 1e-9);
  assert.ok(Math.abs(after.attackSpeed - (before.attackSpeed + 0.05)) < 1e-9);
  assert.ok(Math.abs(after.moveSpeed - before.moveSpeed * 1.08) < 1e-9);
  const heavy: StatBlock = computeStats(content, 1, { ...bare, chest: item('squall_plate') }, []);
  assert.ok(heavy.moveSpeed < before.moveSpeed);
  assert.ok(heavy.armour > after.armour - 6 - 6 - 9 - 6);
  for (const slot of ITEM_SLOTS) {
    if (dressed[slot] === null) continue;
    const without: StatBlock = computeStats(content, 1, { ...dressed, [slot]: null }, []);
    assert.notDeepEqual(without, after, slot);
  }
});

void test('a resistance is capped, lowered by each storm tier, and never falls below the floor', (): void => {
  const rules = content.player.resistance;
  const stats: StatBlock = { ...computeStats(content, 1, bare, []), stormResist: 0.9, frostResist: 0.3 };
  assert.equal(resistanceOf(stats, 'storm', rules, 0), rules.cap);
  assert.equal(resistanceOf(stats, 'frost', rules, 0), 0.3);
  assert.ok(Math.abs(resistanceOf(stats, 'frost', rules, 1) - (0.3 - rules.tierPenalty)) < 1e-9);
  assert.equal(resistanceOf(stats, 'frost', rules, 50), rules.floor);
});

void test('armour cuts every hit, and storm and frost hits are cut again by their own resistance', (): void => {
  const rules = content.player.resistance;
  const stats: StatBlock = { ...computeStats(content, 1, bare, []), armour: 100, stormResist: 0.5, frostResist: 0 };
  assert.equal(damageTakenScale(stats, 'physical', rules, 0), 1 - armourReduction(100, 1));
  assert.equal(damageTakenScale(stats, 'storm', rules, 0), (1 - armourReduction(100, 1)) * 0.5);
  assert.equal(damageTakenScale(stats, 'frost', rules, 0), 1 - armourReduction(100, 1));
  assert.ok(damageTakenScale(stats, 'frost', rules, 1) > 1 - armourReduction(100, 1));
});

void test('attack speed, critical chance and movement speed stop at their caps from data', (): void => {
  const stats: StatBlock = computeStats({ ...content, player: { ...content.player, baseStats: { ...content.player.baseStats, attackSpeed: 9, critChance: 0.9, moveSpeed: 99 } } }, 1, bare, []);
  for (const cap of content.player.caps) assert.equal(stats[cap.stat], cap.max);
  assert.equal(armourReduction(100000, content.player.resistance.armourCap), content.player.resistance.armourCap);
});

function legendary(base: string): ItemInstance {
  return must(generateItem(content, createRng(7), 7, 5, base, null), base);
}

function wornPowerDefs(...bases: string[]): readonly PowerDef[] {
  return bases.map((base: string): PowerDef => must(content.itemBases.get(base)?.power, base));
}

void test('a pull turns every spin form into a pull of its own strength, even the Millwheel that pushes nothing, and leaves a plain Cleave alone', (): void => {
  const cleave: SkillDef = skillOf('cleave');
  const breeches: readonly PowerDef[] = wornPowerDefs('gyre_stitched_breeches');
  const wheel: SkillDef = resolveSkill(content, cleave, [], [...breeches, ...wornPowerDefs('the_millwheel')]);
  assert.equal(skillOf('cleave_millwheel').knockback, 0);
  const strength: number = breeches.flatMap((power: PowerDef): readonly SkillMod[] => power.skillMods).find((mod: SkillMod): boolean => mod.field === 'pull')?.value ?? 0;
  assert.ok(strength > 0);
  assert.equal(wheel.knockback, -strength);
  assert.equal(resolveSkill(content, cleave, ['whirling_cleave'], breeches).knockback, -strength);
  assert.equal(resolveSkill(content, cleave, [], breeches).knockback, cleave.knockback);
  const turned: SkillMod = { target: { type: 'skill', skill: 'cleave' }, field: 'knockbackPercent', value: -1.5 };
  assert.ok(Math.abs(resolveSkill(content, cleave, [], [{ family: 'millwheel', text: '', skillMods: [turned], variants: [], triggers: [] }]).knockback - cleave.knockback * -0.5) < 1e-9);
  const pull: SkillMod = { target: { type: 'skill', skill: 'cleave' }, field: 'damagePercent', value: -3 };
  const floored: SkillDef = resolveSkill(content, cleave, [], [{ family: 'millwheel', text: '', skillMods: [pull], variants: [], triggers: [] }]);
  assert.equal(floored.damage.weaponPercent, 0);
});

void test('the Lantern adds two chains and turns the falloff into a gain on every lightning chain', (): void => {
  const fork: SkillDef = skillOf('forkline');
  const lit: SkillDef = resolveSkill(content, fork, [], wornPowerDefs('lantern_of_second_sounds'));
  assert.ok(fork.delivery.type === 'chain' && lit.delivery.type === 'chain');
  assert.equal(lit.delivery.jumps, fork.delivery.jumps + 2);
  assert.ok(lit.delivery.falloff > 1);
  assert.equal(resolveSkill(content, skillOf('cleave'), [], wornPowerDefs('lantern_of_second_sounds')), skillOf('cleave'));
});

void test('the Millwheel turns Cleave into its held form, which keeps the Cleave id so Cleave powers still count it', (): void => {
  const bar: (SkillDef | null)[] = resolveSkillBar(content, ['cleave'], [], wornPowerDefs('the_millwheel'));
  const spun: SkillDef = must(bar[0], 'cleave');
  assert.equal(spun.id, 'cleave');
  assert.equal(spun.press?.type, 'channel');
  assert.ok(spun.manaCost > 0);
  assert.equal(must(resolveSkillBar(content, ['cleave'], [])[0], 'plain').press, null);
});

void test('a worn weapon that turns Cleave into a shot does so only while it is worn, and the shot keeps the Cleave id', (): void => {
  const world: World = createWorld(content, { seed: 4, save: null });
  world.player.inventory.fill(null);
  assert.equal(must(world.player.skills[0], 'bare cleave').delivery.type, 'arc');
  addToInventory(world, must(generateItem(content, createRng(4), 901, 2, 'hand_crossbow', 'common'), 'crossbow'));
  equipFromInventory(world, world.player.inventory.findIndex((held: ItemInstance | null): boolean => held?.base === 'hand_crossbow'));
  const shot: SkillDef = must(world.player.skills[0], 'shot');
  assert.equal(shot.id, 'cleave');
  assert.equal(shot.delivery.type, 'projectile');
  assert.equal(shot.animation, must(content.skills.get('quarrel'), 'quarrel').animation);
  assert.deepEqual(wornVariants(content, world.player.equipped), must(content.itemBases.get('hand_crossbow'), 'base').variants);
  assert.equal(resolveSkill(content, skillOf('cleave'), [], [], []).delivery.type, 'arc');
  const whirl: readonly string[] = ['heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave'];
  assert.equal(resolveSkill(content, skillOf('cleave'), whirl, [], wornVariants(content, world.player.equipped)).delivery.type, 'projectile');
});

function rangeOf(shot: SkillDef): number {
  return shot.delivery.type === 'projectile' ? shot.delivery.range : 0;
}

const CROSSBOW: readonly SkillVariant[] = must(content.itemBases.get('hand_crossbow'), 'hand_crossbow').variants;

void test('a tree node that changes Cleave also changes the shot a crossbow makes of it', (): void => {
  assert.deepEqual(variantChain(content, skillOf('cleave'), ['whirling_cleave'], [], CROSSBOW).through, ['cleave', 'quarrel', 'quarrel_fan']);
  const fan: SkillDef = resolveSkill(content, skillOf('cleave'), ['whirling_cleave'], [], CROSSBOW);
  assert.equal(fan.id, 'cleave');
  assert.equal(fan.name, skillOf('quarrel_fan').name);
  assert.equal(resolveSkill(content, skillOf('cleave'), ['whirling_cleave']).name, skillOf('cleave_whirl').name);
  const heave: SkillDef = resolveSkill(content, skillOf('cleave'), ['heaving_cleave'], [], CROSSBOW);
  assert.equal(heave.name, skillOf('quarrel_heave').name);
  assert.equal(heave.press?.type, 'charge');
  assert.equal(resolveSkill(content, skillOf('cleave'), [], [], CROSSBOW).name, skillOf('quarrel').name);
});

const MILLRACE: readonly string[] = ['whirling_cleave', 'endless_turn'];

void test('tree variants chain, so the Millwheel node turns the full turn Whirling Cleave made of Cleave into the Millwheel', (): void => {
  assert.deepEqual(variantChain(content, skillOf('cleave'), MILLRACE).through, ['cleave', 'cleave_whirl', 'cleave_millwheel']);
  const spun: SkillDef = resolveSkill(content, skillOf('cleave'), MILLRACE);
  assert.equal(spun.id, 'cleave');
  assert.equal(spun.name, skillOf('cleave_millwheel').name);
  assert.deepEqual(variantChain(content, skillOf('cleave'), ['endless_turn']).through, ['cleave']);
  assert.deepEqual(variantChain(content, skillOf('cleave'), MILLRACE, wornPowerDefs('the_millwheel')).through, ['cleave', 'cleave_millwheel']);
  assert.deepEqual(variantChain(content, skillOf('cleave'), MILLRACE, [], CROSSBOW).through, ['cleave', 'quarrel', 'quarrel_fan']);
});

void test('variants that lead back to a skill already passed stop instead of turning forever', (): void => {
  const loop: readonly SkillVariant[] = [{ skill: 'cleave_whirl', becomes: 'cleave' }];
  const power: PowerDef = { family: 'test', text: 'turns', skillMods: [], triggers: [], variants: [{ skill: 'cleave', becomes: 'cleave_whirl' }, ...loop] };
  assert.deepEqual(variantChain(content, skillOf('cleave'), [], [power]).through, ['cleave', 'cleave_whirl']);
});

void test('the Millstone widens the momentum cap and more than doubles the Millwheel leech, and the Long Wake stretches the grace', (): void => {
  const base = must(skillOf('cleave_millwheel').momentum, 'momentum');
  const stone = must(resolveSkill(content, skillOf('cleave'), [...MILLRACE, 'millstone']).momentum, 'momentum');
  assert.equal(stone.cap, base.cap * 1.5);
  const leech: number = skillOf('cleave_millwheel').leech;
  assert.ok(leech > 0);
  assert.ok(resolveSkill(content, skillOf('cleave'), [...MILLRACE, 'millstone']).leech > leech * 2);
  assert.equal(stone.grace, base.grace);
  const wake = must(resolveSkill(content, skillOf('cleave'), [...MILLRACE, 'long_wake']).momentum, 'momentum');
  assert.ok(Math.abs(wake.grace - base.grace * 1.6) < 1e-9);
  assert.equal(wake.cap, base.cap);
  assert.equal(resolveSkill(content, skillOf('cleave'), ['whirling_cleave', 'millstone']).momentum, null);
});

void test('bolt range from the Storm path reaches the crossbow shot, and a mod naming Cleave still reaches it', (): void => {
  const plain: SkillDef = resolveSkill(content, skillOf('cleave'), [], [], CROSSBOW);
  const reached: SkillDef = resolveSkill(content, skillOf('cleave'), ['storm_6'], [], CROSSBOW);
  assert.ok(rangeOf(plain) > 0);
  assert.ok(rangeOf(reached) > rangeOf(plain));
  const onCleave: SkillMod = { target: { type: 'skill', skill: 'cleave' }, field: 'damagePercent', value: 0.1 };
  assert.ok(modTargets(content, onCleave, ['cleave', 'quarrel']));
  assert.ok(!modTargets(content, onCleave, ['quarrel']));
});

void test('buff mods add on top of everything else', (): void => {
  const plain: StatBlock = computeStats(content, 1, bare, []);
  const quick: StatBlock = computeStats(content, 1, bare, [], [{ stat: 'attackSpeed', op: 'add', value: 0.12 }]);
  assert.ok(Math.abs(quick.attackSpeed - plain.attackSpeed - 0.12) < 1e-9);
  assert.equal(legendary('the_millwheel').rarity, 'stormtouched');
});

void test('when two held places change one skill the chosen change is active, and the one taken first when nothing is chosen', (): void => {
  const both: readonly string[] = ['twice_told_bolt', 'storm_lance'];
  assert.equal(resolveSkill(content, skillOf('storm_bolt'), both).name, skillOf('storm_bolt_echo').name);
  assert.equal(resolveSkill(content, skillOf('storm_bolt'), both.toReversed()).name, skillOf('storm_bolt_lance').name);
  for (const becomes of ['storm_bolt_echo', 'storm_bolt_lance']) assert.equal(resolveSkill(content, skillOf('storm_bolt'), both, [], [], ANY_WEAPON, { storm_bolt: becomes }).name, skillOf(becomes).name);
  assert.equal(resolveSkill(content, skillOf('storm_bolt'), ['twice_told_bolt'], [], [], ANY_WEAPON, { storm_bolt: 'storm_bolt_lance' }).name, skillOf('storm_bolt_echo').name);
});

void test('Echoes makes every main attack happen twice with a weaker echo, keeps an echo it already had, makes a held spin hit harder instead, and leaves other skills alone', (): void => {
  const echoes = must(content.skillTree.find((node): boolean => node.id === 'twice_swung'), 'twice_swung');
  const share: number = echoes.skillMods.find((mod: SkillMod): boolean => mod.field === 'echo')?.value ?? 0;
  assert.ok(share > 0 && share < 1);
  const route: readonly string[] = ['echo_forkline', 'first_echo', 'echo_1', 'echo_15', 'echo_4', 'twice_swung'];
  for (const id of ['cleave', 'quarrel', 'storm_bolt']) {
    const plain: SkillDef = resolveSkill(content, skillOf(id), []);
    const echoed: SkillDef = resolveSkill(content, skillOf(id), route);
    assert.equal(plain.echo, 0, id);
    assert.equal(echoed.echo, ADDED_ECHO.delay, id);
    assert.equal(echoed.echoShare, share, id);
    assert.deepEqual(echoed.damage, plain.damage, id);
    assert.ok(Math.abs(echoedSkill(echoed).damage.weaponPercent - plain.damage.weaponPercent * share) < 1e-9, id);
  }
  const spin: SkillDef = resolveSkill(content, skillOf('cleave'), [...route, 'heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave']);
  assert.equal(spin.delivery.type, 'nova');
  assert.equal(spin.echo, ADDED_ECHO.delay);
  const held: SkillDef = resolveSkill(content, skillOf('cleave'), [...route, 'heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave', 'endless_turn']);
  assert.ok(held.momentum !== null);
  assert.equal(held.echo, 0);
  const unheld: SkillDef = resolveSkill(content, skillOf('cleave'), ['heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave', 'endless_turn']);
  assert.ok(Math.abs(held.damage.weaponPercent - unheld.damage.weaponPercent * (1 + share * ADDED_ECHO.heldDamage)) < 1e-9);
  const told: SkillDef = resolveSkill(content, skillOf('storm_bolt'), [...route, 'storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4', 'twice_told_bolt']);
  assert.equal(told.echo, skillOf('storm_bolt_echo').echo);
  assert.equal(told.echoShare, 1);
  assert.equal(resolveSkill(content, skillOf('thunderclap'), route).echo, 0);
  assert.equal(resolveSkill(content, skillOf('dodge_roll'), route).echo, 0);
});

void test('area skill places leave Held Breath alone, and only its own places stretch it', (): void => {
  const areaPlaces: readonly string[] = ['echo_forkline', 'first_echo', 'echo_1', 'echo_15', 'echo_3', 'echo_7', 'echo_9', 'echo_13'];
  const base: SkillDef = skillOf('held_breath');
  assert.deepEqual(resolveSkill(content, base, areaPlaces).delivery, base.delivery);
  const own: SkillDef = resolveSkill(content, base, [...areaPlaces, 'between_heartbeats']);
  assert.ok(own.delivery.type === 'area' && base.delivery.type === 'area');
  assert.ok(own.delivery.duration > base.delivery.duration);
  assert.ok(own.delivery.radius > base.delivery.radius);
});

void test('a node allocated twice or a name the tree does not hold changes nothing in a resolved skill or its chain', (): void => {
  const noisy: readonly string[] = ['no_such_place', ...MILLRACE, ...MILLRACE];
  assert.deepEqual(variantChain(content, skillOf('cleave'), noisy).through, variantChain(content, skillOf('cleave'), MILLRACE).through);
  assert.deepEqual(resolveSkill(content, skillOf('cleave'), noisy), resolveSkill(content, skillOf('cleave'), MILLRACE));
  assert.deepEqual(computeStats(content, 3, emptyEquipment(), noisy), computeStats(content, 3, emptyEquipment(), MILLRACE));
});

void test('area widens a projectile as it widens every other shape, and a wave is drawn as wide as it now strikes', (): void => {
  const wave: SkillDef = must(content.skills.get('ghost_wave'), 'ghost wave');
  const wailing: SkillDef = resolveSkill(content, wave, ['wailing_wave'], [], [], 'crossbow');
  assert.ok(wave.delivery.type === 'projectile' && wailing.delivery.type === 'projectile');
  assert.ok(Math.abs(wailing.delivery.radius - wave.delivery.radius * 1.2) < 1e-9, `radius ${wailing.delivery.radius}`);
  const drawn = must(wave.vfx.wave, 'wave look');
  const widened = must(wailing.vfx.wave, 'widened wave look');
  assert.ok(Math.abs(widened.halfWidth - drawn.halfWidth * 1.2) < 1e-9);
  assert.equal(widened.depth, drawn.depth);
  const bolt: SkillDef = must(content.skills.get('storm_bolt'), 'storm bolt');
  const charged: SkillDef = resolveSkill(content, bolt, ['storm_3']);
  assert.ok(bolt.delivery.type === 'projectile' && charged.delivery.type === 'projectile');
  assert.ok(charged.delivery.radius > bolt.delivery.radius);
  assert.equal(charged.vfx, bolt.vfx);
});
