import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { MomentDef, MomentField, MomentLibrary, StrikeInterval } from '../content/moment-types.ts';
import type { Content, SkillDef, ZoneDef, ZoneNpc } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { parseSaveText, toSave } from '../save.ts';
import { cuesForEvent } from '../audio.ts';
import { loadAudio } from '../content/audio.ts';
import { createWorld } from './create.ts';
import { echoFade, forceStrike, insideAwakeMoment, MOMENTS, momentOfEcho, nearestFight, restEchoes, safeSpots, strikeGround } from './moments.ts';
import { stepWorld } from './step.ts';
import { applyHit, offenceOf } from './combat.ts';
import { steadiness } from './poise.ts';
import type { MomentState, MonsterState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';
import { shiftWorld } from './void.ts';
import { buildNavGrid, isWalkable } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import { echoesOf, FIELD, fieldContent, fieldWorld, fieldZone, momentLibrary, QUIET, RAID, slay, standAt } from '../../test/moment-support.ts';
import { must } from '../../test/support.ts';

const DT: number = 1 / 30;
const SHIPPED: MomentLibrary = loadContent().moments;
const FAR = { x: 150, z: 150 } as const;
const HEARTH_SIDE = { x: 3, z: 0 } as const;
const ROAD_WALK = { speed: 4, within: 4 } as const;
const SAFE_PROBE = { x: 40, z: 47 } as const;
const BOUND = { knock: 60, frames: 45 } as const;
const STONE = { id: 9001, reach: 30 } as const;

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
  const zone = { ...fieldZone(field), exits: [{ id: 'east', x: 100, z: 80, radius: 2, to: 'moment_field', toExit: 'east', arrival: { x: 100, z: 80 }, requires: [], lockedHint: '', hiddenWhenLocked: false, look: 'ring' as const }] };
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

void test('a bubble that forms around the hero wakes after a short beat without him stepping out', (): void => {
  const world: World = fieldWorld(quietField());
  const at = { x: 40, z: 40 };
  standAt(world, at);
  const moment: MomentState = must(forceStrike(world, at, QUIET.id), 'forced strike');
  run(world, world.content.moments.telegraph + DT * 2);
  assert.equal(moment.phase, 'dormant');
  run(world, MOMENTS.settle);
  assert.equal(moment.phase, 'awake');
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

void test('stepping inside wakes a bubble, and a peaceful one plays out and leaves a share of its gold but no items', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, QUIET.id);
  standAt(world, moment.pos);
  const events: WorldEvent[] = run(world, DT * 2);
  assert.equal(moment.phase, 'awake');
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'moment_woke'));
  assert.equal(world.monsters.length, 0);
  const after: WorldEvent[] = run(world, QUIET.awake);
  assert.equal(moment.outcome, 'played');
  const drops = after.flatMap((event: WorldEvent) => (event.type === 'drop' ? [event.ground.content] : []));
  assert.ok(drops.length > 0);
  assert.ok(drops.every((content): boolean => content.kind === 'gold' && content.amount <= Math.ceil(QUIET.reward.goldMax * world.content.moments.playedShare * 2)));
});

void test('while the field is sure, a waking moment always turns an echo and only moments that can fight strike', (): void => {
  const shy: MomentDef = { ...RAID, id: 'test_shy', turnChance: 0.0001 };
  const sure: MomentField = quietField({ table: [{ moment: QUIET.id, weight: 50 }, { moment: shy.id, weight: 1 }], sure: [{ type: 'flag', flag: 'first_moment', is: 'cleared', not: true }] });
  for (let seed: number = 0; seed < 6; seed += 1) {
    const world: World = fieldWorld(sure, momentLibrary([QUIET, shy]));
    for (let skip: number = 0; skip < seed * 7; skip += 1) world.rng.next();
    const moment: MomentState = must(forceStrike(world, { x: 40, z: 40 }, null), 'strike');
    assert.equal(moment.def.id, shy.id);
    run(world, world.content.moments.telegraph + DT * 2);
    standAt(world, moment.pos);
    run(world, DT * 2);
    assert.ok(echoesOf(world, moment).length >= 1, `seed ${seed}`);
  }
});

