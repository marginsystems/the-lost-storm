import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, WearableDef } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { createRng } from './rng.ts';
import type { Look } from './wear.ts';
import { baseLayerOf, heldGear, heroBase, hiddenBodyParts, lookOf, wornWearables, zoneCharacterNeeds } from './wear.ts';
import { ITEM_SLOTS } from './content/types.ts';
import type { ItemSlot } from './content/types.ts';
import type { Equipment, ItemInstance } from './world/types.ts';

const content: Content = loadContent();

function item(base: string): ItemInstance {
  return must(generateItem(content, createRng(1), 1, 1, base, 'common'), base);
}

function regions(ids: readonly string[]): string[] {
  return ids.map((id: string): string => must(content.wearables.get(id), id).region);
}

const BASE_LAYER: readonly string[] = ['rag_trousers'];
const UNLAYERED: string = 'skeleton_hero';

function starter(): Equipment {
  const equipped: Equipment = emptyEquipment();
  for (const id of content.player.startingItems) {
    const made: ItemInstance = item(id);
    const slot = must(content.itemBases.get(id), id).slot;
    if (slot !== null) equipped[slot] = made;
  }
  return equipped;
}

void test('with nothing equipped the hero shows only the base layer of the body', (): void => {
  assert.deepEqual(lookOf(content, UNLAYERED, [], emptyEquipment()).wearables, []);
  assert.deepEqual(lookOf(content, UNLAYERED, [], null).wearables, []);
  assert.deepEqual(lookOf(content, UNLAYERED, BASE_LAYER, emptyEquipment()), { wearables: ['rag_trousers'], hidden: ['legs'], held: heldGear(content, emptyEquipment()) });
});

void test('the starting items dress the hero in the traveller clothes and the blade', (): void => {
  const look: Look = lookOf(content, UNLAYERED, BASE_LAYER, starter());
  assert.deepEqual([...look.wearables].toSorted(), ['traveller_boots', 'traveller_coat', 'traveller_trousers']);
  assert.deepEqual([...look.hidden].toSorted(), ['arms', 'feet', 'legs', 'torso']);
  assert.ok(look.held.includes(must(must(content.itemBases.get('rusted_blade'), 'blade').visual, 'blade visual')));
});

void test('taking off each slot in turn shows the base layer there and leaves the rest', (): void => {
  const dressed: Look = lookOf(content, UNLAYERED, BASE_LAYER, starter());
  for (const slot of ITEM_SLOTS) {
    const worn: ItemInstance | null = starter()[slot];
    if (worn === null) continue;
    const bare: Look = lookOf(content, UNLAYERED, BASE_LAYER, { ...starter(), [slot]: null });
    const removed: readonly string[] = must(content.itemBases.get(worn.base), slot).wear;
    for (const id of dressed.wearables) assert.equal(bare.wearables.includes(id), !removed.includes(id), `${slot} ${id}`);
    if (slot === 'legs') assert.ok(bare.wearables.includes('rag_trousers'));
  }
});

void test('every slot filled with a drop shows that drop, and everything removed shows the base layer', (): void => {
  const slots: readonly ItemSlot[] = ITEM_SLOTS;
  for (const slot of slots) {
    for (const base of content.itemBases.values()) {
      if (base.slot !== slot || base.wear.length === 0) continue;
      const look: Look = lookOf(content, UNLAYERED, BASE_LAYER, { ...emptyEquipment(), [slot]: item(base.id) });
      for (const id of base.wear) assert.ok(look.wearables.includes(id), `${slot} ${base.id}`);
    }
  }
  assert.deepEqual(lookOf(content, UNLAYERED, BASE_LAYER, emptyEquipment()).wearables, ['rag_trousers']);
});

void test('an equipped piece replaces the clothes on the same region and leaves the rest', (): void => {
  const equipped: Equipment = { ...emptyEquipment(), chest: item('drowned_leathers') };
  const worn: string[] = wornWearables(content, UNLAYERED, ['dirty_shirt', 'dirty_trousers'], equipped);
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
  const worn: string[] = wornWearables(content, UNLAYERED, BASE_LAYER, equipped);
  assert.deepEqual(worn.toSorted(), ['leather_boots', 'leather_bracers', 'leather_hood', 'leather_leggings', 'linen_shirt']);
  const bare: string[] = wornWearables(content, UNLAYERED, BASE_LAYER, { ...equipped, chest: null, legs: null });
  assert.ok(!bare.includes('linen_shirt') && bare.includes('rag_trousers'));
});

