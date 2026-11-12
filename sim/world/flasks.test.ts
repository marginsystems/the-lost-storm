import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, roadWorld, roadZone } from '../../test/road-support.ts';
import { armed, must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneWaypoint } from '../content/types.ts';
import { createFlasks, flaskCharges, isRestoring } from './flasks.ts';
import { stepWorld } from './step.ts';
import type { Command, FlaskState, NoticeReason, World, WorldEvent } from './types.ts';
import { onWaypoint } from './waypoints.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const LIFE: number = 0;
const MANA: number = 1;

function quiet(zone: string): World {
  return settled(armed(worldIn(OUTPOST_CONTENT, zone, 3)));
}

function settled(world: World): World {
  world.monsters = [];
  world.spawnedPacks = [...world.zone.packs];
  world.player.stats.lifeRegen = 0;
  world.player.stats.manaRegen = 0;
  return world;
}

function flask(world: World, slot: number): FlaskState {
  return must(world.player.flasks[slot], `flask ${slot}`);
}

function run(world: World, seconds: number, first: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(seconds / DT);
  for (let step: number = 0; step < steps; step += 1) events.push(...stepWorld(world, step === 0 ? first : [], DT));
  return events;
}

function notices(events: readonly WorldEvent[]): NoticeReason[] {
  return events.flatMap((event: WorldEvent): NoticeReason[] => (event.type === 'notice' ? [event.reason] : []));
}

void test('the shipped flasks are one for life in slot 1 and one for mana in slot 2', (): void => {
  assert.deepEqual(content.flasks.map((def): string => def.resource), ['life', 'mana']);
});

void test('a life flask spends its charges and restores its amount over its duration, not at once', (): void => {
  const world: World = quiet('outpost');
  const player = world.player;
  const red: FlaskState = flask(world, LIFE);
  player.life = 1;
  const events: WorldEvent[] = stepWorld(world, [{ type: 'flask', slot: LIFE }], DT);
  assert.equal(red.charges, red.def.maxCharges - red.def.chargesPerUse);
  assert.deepEqual(
    events.filter((event: WorldEvent): boolean => event.type === 'flask_used').map((event: WorldEvent): string => (event.type === 'flask_used' ? event.flask : '')),
    [red.def.id],
  );
  assert.ok(player.life < 1 + red.def.amount / 4);
  assert.ok(isRestoring(red));
  run(world, red.def.duration + DT * 2);
  assert.ok(Math.abs(player.life - (1 + red.def.amount)) < 0.01);
  assert.equal(isRestoring(red), false);
});

void test('a mana flask fills mana and never past the maximum', (): void => {
  const world: World = quiet('outpost');
  const player = world.player;
  player.mana = player.stats.maxMana - 1;
  run(world, flask(world, MANA).def.duration + 1, [{ type: 'flask', slot: MANA }]);
  assert.equal(player.mana, player.stats.maxMana);
});

void test('a flask used again inside its cooldown says it is not ready', (): void => {
  const world: World = quiet('outpost');
  const red: FlaskState = flask(world, LIFE);
  world.player.life = 1;
  stepWorld(world, [{ type: 'flask', slot: LIFE }], DT);
  const again: WorldEvent[] = stepWorld(world, [{ type: 'flask', slot: LIFE }], DT);
  assert.deepEqual(notices(again), ['on_cooldown']);
  assert.equal(red.charges, red.def.maxCharges - red.def.chargesPerUse);
  run(world, red.def.cooldown);
  stepWorld(world, [{ type: 'flask', slot: LIFE }], DT);
  assert.equal(red.charges, red.def.maxCharges - 2 * red.def.chargesPerUse);
});

void test('an empty flask and a full globe each give a notice instead of silence', (): void => {
  const world: World = quiet('outpost');
  const red: FlaskState = flask(world, LIFE);
  assert.deepEqual(notices(stepWorld(world, [{ type: 'flask', slot: LIFE }], DT)), ['life_full']);
  assert.deepEqual(notices(stepWorld(world, [{ type: 'flask', slot: MANA }], DT)), ['mana_full']);
  world.player.life = 1;
  red.charges = red.def.chargesPerUse - 1;
  const events: WorldEvent[] = stepWorld(world, [{ type: 'flask', slot: LIFE }], DT);
  assert.deepEqual(notices(events), ['flask_empty']);
  assert.equal(events.some((event: WorldEvent): boolean => event.type === 'flask_used'), false);
  assert.equal(red.charges, red.def.chargesPerUse - 1);
});

void test('a dead hero cannot drink, and death ends a flask that was restoring', (): void => {
  const world: World = quiet('outpost');
  const red: FlaskState = flask(world, LIFE);
  world.player.life = 1;
  stepWorld(world, [{ type: 'flask', slot: LIFE }], DT);
  world.player.alive = false;
  stepWorld(world, [], DT);
  assert.equal(isRestoring(red), false);
  const charges: number = red.charges;
  assert.equal(stepWorld(world, [{ type: 'flask', slot: LIFE }], DT).length, 0);
  assert.equal(red.charges, charges);
});

void test('flasks fill to the top in town and on a waypoint, but not out in the wild', (): void => {
  const wild: World = quiet('outpost');
  flask(wild, LIFE).charges = 0;
  stepWorld(wild, [], DT);
  assert.equal(flask(wild, LIFE).charges, 0);

  const town: World = quiet('hub');
  flask(town, LIFE).charges = 0;
  flask(town, MANA).charges = 0;
  stepWorld(town, [], DT);
  assert.deepEqual(town.player.flasks.map((state: FlaskState): number => state.charges), content.flasks.map((def): number => def.maxCharges));

  const outpost: World = settled(roadWorld(roadZone({ waypoint: { x: 21, z: 8, radius: 1.8 } })));
  const point: ZoneWaypoint = must(outpost.zone.waypoint, 'waypoint');
  flask(outpost, MANA).charges = 0;
  stepWorld(outpost, [], DT);
  assert.equal(onWaypoint(outpost), false);
  assert.equal(flask(outpost, MANA).charges, 0);
  outpost.player.pos = { x: point.x, z: point.z };
  stepWorld(outpost, [], DT);
  assert.equal(flask(outpost, MANA).charges, flask(outpost, MANA).def.maxCharges);
});

void test('saved charges are restored within bounds, and a missing flask starts full', (): void => {
  const flasks: FlaskState[] = createFlasks(content, { life_flask: 7.6, mana_flask: 999 });
  assert.deepEqual(flaskCharges(flasks), { life_flask: 7, mana_flask: must(content.flasks[MANA], 'mana').maxCharges });
  assert.deepEqual(flaskCharges(createFlasks(content, null)), Object.fromEntries(content.flasks.map((def): [string, number] => [def.id, def.maxCharges])));
});