void test('with no bubble up, a fight objective points at the widest strike area', (): void => {
  const world: World = fieldWorld(quietField());
  const ground = must(strikeGround(world), 'ground');
  assert.deepEqual(ground, FIELD.areas[0]);
  assert.equal(strikeGround(fieldWorld(quietField({ combat: false }))), null);
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

void test('turned echoes are hostile monsters of the echo faction; killing them resolves the moment, drops its reward and writes the cleared flags', (): void => {
  const world: World = fieldWorld(quietField(), { ...momentLibrary(), cleared: { moment_test: 'cleared' } });
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
  assert.equal(world.flags['moment_test'], undefined);
  const gold: number = world.player.gold;
  slay(world, echoes);
  const events: WorldEvent[] = run(world, DT * 2);
  assert.equal(moment.outcome, 'resolved');
  assert.equal(world.flags['moment_test'], 'cleared');
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'drop' && event.ground.content.kind === 'gold'));
  assert.equal(world.player.gold, gold);
  run(world, world.content.moments.fade + DT * 2);
  assert.equal(world.monsters.some((monster: MonsterState): boolean => echoes.includes(monster)), false);
});

void test('a slain echo lies still until its moment fades, then fades out with it', (): void => {
  const world: World = fieldWorld(quietField(), momentLibrary());
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  const echoes: MonsterState[] = echoesOf(world, moment);
  slay(world, echoes);
  const slain: MonsterState = must(echoes[0], 'slain echo');
  assert.equal(echoFade(world, slain.id), 0);
  run(world, DT * 3 + world.content.moments.fade / 2);
  assert.equal(moment.phase, 'fading');
  assert.ok(Math.abs(echoFade(world, slain.id) - 0.5) < 0.1);
  run(world, world.content.moments.fade / 2 - DT * 3);
  assert.ok(echoFade(world, slain.id) > 0.9);
});

