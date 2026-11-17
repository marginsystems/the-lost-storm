import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { RunCondition } from '../content/run-table-types.ts';
import type { Content, MonsterDef, ZoneDef } from '../content/types.ts';
import type { Fields } from '../content/read.ts';
import { isFields } from '../content/read.ts';
import { readSave, toSave } from '../save.ts';
import type { SaveData } from '../save.ts';
import { kill } from './combat.ts';
import { createWorld } from './create.ts';
import { respawnPlayer } from './death.ts';
import { clearValue, levelKinds, pinPrices, reachedLevels, runPrice, setOut, setupProblem } from './run-table.ts';
import type { RunPin, RunSetup } from './run-types.ts';
import { dangerOf, rewardOf, runReward } from './run-state.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';
import { goThrough, openPortal, portalEndHere } from './portal.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const CAVE: string = 'under_hall';
const DEEPER: string = 'under_hall_2';

function pin(condition: string, pick: string | null = null): RunPin {
  return { condition, pick };
}

function atTable(gold: number, seed: number = 4): World {
  const world: World = worldIn(content, content.world.town, seed);
  world.waypoints.push(CAVE, DEEPER);
  world.visited.push(CAVE, DEEPER);
  world.player.gold = gold;
  world.service = { kind: 'descent', owner: 'descent_table', anchor: { x: 0, z: 0 } };
  return world;
}

function kindOf(zone: string): string {
  return must(levelKinds(content, zoneOf(content, zone))[0], 'a kind').id;
}

function living(world: World): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive);
}

function ofType(events: readonly WorldEvent[], type: WorldEvent['type']): WorldEvent[] {
  return events.filter((event: WorldEvent): boolean => event.type === type);
}

void test('the run table data names real levels, modifiers and picks', (): void => {
  assert.ok(content.runTable.conditions.length >= 5);
  for (const id of content.runTable.levels) assert.ok(content.zones.has(id), id);
  assert.ok(!content.runTable.levels.includes('ledger_court'));
});

void test('only levels whose waypoint the character holds can be shaped', (): void => {
  const world: World = worldIn(content, content.world.town, 1);
  assert.deepEqual(reachedLevels(world), []);
  world.waypoints.push(DEEPER, 'hall_of_time');
  assert.deepEqual(reachedLevels(world).map((zone: ZoneDef): string => zone.id), [DEEPER]);
});

void test('the kinds a level offers are told apart by name, so no two picks read the same', (): void => {
  for (const level of content.runTable.levels) {
    const names: string[] = levelKinds(content, zoneOf(content, level)).map((kind: MonsterDef): string => kind.name);
    assert.equal(new Set<string>(names).size, names.length, level);
  }
});

void test('one pin costs about a tenth of what a clear of the level is worth, and later pins cost more', (): void => {
  const zone: ZoneDef = zoneOf(content, CAVE);
  const value: number = clearValue(content, zone);
  const [one] = pinPrices(content, zone, [pin('marked')]);
  assert.ok(Math.abs(must(one, 'price') - value * 0.1) <= content.runTable.pricing.round, `${one} against ${value}`);
  const three: number[] = pinPrices(content, zone, [pin('marked'), pin('crowded'), pin('swift')]);
  assert.ok(must(three[1], 'second') > must(three[0], 'first'));
  assert.ok(must(three[2], 'third') > must(three[1], 'second'));
  assert.equal(runPrice(content, zone, [pin('swift'), pin('crowded'), pin('marked')]), runPrice(content, zone, [pin('marked'), pin('crowded'), pin('swift')]));
  assert.ok(runPrice(content, zoneOf(content, DEEPER), [pin('marked')]) > must(one, 'cave price'));
});

void test('rewards and danger add up over the pins instead of multiplying', (): void => {
  const marked: RunCondition = must(content.runTable.conditions.find((entry: RunCondition): boolean => entry.id === 'marked'), 'marked');
  const hardened: RunCondition = must(content.runTable.conditions.find((entry: RunCondition): boolean => entry.id === 'hardened'), 'hardened');
  const both = rewardOf(content, [pin('marked'), pin('hardened')]);
  assert.ok(Math.abs(both.xp - (marked.reward.xp + hardened.reward.xp)) < 1e-9);
  assert.ok(Math.abs(both.gold - (marked.reward.gold + hardened.reward.gold)) < 1e-9);
  assert.ok(Math.abs(dangerOf(content, [pin('marked'), pin('hardened')]) - (marked.danger + hardened.danger)) < 1e-9);
});

void test('setting out charges the price, travels to the level and holds the setup', (): void => {
  const world: World = atTable(5000);
  const setup: RunSetup = { zone: CAVE, pins: [pin('marked'), pin('one_kind', kindOf(CAVE))] };
  const price: number = runPrice(content, zoneOf(content, CAVE), setup.pins);
  setOut(world, setup);
  assert.equal(world.zone.id, CAVE);
  assert.equal(world.player.gold, 5000 - price);
  assert.deepEqual(world.run.active, setup);
  assert.deepEqual(world.run.last, setup);
  assert.equal(world.service, null);
  assert.ok(ofType(world.events, 'run_set').length === 1);
  const kind: string = kindOf(CAVE);
  assert.ok(world.monsters.length > 0);
  for (const monster of world.monsters) if (monster.def.boss === null) assert.ok(monster.def.id === kind || monster.def.rank !== null, monster.def.id);
});