void test('unknown ids are ignored and a weapon wears nothing', (): void => {
  assert.deepEqual(wornWearables(content, UNLAYERED, ['no_such_piece'], null), []);
  assert.deepEqual(wornWearables(content, UNLAYERED, [], { ...emptyEquipment(), weapon: item('rusted_blade') }), []);
  const ghost: ItemInstance = { ...item('rusted_blade'), base: 'gone' };
  assert.deepEqual(wornWearables(content, UNLAYERED, [], { ...emptyEquipment(), chest: ghost }), []);
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
    const worn: string[] = wornWearables(content, monster.rig, monster.wear, null);
    for (const id of monster.wear) assert.ok(worn.includes(id), `${monster.id} ${id}`);
    assert.ok(worn.length > 0, monster.id);
  }
});

void test('a zone needs the hero, its people and its packs, dressed as they are, and nothing else', (): void => {
  for (const zone of content.zones.values()) {
    const needs = zoneCharacterNeeds(content, zone, emptyEquipment());
    assert.ok(needs.rigs.has(content.player.rig));
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
  for (const id of lookOf(content, UNLAYERED, [], equipped).wearables) assert.ok(needs.wearables.has(id));
});

void test('the hero holds his weapon, or his bare-handed gear without one', (): void => {
  assert.deepEqual(heldGear(content, null), content.player.unarmedVisual === null ? [...content.player.gear] : [...content.player.gear, content.player.unarmedVisual]);
  for (const base of content.itemBases.values()) {
    if (base.visual === null || base.slot !== 'weapon') continue;
    assert.ok(heldGear(content, { ...emptyEquipment(), weapon: item(base.id) }).includes(base.visual), base.id);
  }
});

void test('a zone with a moment field needs the bodies, clothes and gear of its echoes', (): void => {
  const base = must(content.zones.get(content.world.start), 'start zone');
  const def = must(content.moments.defs.get('watch_post'), 'watch_post');
  const zone = { ...base, moments: { combat: true, areas: [{ x: 8, z: 8, radius: 4 }], clearance: { hero: 1, exits: 1, between: 1, safe: 0, packs: 0 }, interval: { min: 5, max: 9 }, start: 0, max: 2, table: [{ moment: def.id, weight: 1 }], sure: [], first: [], grace: 0, avoid: [], near: null } };
  const needs = zoneCharacterNeeds(content, zone, null);
  for (const echo of def.echoes) {
    const look = must(echo.look, 'look');
    assert.ok(needs.rigs.has(look.rig), look.rig);
    for (const id of look.wear) assert.ok(needs.wearables.has(id), id);
    for (const id of look.gear) assert.ok(needs.attachments.has(id), id);
  }
});

void test('the hero body brings its own hair, and a hood worn on the head takes its place', (): void => {
  const base: readonly string[] = heroBase(content);
  assert.deepEqual(regions(base), ['head']);
  assert.ok(lookOf(content, content.player.rig, base, emptyEquipment()).wearables.includes('hair_short'));
  const hooded: readonly string[] = lookOf(content, content.player.rig, base, { ...emptyEquipment(), head: item('wayfarer_hood') }).wearables;
  assert.ok(hooded.includes('leather_hood') && !hooded.includes('hair_short'));
});

void test('with nothing equipped the hero wears his undertunic and braies, and each garment takes the place of the layer on its region', (): void => {
  const hero: string = content.player.rig;
  assert.deepEqual([...baseLayerOf(content, hero)], ['undertunic', 'braies']);
  const bare: Look = lookOf(content, hero, heroBase(content), emptyEquipment());
  assert.deepEqual([...bare.wearables].toSorted(), ['braies', 'hair_short', 'undertunic']);
  const dressed: Look = lookOf(content, hero, heroBase(content), starter());
  assert.ok(!dressed.wearables.includes('undertunic') && !dressed.wearables.includes('braies'));
  const coatOnly: Look = lookOf(content, hero, heroBase(content), { ...starter(), legs: null });
  assert.ok(coatOnly.wearables.includes('braies') && !coatOnly.wearables.includes('undertunic'));
  const trousersOnly: Look = lookOf(content, hero, heroBase(content), { ...starter(), chest: null });
  assert.ok(trousersOnly.wearables.includes('undertunic') && !trousersOnly.wearables.includes('braies'));
});

void test('every human body has a base layer for its chest and legs, and a body with none wears nothing extra', (): void => {
  for (const rig of content.rigs.values()) {
    if (!rig.url.includes('human_')) continue;
    assert.deepEqual(regions(baseLayerOf(content, rig.id)).toSorted(), ['chest', 'legs'], rig.id);
  }
  assert.deepEqual(baseLayerOf(content, UNLAYERED), []);
  assert.deepEqual(baseLayerOf(content, 'no_such_rig'), []);
});

void test('the base layer is never an item, so it cannot be put in the bag, sold or dropped', (): void => {
  const layered: ReadonlySet<string> = new Set<string>([...content.baseLayers.values()].flat());
  for (const base of content.itemBases.values()) for (const id of base.wear) assert.ok(!layered.has(id), `${base.id} wears ${id}`);
});