void test('a moment the hero walks out of before it is cleared dissolves at once and gives nothing: no experience, no drops, no quest credit', (): void => {
  const world: World = fieldWorld(quietField());
  world.player.invulnerable = 1e9;
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  const echoes: MonsterState[] = echoesOf(world, moment);
  assert.ok(echoes.length > 1);
  const before: number = world.player.xp;
  slay(world, [must(echoes[0], 'an echo')]);
  const killed: WorldEvent[] = run(world, DT);
  assert.equal(world.player.xp, before);
  assert.equal(killed.some((event: WorldEvent): boolean => event.type === 'xp' && event.amount > 0), false);
  const thrower: MonsterState = must(echoesOf(world, moment).find((monster: MonsterState): boolean => monster.alive), 'a living echo');
  const stone: SkillDef = must(world.content.skills.get(thrower.def.skill), 'the echo skill');
  world.projectiles.push({ id: STONE.id, ownerId: thrower.id, team: 'monster', faction: thrower.def.faction, skill: stone, damageMin: 1, damageMax: 1, damagePercent: 0, critChance: 0, critMultiplier: 1, pos: { ...thrower.pos }, direction: { x: 1, z: 0 }, distanceLeft: STONE.reach, pierceLeft: 0, hitIds: [] });
  standAt(world, FAR);
  const events: WorldEvent[] = run(world, DT * 2);
  assert.equal(moment.outcome, 'left');
  assert.equal(world.projectiles.some((projectile): boolean => projectile.ownerId === thrower.id), false);
  assert.equal(echoesOf(world, moment).filter((monster: MonsterState): boolean => monster.alive).length, 0);
  assert.equal(world.player.xp, before);
  assert.equal(events.some((event: WorldEvent): boolean => event.type === 'drop' || event.type === 'xp' || event.type === 'chart_point'), false);
  assert.equal(world.flags['first_moment'] === 'cleared', false);
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

function farmTenMinutes(world: World, field: MomentField): void {
  const minutes: number = 10;
  const steps: number = Math.round((minutes * 60) / DT);
  const defs: MomentDef[] = [...world.content.moments.defs.values()];
  const maxEchoes: number = field.max * Math.max(...defs.map((def: MomentDef): number => def.echoes.length));
  const longest: number = world.content.moments.telegraph + Math.max(world.content.moments.fade, ...defs.flatMap((def: MomentDef): number[] => [def.lifetime, def.awake])) + 1;
  const goldMax: number = Math.max(...defs.map((def: MomentDef): number => def.reward.goldMax));
  const itemsMax: number = Math.max(...defs.map((def: MomentDef): number => def.reward.items));
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
    assert.ok(world.moments.filter((moment: MomentState): boolean => moment.phase !== 'fading').length <= field.max);
    assert.ok(world.monsters.length <= maxEchoes);
    for (const moment of world.moments) assert.ok(moment.phaseTime <= longest);
  }
  const perMinute = (count: number): number => count / minutes;
  assert.ok(perMinute(strikes) >= 60 / (field.interval.max + world.content.moments.telegraph) / 2, `strikes ${strikes}`);
  assert.ok(perMinute(strikes) <= 60 / field.interval.min + 1, `strikes ${strikes}`);
  assert.ok(resolved > 0);
  assert.ok(perMinute(resolved) <= 60 / field.interval.min + field.start, `resolved ${resolved}`);
  assert.ok(gold > 0);
  assert.ok(perMinute(gold) <= perMinute(resolved) * goldMax * 2, `gold ${gold}`);
  assert.ok(items <= resolved * itemsMax);
}

void test('ten minutes of farming keeps bubbles, echoes and rewards inside their bounds', (): void => {
  farmTenMinutes(fieldWorld(), FIELD);
});

void test('ten minutes of farming the shipped moments stays inside the same bounds', (): void => {
  const field: MomentField = { ...FIELD, table: [...SHIPPED.defs.keys()].map((moment: string) => ({ moment, weight: SHIPPED.defs.get(moment)?.bright === true ? 1 : 4 })) };
  farmTenMinutes(fieldWorld(field, SHIPPED), field);
});

void test('a hero who walked the In-Between still sees strikes land in the Hall, on its own ground', (): void => {
  const shipped: Content = loadContent();
  const world: World = createWorld(shipped, { seed: 21, save: null });
  enterZone(world, must(shipped.zones.get('between'), 'between'), { type: 'start' });
  shiftWorld(world, { x: 21.9, z: 240.3 });
  const hall: ZoneDef = must(shipped.zones.get('hall_of_time'), 'hall');
  const field: MomentField = must(hall.moments, 'hall field');
  enterZone(world, hall, { type: 'start' });
  assert.deepEqual(world.shift, { x: 0, z: 0 });
  assert.equal(world.moments.length, field.start);
  const events: WorldEvent[] = run(world, field.interval.max + world.content.moments.telegraph + 1);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'moment_strike'));
  assert.equal(world.strikeMisses, 0);
  const floor: NavGrid = buildNavGrid(world.zone, world.content.props, world.content.surfaces, world.content.player.radius);
  for (const moment of world.moments) assert.ok(isWalkable(floor, moment.pos.x, moment.pos.z));
});

void test('brushing the edge of a bubble does not wake it; only stepping well inside does', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, QUIET.id);
  standAt(world, { x: moment.pos.x + QUIET.radius * 0.9, z: moment.pos.z });
  run(world, 3);
  assert.equal(moment.phase, 'dormant');
  standAt(world, { x: moment.pos.x + QUIET.radius * MOMENTS.wakeDepth * 0.8, z: moment.pos.z });
  run(world, DT * 2);
  assert.equal(moment.phase, 'awake');
});

void test('a fight does not run out while the hero stays inside it, and ends the moment he walks out', (): void => {
  const world: World = fieldWorld(quietField());
  world.player.invulnerable = 1e9;
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, RAID.awake + 3);
  assert.equal(moment.phase, 'awake');
  world.player.path = [{ x: moment.pos.x + RAID.radius * 2, z: moment.pos.z }];
  run(world, (RAID.radius * 2) / world.player.stats.moveSpeed + 1);
  assert.equal(moment.outcome, 'left');
});

void test('a fight whose hero rose elsewhere and never walks back in runs out after the away limit', (): void => {
  const world: World = fieldWorld(quietField());
  world.player.invulnerable = 1e9;
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  restEchoes(world);
  standAt(world, FAR);
  run(world, MOMENTS.awayLimit - 1);
  assert.equal(moment.phase, 'awake');
  run(world, RAID.awake + 2);
  assert.equal(moment.outcome, 'expired');
});

