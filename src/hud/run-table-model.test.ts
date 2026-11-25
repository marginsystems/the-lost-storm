import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import { choosePick, chooseLevel, dangerText, firstPick, rewardText, shapedLine, tableView, togglePin } from './run-table-model.ts';
import type { ConditionRow, TablePick, TableView } from './run-table-model.ts';

const content: Content = loadContent();

function table(gold: number, reached: readonly string[] = ['under_hall', 'under_hall_2'], from: Content = content): World {
  const world: World = worldIn(from, from.world.town, 3);
  world.waypoints.push(...reached);
  world.player.gold = gold;
  world.service = { kind: 'descent', owner: 'descent_table', anchor: { x: 0, z: 0 } };
  return world;
}

function row(view: TableView, id: string): ConditionRow {
  return must(view.conditions.find((entry: ConditionRow): boolean => entry.id === id), id);
}

void test('the table opens on the deepest level reached with nothing pinned', (): void => {
  const world: World = table(1000);
  const pick: TablePick = firstPick(world);
  assert.equal(pick.zone, 'under_hall_2');
  assert.deepEqual(pick.pins, []);
  const view: TableView = tableView(world, pick);
  assert.deepEqual(view.levels.map((level): string => level.id), ['under_hall', 'under_hall_2']);
  assert.equal(view.levels.find((level): boolean => level.chosen)?.id, 'under_hall_2');
  assert.equal(view.price, 0);
  assert.equal(view.setOut.note, 'No conditions: an ordinary descent');
  assert.notEqual(view.setOut.command, null);
  assert.equal(view.again.command, null);
});

void test('with no level reached there is nothing to set out to', (): void => {
  const world: World = table(1000, []);
  const view: TableView = tableView(world, firstPick(world));
  assert.equal(view.levels.length, 0);
  assert.equal(view.setOut.command, null);
  assert.equal(view.setOut.note, 'No level to set out to yet');
});

void test('three pins at most, each priced, with the totals and a set out command', (): void => {
  const world: World = table(100000);
  let pick: TablePick = { zone: 'under_hall', pins: [] };
  for (const id of ['marked', 'crowded', 'volatile']) pick = togglePin(world, pick, id);
  assert.equal(togglePin(world, pick, 'swift'), pick);
  const view: TableView = tableView(world, pick);
  assert.equal(view.pinsLeft, 0);
  assert.equal(row(view, 'swift').open, false);
  assert.equal(row(view, 'marked').pinned, true);
  const sum: number = ['marked', 'crowded', 'volatile'].reduce((total: number, id: string): number => total + row(view, id).price, 0);
  assert.equal(view.price, sum);
  assert.match(view.reward, /experience/);
  assert.match(view.danger, /^Danger \+\d+%$/);
  assert.equal(view.setOut.label, `Set out · ${view.price} gold`);
  assert.deepEqual(view.setOut.command, { type: 'set_out', setup: { zone: 'under_hall', pins: pick.pins } });
  const unpinned: TablePick = togglePin(world, pick, 'crowded');
  assert.equal(unpinned.pins.length, 2);
});

void test('not enough gold keeps the button but sends nothing and says why', (): void => {
  const world: World = table(5);
  const pick: TablePick = togglePin(world, { zone: 'under_hall', pins: [] }, 'marked');
  const view: TableView = tableView(world, pick);
  assert.equal(view.setOut.command, null);
  assert.equal(view.setOut.short, true);
  assert.equal(view.setOut.note, `${view.price - 5} gold short`);
});

void test('one kind asks for a kind the level holds, and a level change drops a kind it does not hold', (): void => {
  const world: World = table(100000);
  let pick: TablePick = togglePin(world, { zone: 'under_hall', pins: [] }, 'one_kind');
  const kinds = row(tableView(world, pick), 'one_kind').kinds;
  assert.ok(kinds.length > 1);
  assert.equal(kinds.filter((chip): boolean => chip.chosen).length, 1);
  const second: string = must(kinds[1], 'second kind').id;
  pick = choosePick(pick, 'one_kind', second);
  assert.equal(row(tableView(world, pick), 'one_kind').kinds.find((chip): boolean => chip.chosen)?.id, second);
  const moved: TablePick = chooseLevel(world, pick, 'under_hall_2');
  const held: boolean = row(tableView(world, moved), 'one_kind').kinds.some((chip): boolean => chip.id === second);
  assert.equal(moved.pins[0]?.pick, held ? second : null);
  assert.equal(chooseLevel(world, pick, 'lava_depths'), pick);
});

