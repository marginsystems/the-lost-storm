import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, WearableDef } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { heldGear, hiddenBodyParts, wornWearables, zoneCharacterNeeds } from './wear.ts';
import type { Equipment, ItemInstance } from './world/types.ts';

const content: Content = loadContent();

function item(base: string): ItemInstance {
  return must(generateItem(content, createRng(1), 1, 1, base, 'common'), base);
}

function regions(ids: readonly string[]): string[] {
  return ids.map((id: string): string => must(content.wearables.get(id), id).region);
}

void test('with nothing equipped a character shows its own clothes', (): void => {
  assert.deepEqual(wornWearables(content, content.player.wear, emptyEquipment()), [...content.player.wear]);
  assert.deepEqual(wornWearables(content, content.player.wear, null), [...content.player.wear]);
  assert.deepEqual(wornWearables(content, [], null), []);
});

void test('an equipped piece replaces the clothes on the same region and leaves the rest', (): void => {
  const equipped: Equipment = { ...emptyEquipment(), chest: item('drowned_leathers') };
  const worn: string[] = wornWearables(content, ['dirty_shirt', 'dirty_trousers'], equipped);
  assert.deepEqual(worn.toSorted(), ['dirty_trousers', 'leather_vest']);
  const covered: string[] = regions(worn);
  assert.equal(new Set<string>(covered).size, covered.length);
});

void test('every slot can dress its own region and unequipping brings the clothes back', (): void => {
  const equipped: Equipment = {
    ...emptyEquipment(),
    head: item('wayfarer_hood'),
    chest: item('saltworn_shirt'),
    hands: item('strapped_bracers'),
    legs: item('stalker_leggings'),
    feet: item('strider_boots'),
  };
  const worn: string[] = wornWearables(content, content.player.wear, equipped);
  assert.deepEqual(worn.toSorted(), ['leather_boots', 'leather_bracers', 'leather_hood', 'leather_leggings', 'linen_shirt']);
  const bare: string[] = wornWearables(content, content.player.wear, { ...equipped, chest: null, legs: null });
  assert.ok(bare.includes('traveller_coat') && bare.includes('traveller_trousers'));
});

void test('unknown ids are ignored and a weapon wears nothing', (): void => {
  assert.deepEqual(wornWearables(content, ['no_such_piece'], null), []);
  assert.deepEqual(wornWearables(content, [], { ...emptyEquipment(), weapon: item('rusted_blade') }), []);
  const ghost: ItemInstance = { ...item('rusted_blade'), base: 'gone' };
  assert.deepEqual(wornWearables(content, [], { ...emptyEquipment(), chest: ghost }), []);
});

void test('worn pieces name the body parts they hide, each once', (): void => {
  assert.deepEqual(hiddenBodyParts(content, ['leather_hood']), []);
  assert.deepEqual(hiddenBodyParts(content, ['worn_boots', 'leather_boots']), ['feet']);
  assert.deepEqual(hiddenBodyParts(content, ['worn_boots', 'leather_boots', 'leather_vest']).toSorted(), ['arms', 'feet', 'torso']);
  const boots: WearableDef = must(content.wearables.get('leather_boots'), 'leather_boots');
  assert.deepEqual(boots.hides, ['feet']);
});

void test('monsters are dressed from the same pool', (): void => {
  for (const monster of content.monsters.values()) {
    const worn: string[] = wornWearables(content, monster.wear, null);
    assert.deepEqual(worn, [...monster.wear], monster.id);
    assert.ok(worn.length > 0, monster.id);
  }
});

void test('a zone needs the hero, its people and its packs, dressed as they are, and nothing else', (): void => {
  for (const zone of content.zones.values()) {
    const needs = zoneCharacterNeeds(content, zone, emptyEquipment());
    assert.ok(needs.rigs.has(content.player.rig));
    for (const id of content.player.wear) assert.ok(needs.wearables.has(id), zone.id);
    for (const placed of zone.npcs) {
      const npc = must(content.npcs.get(placed.npc), placed.npc);
      assert.ok(needs.rigs.has(npc.rig), zone.id);
      for (const id of npc.wear) assert.ok(needs.wearables.has(id), `${zone.id} ${id}`);
    }
    for (const member of zone.packs.flatMap((pack) => pack.members)) {
      const monster = must(content.monsters.get(member.monster), member.monster);
      assert.ok(needs.rigs.has(monster.rig), zone.id);
      for (const id of monster.gear) assert.ok(needs.attachments.has(id), `${zone.id} ${id}`);
    }
    for (const placed of zone.npcs) for (const id of must(content.npcs.get(placed.npc), placed.npc).gear) assert.ok(needs.attachments.has(id), `${zone.id} ${id}`);
    for (const id of heldGear(content, emptyEquipment())) assert.ok(needs.attachments.has(id), zone.id);
  }
  const town = [...content.zones.values()].find((zone) => zone.packs.length === 0);
  if (town !== undefined) assert.ok(zoneCharacterNeeds(content, town, null).wearables.size < content.wearables.size);
});

void test('the equipped pieces are needed too', (): void => {
  const zone = must(content.zones.values().next().value, 'a zone');
  const equipped: Equipment = { ...emptyEquipment(), chest: item('drowned_leathers') };
  const needs = zoneCharacterNeeds(content, zone, equipped);
  for (const id of wornWearables(content, content.player.wear, equipped)) assert.ok(needs.wearables.has(id));
});

void test('the hero holds his weapon, or his bare-handed gear without one', (): void => {
  assert.deepEqual(heldGear(content, null), content.player.unarmedVisual === null ? [...content.player.gear] : [...content.player.gear, content.player.unarmedVisual]);
  for (const base of content.itemBases.values()) {
    if (base.visual === null || base.slot !== 'weapon') continue;
    assert.ok(heldGear(content, { ...emptyEquipment(), weapon: item(base.id) }).includes(base.visual), base.id);
  }
});