void test('a first fight the hero walks out of ends, and a new one strikes beside him after a short wait', (): void => {
  const near = { min: 8, max: 11 } as const;
  const world: World = fieldWorld(quietField({ sure: [{ type: 'flag', flag: 'first_moment', is: 'cleared', not: true }], near }));
  world.player.invulnerable = 1e9;
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  standAt(world, FAR);
  run(world, DT * 2);
  assert.equal(moment.outcome, 'left');
  const early: WorldEvent[] = run(world, world.content.moments.comeback - 0.5);
  assert.equal(early.some((event: WorldEvent): boolean => event.type === 'moment_mark'), false);
  const later: WorldEvent[] = run(world, 1);
  const mark = must(later.find((event: WorldEvent): boolean => event.type === 'moment_mark'), 'a new strike');
  assert.ok(mark.type === 'moment_mark');
  const gap: number = distance(mark.moment.pos, world.player.pos);
  assert.ok(gap >= near.min - 1e-6 && gap <= near.max + 1e-6, `${gap.toFixed(1)} m`);
});

void test('echoes are bound to their bubble: a hard knock, a chase or a flight ends at the inside of the edge', (): void => {
  const world: World = fieldWorld(quietField());
  world.player.invulnerable = 1e9;
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  const echoes: MonsterState[] = echoesOf(world, moment);
  assert.ok(echoes.length > 0);
  for (const monster of echoes) {
    monster.knock.x = BOUND.knock;
    monster.knock.z = BOUND.knock;
  }
  for (let frame: number = 0; frame < BOUND.frames; frame += 1) {
    run(world, DT);
    for (const monster of echoesOf(world, moment)) assert.ok(distance(monster.pos, moment.pos) <= RAID.radius - monster.radius + 1e-6, `echo ${monster.id} at ${distance(monster.pos, moment.pos).toFixed(2)} m`);
  }
});

void test('echoes are immune to knockback and pulls for as long as they belong to a bubble, yet still flinch where they stand', (): void => {
  const world: World = fieldWorld(quietField());
  world.player.invulnerable = 1e9;
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  const heavy: SkillDef = { ...must(world.content.skills.get(world.player.bar[0] ?? ''), 'a hero skill'), knockback: BOUND.knock, stagger: 0.5 };
  for (const monster of echoesOf(world, moment)) {
    assert.equal(steadiness(monster), 0);
    const at: Vec2 = { ...monster.pos };
    applyHit(world, offenceOf(world.player), monster, heavy, { x: 1, z: 0 });
    assert.deepEqual(monster.knock, { x: 0, z: 0 });
    assert.ok(monster.stagger > 0 || monster.def.poise.stagger === 0);
    assert.deepEqual(monster.pos, at);
  }
  const echo: MonsterState = must(echoesOf(world, moment)[0], 'an echo');
  const held: Vec2 = { ...echo.pos };
  world.player.pos = { x: echo.pos.x + echo.radius, z: echo.pos.z };
  run(world, DT);
  assert.ok(distance(echo.pos, held) < 1e-6, `pushed ${distance(echo.pos, held).toFixed(3)} m`);
});

void test('a knock on the hero near the edge cannot throw him out of the bubble; only his own walking carries him out', (): void => {
  const world: World = fieldWorld(quietField());
  world.player.invulnerable = 1e9;
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  standAt(world, { x: moment.pos.x + RAID.radius - 1, z: moment.pos.z });
  run(world, DT);
  world.player.knock.x = BOUND.knock;
  run(world, 1);
  assert.equal(moment.phase, 'awake');
  assert.ok(distance(world.player.pos, moment.pos) <= RAID.radius);
});