void test('a setup it cannot pay for, or that breaks the rules, changes nothing', (): void => {
  const poor: World = atTable(10);
  const setup: RunSetup = { zone: CAVE, pins: [pin('marked'), pin('crowded'), pin('swift')] };
  assert.equal(setupProblem(poor, setup), 'gold');
  setOut(poor, setup);
  assert.equal(poor.zone.id, content.world.town);
  assert.equal(poor.player.gold, 10);
  assert.equal(poor.run.active, null);
  assert.ok(poor.events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'no_gold'));
  const rich: World = atTable(100000);
  assert.equal(setupProblem(rich, { zone: CAVE, pins: [pin('marked'), pin('marked')] }), 'pins');
  assert.equal(setupProblem(rich, { zone: CAVE, pins: [pin('crowded'), pin('hardened')] }), 'pins');
  assert.equal(setupProblem(rich, { zone: CAVE, pins: [pin('hardened'), pin('swift'), pin('crowded')] }), 'pins');
  assert.equal(setupProblem(rich, { zone: CAVE, pins: [pin('marked'), pin('crowded'), pin('swift'), pin('hulking')] }), 'pins');
  assert.equal(setupProblem(rich, { zone: CAVE, pins: [pin('one_kind', null)] }), 'pick');
  assert.equal(setupProblem(rich, { zone: CAVE, pins: [pin('one_kind', 'timekeeper_gatekeeper')] }), 'pick');
  assert.equal(setupProblem(rich, { zone: CAVE, pins: [pin('marked', kindOf(CAVE))] }), 'pick');
  assert.equal(setupProblem(rich, { zone: 'lava_depths', pins: [] }), 'level');
  rich.service = null;
  assert.equal(setupProblem(rich, { zone: CAVE, pins: [] }), 'away');
});

void test('each condition changes what the packs are, not where they stand', (): void => {
  const seed: number = 11;
  const plain: World = atTable(100000, seed);
  setOut(plain, { zone: CAVE, pins: [] });
  const homes: string[] = plain.zone.packs.map((pack): string => `${pack.x},${pack.z}`);
  const crowded: World = atTable(100000, seed);
  setOut(crowded, { zone: CAVE, pins: [pin('crowded')] });
  assert.deepEqual(crowded.zone.packs.map((pack): string => `${pack.x},${pack.z}`), homes);
  assert.ok(crowded.monsters.length > plain.monsters.length * 1.25, `${crowded.monsters.length} against ${plain.monsters.length}`);
  const swift: World = atTable(100000, seed);
  setOut(swift, { zone: CAVE, pins: [pin('swift')] });
  for (const monster of swift.monsters) if (monster.def.boss === null) assert.ok(monster.def.mods.includes('swift'));
  const hard: World = atTable(100000, seed);
  setOut(hard, { zone: CAVE, pins: [pin('hardened')] });
  const plainLife: number = plain.monsters.reduce((sum: number, monster: MonsterState): number => sum + monster.maxLife, 0) / plain.monsters.length;
  const hardLife: number = hard.monsters.reduce((sum: number, monster: MonsterState): number => sum + monster.maxLife, 0) / hard.monsters.length;
  assert.ok(hardLife > plainLife * 1.2);
});

function aboveNormal(monster: MonsterState): boolean {
  const plain: string | undefined = content.packRanks.ranks[0]?.id;
  return monster.def.rank !== null && monster.def.rank.id !== plain;
}

void test('marked packs are ranked far more often', (): void => {
  let plain: number = 0;
  let marked: number = 0;
  for (let seed: number = 1; seed <= 4; seed += 1) {
    const one: World = atTable(100000, seed);
    setOut(one, { zone: CAVE, pins: [] });
    plain += one.monsters.filter(aboveNormal).length;
    const two: World = atTable(100000, seed);
    setOut(two, { zone: CAVE, pins: [pin('marked')] });
    marked += two.monsters.filter(aboveNormal).length;
  }
  assert.ok(marked > plain * 1.5, `${marked} against ${plain}`);
});

void test('the same seed and setup make the same level', (): void => {
  const setup: RunSetup = { zone: CAVE, pins: [pin('crowded'), pin('marked'), pin('volatile')] };
  const one: World = atTable(100000, 9);
  const two: World = atTable(100000, 9);
  setOut(one, setup);
  setOut(two, setup);
  assert.deepEqual(one.monsters.map((monster: MonsterState): string => `${monster.def.name}@${monster.pos.x.toFixed(3)}`), two.monsters.map((monster: MonsterState): string => `${monster.def.name}@${monster.pos.x.toFixed(3)}`));
});

