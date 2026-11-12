import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MomentField } from '../content/moment-types.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { parseSaveText, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { forceStrike, momentOfEcho } from './moments.ts';
import { stepWorld } from './step.ts';
import type { MomentState, MonsterState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';
import { echoesOf, FIELD, fieldContent, fieldWorld, fieldZone, QUIET, RAID, slay, standAt } from '../../test/moment-support.ts';
import { must } from '../../test/support.ts';

const DT: number = 1 / 30;
const FAR = { x: 150, z: 150 } as const;

function run(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) events.push(...stepWorld(world, [], DT));
  return events;
}

function withZone(content: Content, zone: ZoneDef): Content {
  return { ...content, zones: new Map<string, ZoneDef>([...content.zones, [zone.id, zone]]) };
}

function quietField(patch: Partial<MomentField> = {}): MomentField {
  return { ...FIELD, start: 0, max: 1, interval: { min: 1000, max: 1000 }, ...patch };
}

function struck(world: World, def: string, at = { x: 40, z: 40 }): MomentState {
  standAt(world, FAR);
  const moment: MomentState = must(forceStrike(world, at, def), 'forced strike');
  run(world, world.content.moments.telegraph + DT * 2);
  assert.equal(moment.phase, 'dormant');
  return moment;
}

void test('a zone with a field starts with its first moments already dormant', (): void => {
  const world: World = fieldWorld();
  assert.equal(world.moments.length, FIELD.start);
  for (const moment of world.moments) {
    assert.equal(moment.phase, 'dormant');
    assert.ok(distance(moment.pos, world.player.pos) >= moment.def.radius + FIELD.clearance.hero);
  }
});

void test('a strike marks the ground before it lands, then leaves a dormant bubble', (): void => {
  const world: World = fieldWorld(quietField({ interval: { min: 1, max: 1 } }));
  const events: WorldEvent[] = run(world, 1.2);
  const mark = events.find((event: WorldEvent): boolean => event.type === 'moment_mark');
  assert.ok(mark !== undefined);
  assert.equal(events.some((event: WorldEvent): boolean => event.type === 'moment_strike'), false);
  const landed: WorldEvent[] = run(world, world.content.moments.telegraph);
  assert.ok(landed.some((event: WorldEvent): boolean => event.type === 'moment_strike'));
  assert.equal(must(world.moments[0], 'moment').phase, 'dormant');
});

void test('strikes keep their distance from the hero, the exits and each other', (): void => {
  const field: MomentField = { ...FIELD, max: 6, interval: { min: 0.5, max: 0.5 } };
  const zone = { ...fieldZone(field), exits: [{ id: 'east', x: 100, z: 80, radius: 2, to: 'moment_field', toExit: 'east', arrival: { x: 100, z: 80 }, requires: [], lockedHint: '', hiddenWhenLocked: false }] };
  const world: World = createWorld(withZone(fieldContent(field), zone), { seed: 3, save: null });
  enterZone(world, zone, { type: 'start' });
  for (let index: number = 0; index < 600; index += 1) {
    stepWorld(world, [], DT);
    for (const moment of world.moments) {
      if (moment.phaseTime > 0 || moment.phase !== 'mark') continue;
      assert.ok(distance(moment.pos, world.player.pos) >= moment.def.radius + field.clearance.hero);
      assert.ok(distance(moment.pos, { x: 100, z: 80 }) >= moment.def.radius + field.clearance.exits);
    }
    for (const a of world.moments) for (const b of world.moments) if (a !== b) assert.ok(distance(a.pos, b.pos) >= a.def.radius + b.def.radius + field.clearance.between - 1e-9);
  }
});

void test('an untouched bubble fades after its lifetime and is then gone', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, QUIET.id);
  run(world, QUIET.lifetime - 1);
  assert.equal(moment.phase, 'dormant');
  const events: WorldEvent[] = run(world, 1.2);
  assert.equal(moment.phase, 'fading');
  assert.equal(moment.outcome, 'faded');
  assert.equal(events.some((event: WorldEvent): boolean => event.type === 'drop'), false);
  run(world, world.content.moments.fade + DT);
  assert.equal(world.moments.includes(moment), false);
});

void test('stepping inside wakes a bubble, and a peaceful one plays out and fades with no reward', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, QUIET.id);
  standAt(world, moment.pos);
  const events: WorldEvent[] = run(world, DT * 2);
  assert.equal(moment.phase, 'awake');
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'moment_woke'));
  assert.equal(world.monsters.length, 0);
  const after: WorldEvent[] = run(world, QUIET.awake);
  assert.equal(moment.outcome, 'played');
  assert.equal(after.some((event: WorldEvent): boolean => event.type === 'drop'), false);
});

void test('a bubble that lands on the hero waits for him to step out and back in', (): void => {
  const world: World = fieldWorld(quietField());
  standAt(world, { x: 40, z: 40 });
  const moment: MomentState = must(forceStrike(world, { x: 40, z: 40 }, QUIET.id), 'strike');
  run(world, world.content.moments.telegraph + 1);
  assert.equal(moment.phase, 'dormant');
  standAt(world, FAR);
  run(world, DT * 2);
  standAt(world, moment.pos);
  run(world, DT * 2);
  assert.equal(moment.phase, 'awake');
});