void test('a new hero in the Hall gets a grace period, then the first moment strikes on screen beside him as he walks the road and cuts down whatever wakes', (): void => {
  const shipped: Content = loadContent();
  const hall: ZoneDef = must(shipped.zones.get('hall_of_time'), 'hall');
  const field: MomentField = must(hall.moments, 'hall field');
  const near: StrikeInterval = must(field.near, 'hall near');
  const east: Vec2 = must(hall.exits.find((exit): boolean => exit.id === 'east'), 'east exit');
  for (let seed: number = 1; seed <= 12; seed += 1) {
    const world: World = createWorld(shipped, { seed, save: null });
    enterZone(world, hall, { type: 'start' });
    world.player.invulnerable = 1e9;
    const from: Vec2 = { ...world.player.pos };
    let landed: { readonly at: number; readonly gap: number; readonly id: string } | null = null;
    for (let elapsed: number = 0; elapsed < field.grace + ROAD_WALK.within && landed === null; elapsed += DT) {
      const along: number = Math.min(1, (elapsed * ROAD_WALK.speed) / distance(from, east));
      standAt(world, { x: from.x + (east.x - from.x) * along, z: from.z + (east.z - from.z) * along });
      slay(world, world.monsters.filter((monster: MonsterState): boolean => monster.aggro && monster.def.faction !== world.content.moments.faction));
      for (const event of stepWorld(world, [], DT)) {
        if (event.type === 'moment_mark' && elapsed < field.grace - DT) assert.fail(`seed ${seed}: struck at ${elapsed.toFixed(1)} s, inside the grace`);
        if (event.type === 'moment_mark') landed = { at: elapsed, gap: distance(event.moment.pos, world.player.pos), id: event.moment.def.id };
      }
    }
    const strike = must(landed, `seed ${seed}: no first moment within ${field.grace + ROAD_WALK.within} s`);
    assert.equal(strike.id, must(field.first[0], 'first entry').moment, `seed ${seed}`);
    assert.ok(strike.gap >= near.min - 1e-6 && strike.gap <= near.max + 1e-6, `seed ${seed}: ${strike.gap.toFixed(1)} m from the hero`);
  }
});

void test('no strike ever lands near the safe ground or close enough to a living pack for it to join the fight', (): void => {
  const shipped: Content = loadContent();
  const hall: ZoneDef = must(shipped.zones.get('hall_of_time'), 'hall');
  const field: MomentField = must(hall.moments, 'hall field');
  assert.ok(field.clearance.safe > 0);
  const keeper: ZoneNpc = must(must(shipped.zones.get('hideout'), 'hideout').npcs[0], 'a camp NPC');
  const guarded: ZoneDef = { ...hall, npcs: [{ ...keeper, x: SAFE_PROBE.x, z: SAFE_PROBE.z, when: [] }] };
  for (let seed: number = 1; seed <= 6; seed += 1) {
    const world: World = createWorld(shipped, { seed, save: null });
    world.flags['first_moment'] = 'cleared';
    enterZone(world, guarded, { type: 'start' });
    const spots = safeSpots(world);
    assert.ok(spots.some((spot: Vec2): boolean => distance(spot, SAFE_PROBE) < 1e-6));
    const seen: MomentState[] = [];
    const packAt: number[] = [];
    for (let elapsed: number = 0; elapsed < 240; elapsed += 1) {
      run(world, 1);
      for (const moment of world.moments) {
        if (seen.includes(moment)) continue;
        seen.push(moment);
        const others: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.def.faction !== world.content.moments.faction);
        if (others.length > 0) packAt.push(Math.min(...others.map((monster: MonsterState): number => distance(monster.pos, moment.pos) - monster.def.aggroRadius)));
      }
      for (const moment of world.moments) if (moment.phase === 'dormant') moment.timeLeft = 0;
    }
    assert.ok(seen.length >= 4, `seed ${seed}`);
    for (const moment of seen) for (const spot of spots) assert.ok(distance(moment.pos, spot) >= moment.def.radius + field.clearance.safe, `seed ${seed}: ${moment.def.id} ${distance(moment.pos, spot).toFixed(1)} from ${spot.x.toFixed(1)},${spot.z.toFixed(1)} npc now ${world.npcs.map((npc) => `${npc.pos.x.toFixed(1)},${npc.pos.z.toFixed(1)}`).join(" ")}`);
    assert.ok(packAt.length > 0);
    for (const gap of packAt) assert.ok(gap >= field.clearance.packs - 1e-6, `seed ${seed}: a strike ${gap.toFixed(1)} m past a pack's reach`);
  }
});