void test('kills in a shaped run pay more experience', (): void => {
  const plain: World = atTable(100000, 5);
  setOut(plain, { zone: CAVE, pins: [] });
  const shaped: World = atTable(100000, 5);
  setOut(shaped, { zone: CAVE, pins: [pin('mending')] });
  const def: MonsterDef = must(content.monsters.get(kindOf(CAVE)), 'kind');
  const before: number = runReward(shaped).xp;
  assert.ok(before > 0);
  assert.equal(runReward(plain).xp, 0);
  const victim = (world: World): MonsterState => must(living(world).find((monster: MonsterState): boolean => monster.def.rank === null && monster.def.id === def.id), 'victim');
  const gainOf = (world: World): number => {
    const xp: number = world.player.xp;
    const level: number = world.player.level;
    world.player.level = 1;
    kill(world, victim(world), { x: 1, z: 0 });
    const gained: number = world.player.xp - xp;
    world.player.level = level;
    return gained;
  };
  assert.ok(gainOf(shaped) > gainOf(plain));
});

void test('a run lasts through death and the thread home, and ends on walking out or on a clear', (): void => {
  const world: World = atTable(100000, 6);
  setOut(world, { zone: CAVE, pins: [pin('swift')] });
  world.player.alive = false;
  world.death = { killer: 'x', skill: 'y', elapsed: 99, xpLost: 0 };
  respawnPlayer(world, 'checkpoint');
  assert.equal(world.player.alive, true);
  assert.equal(world.zone.id, CAVE);
  assert.notEqual(world.run.active, null);
  openPortal(world, 2);
  goThrough(world, must(portalEndHere(world), 'thread end'));
  assert.equal(world.zone.id, content.world.town);
  assert.notEqual(world.run.active, null);
  goThrough(world, must(portalEndHere(world), 'home end'));
  assert.equal(world.zone.id, CAVE);
  assert.notEqual(world.run.active, null);
  world.player.alive = false;
  world.death = { killer: 'x', skill: 'y', elapsed: 99, xpLost: 0 };
  respawnPlayer(world, 'town');
  assert.equal(world.zone.id, content.world.town);
  assert.notEqual(world.run.active, null);
  enterZone(world, zoneOf(content, CAVE), { type: 'waypoint' });
  assert.notEqual(world.run.active, null);
  const walker: World = atTable(100000, 6);
  setOut(walker, { zone: CAVE, pins: [pin('swift')] });
  openPortal(walker, 2);
  enterZone(walker, zoneOf(content, content.world.town), { type: 'start' });
  assert.equal(walker.run.active, null);
  world.events = [];
  enterZone(world, zoneOf(content, DEEPER), { type: 'waypoint' });
  assert.equal(world.run.active, null);
  assert.deepEqual(ofType(world.events, 'run_ended'), [{ type: 'run_ended', zone: CAVE, end: 'left' }]);
  assert.notEqual(world.run.last, null);
  const cleared: World = atTable(100000, 6);
  setOut(cleared, { zone: CAVE, pins: [pin('swift')] });
  cleared.zone = { ...cleared.zone, packs: cleared.zone.packs.filter((pack): boolean => cleared.spawnedPacks.includes(pack)) };
  for (const monster of living(cleared)) kill(cleared, monster, { x: 1, z: 0 });
  assert.equal(cleared.run.active, null);
  assert.ok(cleared.events.some((event: WorldEvent): boolean => event.type === 'run_ended' && event.end === 'cleared'));
});

void test('the run is saved, survives a reload, and an old save without one loads with none', (): void => {
  const world: World = atTable(100000, 8);
  const setup: RunSetup = { zone: CAVE, pins: [pin('one_kind', kindOf(CAVE)), pin('hardened')] };
  setOut(world, setup);
  const save: SaveData = must(readSave(content, JSON.parse(JSON.stringify(toSave(world)))), 'save');
  assert.deepEqual(save.run, { active: setup, last: setup });
  const again: World = createWorld(content, { seed: 8, save });
  assert.deepEqual(again.run.active, setup);
  assert.ok(again.monsters.filter((monster: MonsterState): boolean => monster.def.boss === null && monster.def.rank === null).every((monster: MonsterState): boolean => monster.def.id === kindOf(CAVE)));
  const raw: unknown = JSON.parse(JSON.stringify(toSave(world)));
  assert.ok(isFields(raw));
  const { run: _gone, ...older } = raw;
  assert.deepEqual(must(readSave(content, older), 'old save').run, { active: null, last: null });
  const odd: Fields = { ...older, run: { active: { zone: CAVE, pins: [{ condition: 'gone' }, { condition: 'marked', pick: 'x' }, { condition: 'swift' }, { condition: 'swift' }] }, last: 'nonsense' } };
  assert.deepEqual(must(readSave(content, odd), 'odd save').run, { active: { zone: CAVE, pins: [pin('marked'), pin('swift')] }, last: null });
});