void test('one family offers the families the level holds, and none where the level holds none', (): void => {
  const world: World = table(100000, ['under_hall', 'lava_depths']);
  const pick: TablePick = togglePin(world, { zone: 'under_hall', pins: [] }, 'one_family');
  const chips = row(tableView(world, pick), 'one_family').kinds;
  assert.deepEqual(chips.map((chip): string => chip.name), ['Many legs', 'Fur and fang', 'Rot and ooze', 'Echoes', 'The risen', 'Scales and stings']);
  assert.equal(chips.find((chip): boolean => chip.chosen)?.id, 'many_legs');
  assert.equal(row(tableView(world, pick), 'one_kind').open, false);
  const lavaPick: TablePick = togglePin(world, { zone: 'lava_depths', pins: [] }, 'one_family');
  const lavaFamily: ConditionRow = row(tableView(world, lavaPick), 'one_family');
  assert.equal(lavaFamily.open, true);
  assert.deepEqual(lavaFamily.kinds.map((chip): string => chip.name), ['Imps and embers']);
  const bare: TableView = tableView(table(100000, ['lava_depths'], { ...content, runTable: { ...content.runTable, families: [] } }), { zone: 'lava_depths', pins: [] });
  assert.equal(row(bare, 'one_family').open, false);
  assert.equal(row(bare, 'one_family').danger, 'Nothing to pick on this level');
  const unpicked: TableView = tableView(world, { zone: 'under_hall', pins: [{ condition: 'one_family', pick: null }] });
  assert.equal(unpicked.setOut.command, null);
  assert.equal(unpicked.setOut.note, 'Pick one for One family');
  world.run.active = { zone: 'under_hall', pins: [{ condition: 'one_family', pick: 'many_legs' }] };
  assert.equal(shapedLine(world, 'under_hall'), 'Shaped · One family: Many legs');
});

void test('a pin that only rolls deeper is closed on a shallower level and dropped on moving there', (): void => {
  const world: World = table(100000);
  const shallow: TableView = tableView(world, { zone: 'under_hall', pins: [] });
  assert.equal(row(shallow, 'stormlit').open, false);
  assert.equal(row(shallow, 'stormlit').danger, 'From level 14');
  assert.deepEqual(togglePin(world, { zone: 'under_hall', pins: [] }, 'stormlit'), { zone: 'under_hall', pins: [] });
  const deep: TablePick = togglePin(world, { zone: 'under_hall_2', pins: [] }, 'stormlit');
  assert.equal(deep.pins.length, 1);
  assert.equal(row(tableView(world, deep), 'rimebound').danger, 'Cannot be pinned with Stormlit packs');
  assert.deepEqual(chooseLevel(world, deep, 'under_hall').pins, []);
});

void test('a condition that clashes with a pinned one is closed, says why, and cannot be pinned', (): void => {
  const world: World = table(100000);
  const pick: TablePick = togglePin(world, firstPick(world), 'crowded');
  assert.equal(togglePin(world, pick, 'hardened'), pick);
  const view: TableView = tableView(world, pick);
  assert.equal(row(view, 'hardened').open, false);
  assert.equal(row(view, 'hardened').danger, 'Cannot be pinned with Crowded');
  assert.equal(row(view, 'swift').open, true);
  assert.equal(tableView(world, togglePin(world, pick, 'crowded')).conditions.find((entry: ConditionRow): boolean => entry.id === 'hardened')?.open, true);
});

void test('again repeats the last setup for its price', (): void => {
  const world: World = table(100000);
  const setup = { zone: 'under_hall', pins: [{ condition: 'swift', pick: null }] };
  world.run.last = setup;
  const view: TableView = tableView(world, firstPick(world));
  assert.deepEqual(firstPick(world), { zone: 'under_hall', pins: setup.pins });
  assert.deepEqual(view.again.command, { type: 'set_out', setup });
  assert.match(view.again.label, /^Again · \d+ gold$/);
  assert.equal(view.again.note, 'Hourfall Caves: Swift packs');
});

void test('the words for rewards, danger and the in-level line', (): void => {
  assert.equal(rewardText({ xp: 0.2, gold: 0.2, items: 0.2, rarity: 0.08 }), '+20% experience, gold and items, 8% of drops at least magic');
  assert.equal(rewardText({ xp: 0.1, gold: 0.2, items: 0, rarity: 0 }), '+10% experience, +20% gold, +0% items');
  assert.equal(dangerText(0), 'No added danger');
  assert.equal(dangerText(0.35), 'Danger +35%');
  const world: World = table(0);
  assert.equal(shapedLine(world, 'under_hall'), null);
  world.run.active = { zone: 'under_hall', pins: [{ condition: 'marked', pick: null }, { condition: 'one_kind', pick: must(content.monsters.get('cave_crawler') ?? [...content.monsters.values()][0], 'monster').id }] };
  assert.match(shapedLine(world, 'under_hall') ?? '', /^Shaped · Marked packs · One kind: /);
  assert.equal(shapedLine(world, 'under_hall_2'), null);
});