void test('while the first fight is still owed, only one moment is up at a time', (): void => {
  const shipped: Content = loadContent();
  const hall: ZoneDef = must(shipped.zones.get('hall_of_time'), 'hall');
  for (let seed: number = 1; seed <= 4; seed += 1) {
    const world: World = createWorld(shipped, { seed, save: null });
    enterZone(world, hall, { type: 'start' });
    for (let elapsed: number = 0; elapsed < 120; elapsed += 1) {
      run(world, 1);
      assert.ok(world.moments.filter((moment: MomentState): boolean => moment.phase !== 'fading').length <= 1, `seed ${seed} at ${elapsed}`);
    }
  }
});

interface FirstFight {
  readonly world: World;
  readonly moment: MomentState;
}

function firstFight(seed: number): FirstFight {
  const shipped: Content = loadContent();
  const world: World = createWorld(shipped, { seed, save: null });
  enterZone(world, must(shipped.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  world.monsters = [];
  const at = { x: world.player.pos.x + 30, z: world.player.pos.z };
  const moment: MomentState = must(forceStrike(world, at, 'first_fire'), 'first fire');
  run(world, shipped.moments.telegraph + DT * 2);
  standAt(world, { x: at.x + HEARTH_SIDE.x, z: at.z + HEARTH_SIDE.z });
  return { world, moment };
}

function echoFoes(world: World): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.def.faction === world.content.moments.faction);
}

function nearestFoe(world: World): MonsterState | undefined {
  const from = world.player.pos;
  return echoFoes(world).toSorted((a: MonsterState, b: MonsterState): number => distance(a.pos, from) - distance(b.pos, from))[0];
}

interface FightLog {
  readonly time: number;
  readonly taken: number;
  readonly firstHit: number;
  readonly worstSecond: number;
  readonly won: boolean;
}

function fightFirst(seed: number, attack: boolean): FightLog {
  const { world } = firstFight(seed);
  const hits: { readonly at: number; readonly amount: number }[] = [];
  let time: number = 0;
  let woke: boolean = false;
  while (time < 60 && world.player.alive) {
    const foe: MonsterState | undefined = nearestFoe(world);
    const events: WorldEvent[] = stepWorld(world, attack && foe !== undefined ? [{ type: 'skill', slot: 0, aim: foe.pos, targetId: foe.id }] : [], DT);
    woke = woke || echoFoes(world).length > 0;
    if (woke) time += DT;
    for (const event of events) if (event.type === 'damage' && event.targetTeam === 'player') hits.push({ at: time, amount: event.amount });
    if (woke && echoFoes(world).length === 0) break;
  }
  const worstSecond: number = Math.max(0, ...hits.map((hit): number => hits.filter((other): boolean => other.at >= hit.at && other.at < hit.at + 1).reduce((sum: number, other): number => sum + other.amount, 0)));
  return { time, taken: hits.reduce((sum: number, hit): number => sum + hit.amount, 0), firstHit: hits[0]?.at ?? Infinity, worstSecond, won: world.player.alive && echoFoes(world).length === 0 };
}

void test('in the first fight a hero who stands still lasts 25 to 32 s, and one who fights back wins in 15 to 25 s after losing a third to a half of his life', (): void => {
  for (let seed: number = 1; seed <= 4; seed += 1) {
    const still: FightLog = fightFirst(seed, false);
    assert.equal(still.won, false, `seed ${seed}`);
    assert.ok(still.time >= 24 && still.time <= 32, `seed ${seed}: stood ${still.time.toFixed(1)} s`);
    const fought: FightLog = fightFirst(seed, true);
    assert.ok(fought.won, `seed ${seed}`);
    assert.ok(fought.time >= 15 && fought.time <= 25, `seed ${seed}: won in ${fought.time.toFixed(1)} s`);
    assert.ok(fought.taken >= 28 && fought.taken <= 55, `seed ${seed}: took ${fought.taken.toFixed(0)}`);
    for (const log of [still, fought]) {
      assert.ok(log.firstHit >= SHIPPED.rouse, `seed ${seed}: hit at ${log.firstHit.toFixed(1)} s, before the echoes finished waking`);
      assert.ok(log.worstSecond <= 28, `seed ${seed}: ${log.worstSecond.toFixed(0)} in one second`);
    }
  }
});

