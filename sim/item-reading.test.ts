import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, ZoneDef } from './content/types.ts';
import { readItem, itemVerdict, readingLines, toughness, verdictParts, zoneDamageMix } from './item-reading.ts';
import type { ItemReading, ReadingLine, ReadingRow, ReadingSubject } from './item-reading.ts';
import { emptyEquipment } from './items.ts';
import { computeStats } from './stats.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();
const zone: ZoneDef = must([...content.zones.values()][0], 'zone');

function item(base: string, rarity: string, affixes: ItemInstance['affixes'], level: number = 1): ItemInstance {
  return { uid: 1, base, rarity, level, affixes };
}

function texts(rows: readonly ReadingRow[]): string[] {
  return rows.map((entry: ReadingRow): string => `${entry.text}${entry.deltaText === null ? '' : ` (${entry.deltaText})`}`);
}

void test('a weapon leads with its damage range and the change in average hit, then every line in the fixed order', (): void => {
  const sword: ItemInstance = item('stormsteel_sword', 'rare', [{ affix: 'brimming', value: 8 }, { affix: 'keen', value: 0.03 }, { affix: 'honed', value: 0.07 }]);
  const blade: ItemInstance = item('rusted_blade', 'magic', [{ affix: 'keen', value: 0.02 }]);
  const reading: ItemReading = readItem(content, sword, blade);
  assert.deepEqual(reading.headline, { kind: 'damage', min: 5, max: 9, delta: 2.5 });
  assert.deepEqual(texts(reading.rows), ['+7% Damage (+7%)', '+10% Attack Speed (+10%)', '+6% Critical Strike Chance (+4%)', '+8 Maximum Mana (+8)']);
  assert.deepEqual(texts(reading.lost), ['Movement Speed (−3%)']);
});

void test('armour leads an armour piece, a charm leads with its first line, and with nothing equipped no change is shown', (): void => {
  const shirt: ItemInstance = item('saltworn_shirt', 'magic', [{ affix: 'grounded', value: 0.08 }]);
  const reading: ItemReading = readItem(content, shirt, null);
  assert.equal(reading.headline.kind === 'stat' ? reading.headline.row.stat : null, 'armour');
  assert.ok(reading.rows.every((entry: ReadingRow): boolean => entry.delta === null && entry.stat !== 'armour'));
  const charm: ReadingRow | null = (() => {
    const read: ItemReading = readItem(content, item('ember_charm', 'common', []), null);
    return read.headline.kind === 'stat' ? read.headline.row : null;
  })();
  assert.equal(charm?.stat, 'critChance');
});

void test('a zone with storm monsters weighs storm resistance into toughness', (): void => {
  const storm: ZoneDef = { ...zone, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'stormcaller_rival', count: 3, mods: [] }] }] };
  const rivalSkill: string = must(content.monsters.get('stormcaller_rival'), 'rival').skill;
  const mix = zoneDamageMix(content, storm);
  assert.equal(mix[must(content.skills.get(rivalSkill), 'skill').damage.type], 1);
  assert.deepEqual(zoneDamageMix(content, { ...zone, packs: [] }), { physical: 1, storm: 0, frost: 0 });
  const stats = computeStats(content, 1, emptyEquipment(), []);
  const frost: ZoneDef = { ...zone, packs: [{ x: 0, z: 0, when: [], members: [{ monster: 'still_standing', count: 2, mods: [] }] }] };
  assert.ok(toughness(content, { ...stats, frostResist: 0.5 }, frost) > toughness(content, stats, frost) * 1.9);
});

void test('the verdict is better, worse, a trade or the same from damage per second and toughness', (): void => {
  const skills = [must(content.skills.get('cleave'), 'cleave')];
  const subject: ReadingSubject = { level: 5, equipped: { ...emptyEquipment(), weapon: item('stormsteel_sword', 'common', []) }, allocated: [], skills };
  assert.equal(itemVerdict(content, subject, zone, item('tempest_greatsword', 'common', []))?.kind, 'better');
  assert.equal(itemVerdict(content, subject, zone, item('rusted_blade', 'common', []))?.kind, 'worse');
  assert.equal(itemVerdict(content, subject, zone, item('stormsteel_sword', 'common', []))?.kind, 'same');
  const heavy: ReadingSubject = { ...subject, equipped: { ...subject.equipped, chest: item('squall_plate', 'common', []) } };
  const verdict = itemVerdict(content, heavy, zone, item('saltworn_shirt', 'magic', [{ affix: 'hale', value: 1 }]));
  assert.equal(verdict?.kind, 'worse');
  assert.equal(itemVerdict(content, subject, zone, item('ghost', 'common', [])), null);
});

void test('a line that cancels the base out to nothing is left off instead of reading as +0%', (): void => {
  const slow: number = must(must(content.itemBases.get('ringmail_hauberk'), 'hauberk').implicit.find((mod) => mod.stat === 'moveSpeed'), 'mail slow').value;
  const hauberk: ItemInstance = item('ringmail_hauberk', 'rare', [{ affix: 'fleet', value: -slow }, { affix: 'hale', value: 20 }]);
  const reading: ItemReading = readItem(content, hauberk, null);
  assert.ok(!reading.rows.some((entry: ReadingRow): boolean => entry.stat === 'moveSpeed'));
  assert.ok(reading.rows.some((entry: ReadingRow): boolean => entry.stat === 'maxLife'));
});

void test('a lost line sits in its own place in the fixed order, not at the end', (): void => {
  const sword: ItemInstance = item('stormsteel_sword', 'rare', [{ affix: 'brimming', value: 8 }, { affix: 'quick', value: 0.1 }]);
  const blade: ItemInstance = item('rusted_blade', 'magic', []);
  const lines: readonly ReadingLine[] = readingLines(readItem(content, sword, blade));
  assert.deepEqual(
    lines.map((line: ReadingLine): string => `${line.lost ? 'lost ' : ''}${line.row.stat}`),
    ['attackSpeed', 'critChance', 'lost moveSpeed', 'maxMana'],
  );
});

void test('the verdict names only the sides that change, with a true minus', (): void => {
  assert.deepEqual(verdictParts({ kind: 'better', damage: 1.22, toughness: 0.001 }), ['+122% damage']);
  assert.deepEqual(verdictParts({ kind: 'trade', damage: -0.35, toughness: 0.4 }), ['−35% damage', '+40% toughness']);
  assert.deepEqual(verdictParts({ kind: 'same', damage: 0, toughness: 0 }), []);
});