void test('turned echoes are hostile monsters of the echo faction; killing them resolves the moment and drops its reward', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  const echoes: MonsterState[] = echoesOf(world, moment);
  assert.equal(echoes.length, 2);
  for (const echo of echoes) {
    assert.equal(echo.def.faction, world.content.moments.faction);
    assert.equal(echo.aggro, true);
    assert.equal(echo.def.loot.itemChance, 0);
    assert.equal(momentOfEcho(world, echo.id), moment);
  }
  assert.equal(moment.figures.filter((figure): boolean => figure.turned).length, 2);
  const gold: number = world.player.gold;
  slay(world, echoes);
  const events: WorldEvent[] = run(world, DT * 2);
  assert.equal(moment.outcome, 'resolved');
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'drop' && event.ground.content.kind === 'gold'));
  assert.equal(world.player.gold, gold);
  run(world, world.content.moments.fade + DT * 2);
  assert.equal(world.monsters.some((monster: MonsterState): boolean => echoes.includes(monster)), false);
});

void test('a moment whose hostiles outlive its timer dissolves them and gives nothing', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  standAt(world, FAR);
  const events: WorldEvent[] = run(world, RAID.awake);
  assert.equal(moment.outcome, 'expired');
  assert.equal(echoesOf(world, moment).length, 0);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'monster_remove'));
  assert.equal(events.some((event: WorldEvent): boolean => event.type === 'drop'), false);
});

void test('a field without combat never turns an echo', (): void => {
  const world: World = fieldWorld(quietField({ combat: false }));
  const moment: MomentState = struck(world, RAID.id);
  assert.equal(moment.combat, false);
  standAt(world, moment.pos);
  run(world, RAID.awake + 1);
  assert.equal(world.monsters.length, 0);
  assert.equal(moment.outcome, 'played');
  assert.equal(world.ground.length, 0);
});

function goldAt(level: number): number {
  const zone = { ...fieldZone(quietField()), level };
  const world: World = createWorld(withZone(fieldContent(quietField()), zone), { seed: 5, save: null });
  enterZone(world, zone, { type: 'start' });
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  slay(world, echoesOf(world, moment));
  run(world, DT * 2);
  return world.ground.reduce((sum: number, ground): number => sum + (ground.content.kind === 'gold' ? ground.content.amount : 0), 0);
}

void test('rewards grow with the zone level', (): void => {
  assert.ok(goldAt(8) > goldAt(1));
});

function trace(): string {
  const world: World = fieldWorld();
  run(world, 60);
  return JSON.stringify(world.moments.map((moment: MomentState): [string, number, number, string] => [moment.def.id, moment.pos.x, moment.pos.z, moment.phase]));
}

void test('the same seed plays the same strikes', (): void => {
  assert.equal(trace(), trace());
});

void test('leaving the zone removes every bubble and echo', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  assert.ok(world.monsters.length > 0);
  enterZone(world, fieldZone({ ...quietField(), start: 0 }), { type: 'start' });
  assert.equal(world.moments.length, 0);
  assert.equal(world.monsters.length, 0);
});

void test('saving mid-moment and loading starts a clean field with no orphan echoes', (): void => {
  const world: World = fieldWorld(quietField({ start: 1 }));
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  const content = world.content;
  const save = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  const loaded: World = createWorld(content, { seed: 9, save });
  assert.equal(loaded.zone.id, 'moment_field');
  assert.equal(loaded.monsters.length, 0);
  assert.equal(loaded.moments.length, 1);
  assert.equal(must(loaded.moments[0], 'moment').phase, 'dormant');
  run(loaded, 5);
});

void test('ten minutes of farming keeps bubbles, echoes and rewards inside their bounds', (): void => {
  const world: World = fieldWorld();
  const minutes: number = 10;
  const steps: number = Math.round((minutes * 60) / DT);
  const maxEchoes: number = FIELD.max * Math.max(QUIET.echoes.length, RAID.echoes.length);
  const longest: number = world.content.moments.telegraph + Math.max(QUIET.lifetime, RAID.lifetime, QUIET.awake, RAID.awake, world.content.moments.fade) + 1;
  let strikes: number = 0;
  let resolved: number = 0;
  let gold: number = 0;
  let items: number = 0;
  let fightTime: number = 0;
  for (let step: number = 0; step < steps; step += 1) {
    const awake: MomentState | undefined = world.moments.find((moment: MomentState): boolean => moment.phase === 'awake');
    const dormant: MomentState | undefined = world.moments.find((moment: MomentState): boolean => moment.phase === 'dormant');
    if (awake === undefined) {
      fightTime = 0;
      if (dormant !== undefined && step % 30 === 0) standAt(world, dormant.pos);
    } else {
      fightTime += DT;
      if (fightTime > 3) slay(world, echoesOf(world, awake));
    }
    world.player.life = world.player.maxLife;
    for (const event of stepWorld(world, [], DT)) {
      if (event.type === 'moment_strike') strikes += 1;
      if (event.type === 'moment_ended' && event.outcome === 'resolved') resolved += 1;
      if (event.type === 'drop' && event.ground.content.kind === 'gold') gold += event.ground.content.amount;
      if (event.type === 'drop' && event.ground.content.kind === 'item') items += 1;
    }
    world.ground = [];
    assert.ok(world.moments.filter((moment: MomentState): boolean => moment.phase !== 'fading').length <= FIELD.max);
    assert.ok(world.monsters.length <= maxEchoes);
    for (const moment of world.moments) assert.ok(moment.phaseTime <= longest);
  }
  const perMinute = (count: number): number => count / minutes;
  assert.ok(perMinute(strikes) >= 60 / (FIELD.interval.max + world.content.moments.telegraph) / 2, `strikes ${strikes}`);
  assert.ok(perMinute(strikes) <= 60 / FIELD.interval.min + 1, `strikes ${strikes}`);
  assert.ok(resolved > 0);
  assert.ok(perMinute(resolved) <= 60 / FIELD.interval.min + FIELD.start, `resolved ${resolved}`);
  assert.ok(gold > 0);
  assert.ok(perMinute(gold) <= perMinute(resolved) * RAID.reward.goldMax * 2, `gold ${gold}`);
  assert.ok(items <= resolved * RAID.reward.items);
});