void test('turned echoes wait out the waking, then act one after another instead of all at once', (): void => {
  const { world, moment } = firstFight(1);
  run(world, DT * 2);
  const echoes: MonsterState[] = echoFoes(world);
  assert.equal(echoes.length, moment.def.echoes.filter((entry): boolean => entry.turns).length);
  const rests: number[] = echoes.map((monster: MonsterState): number => monster.restTime).toSorted((a: number, b: number): number => a - b);
  assert.ok((rests[0] ?? 0) >= SHIPPED.rouse - DT * 3);
  for (let index: number = 1; index < rests.length; index += 1) assert.ok((rests[index] ?? 0) - (rests[index - 1] ?? 0) >= SHIPPED.stagger - 1e-6);
});

void test('a hero who falls in the first fight and rises at the checkpoint comes back to the same fight, still marked, and its echoes wake again before they hit', (): void => {
  const { world, moment } = firstFight(2);
  world.player.maxLife = 30;
  world.player.life = 30;
  run(world, 40);
  assert.equal(world.player.alive, false);
  run(world, world.content.player.respawnDelay + DT);
  stepWorld(world, [{ type: 'respawn', choice: 'checkpoint' }], DT);
  assert.equal(world.player.alive, true);
  assert.ok(world.moments.includes(moment));
  assert.notEqual(moment.phase, 'fading');
  assert.equal(nearestFight(world), moment);
  const back: MonsterState[] = echoFoes(world);
  assert.ok(back.length > 0);
  for (const monster of back) assert.ok(monster.restTime >= SHIPPED.rouse - 1e-6);
  run(world, 30);
  assert.ok(world.moments.includes(moment) && moment.phase !== 'fading');
});

void test('safe ground is every NPC, the waypoint and every service prop such as the stash, wherever the zone puts them', (): void => {
  const shipped: Content = loadContent();
  const hideout: ZoneDef = must(shipped.zones.get('hideout'), 'hideout');
  const world: World = createWorld(shipped, { seed: 3, save: null });
  enterZone(world, hideout, { type: 'start' });
  const spots = safeSpots(world);
  const has = (x: number, z: number): boolean => spots.some((spot): boolean => Math.abs(spot.x - x) < 1e-6 && Math.abs(spot.z - z) < 1e-6);
  assert.ok(world.npcs.length > 0);
  for (const npc of world.npcs) assert.ok(has(npc.pos.x, npc.pos.z), npc.def.id);
  const waypoint = must(hideout.waypoint, 'hideout waypoint');
  assert.ok(has(waypoint.x, waypoint.z));
  const services = hideout.props.filter((placed): boolean => (shipped.props.get(placed.prop)?.service ?? null) !== null);
  assert.ok(services.length > 0);
  for (const placed of services) assert.ok(has(placed.x, placed.z), placed.prop);
});

void test('the bubble sound and the muffled bed follow the hero into a woken bubble', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, QUIET.id);
  assert.equal(insideAwakeMoment(world), false);
  standAt(world, moment.pos);
  const events: WorldEvent[] = run(world, DT * 2);
  assert.equal(insideAwakeMoment(world), true);
  const woke: WorldEvent | undefined = events.find((event: WorldEvent): boolean => event.type === 'moment_woke');
  assert.ok(woke !== undefined);
  const audio = loadAudio(world.content);
  assert.deepEqual(cuesForEvent(audio, world, woke).map((cue): string => cue.sound), ['bubble_calm']);
  world.player.pos = { x: moment.pos.x + moment.def.radius + 5, z: moment.pos.z };
  assert.equal(insideAwakeMoment(world), false);
});

void test('a bubble that turns its echoes opens with the hostile sound', (): void => {
  const world: World = fieldWorld(quietField({ table: [{ moment: RAID.id, weight: 1 }] }), momentLibrary([RAID]));
  const moment: MomentState = must(forceStrike(world, { x: 40, z: 40 }, RAID.id), 'strike');
  run(world, world.content.moments.telegraph + DT * 2);
  standAt(world, moment.pos);
  const events: WorldEvent[] = run(world, DT * 2);
  const woke: WorldEvent | undefined = events.find((event: WorldEvent): boolean => event.type === 'moment_woke' && event.turned.length > 0);
  assert.ok(woke !== undefined);
  assert.deepEqual(cuesForEvent(loadAudio(world.content), world, woke).map((cue): string => cue.sound), ['bubble_hostile']);
});
