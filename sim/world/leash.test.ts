import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { standAt } from '../../test/moment-support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { createWorld } from './create.ts';
import { LEASH } from './leash.ts';
import { forceStrike } from './moments.ts';
import { spawnMonster } from './spawn.ts';
import { stepWorld } from './step.ts';
import type { MomentState, MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const PROBE = { dt: 1 / 30, east: 30, hearth: 3, outside: 4, home: 12, giveUpSlack: 0.5, homeBy: 12, settle: 0.1 } as const;

const content: Content = loadContent();

interface Shut {
  readonly world: World;
  readonly moment: MomentState;
  readonly roamer: MonsterState;
}

function heroInBubble(roamerId: string): Shut {
  const world: World = createWorld(content, { seed: 5, save: null });
  enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  world.monsters = [];
  world.player.invulnerable = Infinity;
  const at: Vec2 = { x: world.player.pos.x + PROBE.east, z: world.player.pos.z };
  const moment: MomentState = must(forceStrike(world, at, 'first_fire'), 'first fire');
  for (let elapsed: number = 0; elapsed < content.moments.telegraph + PROBE.dt * 2; elapsed += PROBE.dt) stepWorld(world, [], PROBE.dt);
  standAt(world, { x: at.x + PROBE.hearth, z: at.z });
  stepWorld(world, [], PROBE.dt);
  assert.equal(moment.phase, 'awake');
  const def: MonsterDef = must(content.monsters.get(roamerId), roamerId);
  const roamer: MonsterState = spawnMonster(world, def, world.nextPackId, { x: at.x + moment.def.radius + PROBE.home, z: at.z }, { summonerId: null, scatter: 0, revived: false });
  roamer.spawnTime = 0;
  roamer.pos = { x: at.x + moment.def.radius + PROBE.outside, z: at.z };
  roamer.aggro = true;
  return { world, moment, roamer };
}

for (const roamerId of ['unfinished_taker', 'unfinished_brute', 'unfinished_thrower']) {
  void test(`a roaming ${roamerId} chasing the hero into a live moment stops at its shell, never hits him there, and walks home after a few seconds`, (): void => {
    const { world, moment, roamer } = heroInBubble(roamerId);
    let gaveUp: number | null = null;
    let home: number | null = null;
    for (let elapsed: number = 0; elapsed < LEASH.wait + PROBE.homeBy && home === null; elapsed += PROBE.dt) {
      for (const event of stepWorld(world, [], PROBE.dt)) {
        if (event.type === 'damage' && event.targetTeam === 'player') assert.notEqual(event.sourceId, roamer.id, `hit him from outside at ${elapsed.toFixed(1)} s`);
      }
      assert.ok(distance(roamer.pos, moment.pos) >= moment.def.radius + roamer.radius - 1e-6, `inside the shell at ${elapsed.toFixed(1)} s`);
      if (gaveUp === null && !roamer.aggro) gaveUp = elapsed;
      if (gaveUp !== null && !roamer.returning && distance(roamer.pos, roamer.home) <= LEASH.homeReach) home = elapsed;
    }
    const quit: number = must(gaveUp, 'gave up');
    assert.ok(quit >= LEASH.wait - PROBE.settle && quit <= LEASH.wait + PROBE.giveUpSlack, `gave up after ${quit.toFixed(1)} s`);
    must(home, 'walked home');
    assert.ok(roamer.alive && !roamer.aggro);
  });
}

void test('a roaming monster standing where a moment wakes is pushed out to its shell, while the moment\'s own echoes stay inside', (): void => {
  const { world, moment, roamer } = heroInBubble('unfinished_taker');
  roamer.pos = { x: moment.pos.x - 1, z: moment.pos.z + 1 };
  stepWorld(world, [], PROBE.dt);
  assert.ok(distance(roamer.pos, moment.pos) >= moment.def.radius + roamer.radius - 1e-6);
  const echoes: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster !== roamer && monster.alive);
  assert.ok(echoes.length > 0);
  for (const echo of echoes) assert.ok(distance(echo.pos, moment.pos) <= moment.def.radius);
});

const HOMEWARD = { dt: 1 / 30, back: 10, seconds: 6, onHome: [0, 0.3] } as const;

for (const offset of HOMEWARD.onHome) {
  void test(`a roamer walking home to a spot the hero stands ${offset} m from does not stand idle beside him: it turns and fights`, (): void => {
    const world: World = createWorld(content, { seed: 5, save: null });
    enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
    world.monsters = [];
    world.player.invulnerable = Infinity;
    const home: Vec2 = { x: world.player.pos.x + offset, z: world.player.pos.z };
    const roamer: MonsterState = spawnMonster(world, must(content.monsters.get('unfinished_taker'), 'taker'), world.nextPackId, home, { summonerId: null, scatter: 0, revived: false });
    roamer.spawnTime = 0;
    roamer.pos = { x: home.x - HOMEWARD.back, z: home.z };
    roamer.aggro = false;
    roamer.returning = true;
    let swung: boolean = false;
    for (let elapsed: number = 0; elapsed < HOMEWARD.seconds && !swung; elapsed += HOMEWARD.dt) {
      for (const event of stepWorld(world, [], HOMEWARD.dt)) if (event.type === 'skill_start' && event.actorId === roamer.id) swung = true;
    }
    assert.ok(roamer.aggro, 'it never turned on him');
    assert.equal(roamer.returning, false);
    assert.ok(swung, 'it never swung at him');
  });
}

void test('a roamer walking home past a hero still inside a live moment keeps walking home and does not turn on him', (): void => {
  const { world, moment, roamer } = heroInBubble('unfinished_taker');
  roamer.aggro = false;
  roamer.returning = true;
  roamer.pos = { x: moment.pos.x + moment.def.radius + PROBE.outside, z: moment.pos.z };
  const homeward = (): boolean => roamer.returning;
  for (let elapsed: number = 0; elapsed < PROBE.homeBy && homeward(); elapsed += PROBE.dt) {
    stepWorld(world, [], PROBE.dt);
    assert.equal(roamer.aggro, false, `turned on him at ${elapsed.toFixed(1)} s`);
  }
  assert.equal(roamer.returning, false, 'never got home');
});

const CROWD = { dt: 1 / 30, back: 8, seconds: 10, pack: 4, spread: 1.5 } as const;

function homeWorld(): World {
  const world: World = createWorld(content, { seed: 5, save: null });
  enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  world.monsters = [];
  world.player.invulnerable = Infinity;
  return world;
}

function sendHome(world: World, def: MonsterDef, home: Vec2, from: Vec2, packId: number = world.nextPackId): MonsterState {
  const roamer: MonsterState = spawnMonster(world, def, packId, home, { summonerId: null, scatter: 0, revived: false });
  roamer.spawnTime = 0;
  roamer.pos = { ...from };
  roamer.aggro = false;
  roamer.returning = true;
  return roamer;
}

function walkedHome(world: World, roamers: readonly MonsterState[]): boolean {
  for (let elapsed: number = 0; elapsed < CROWD.seconds && roamers.some((roamer: MonsterState): boolean => roamer.returning); elapsed += CROWD.dt) stepWorld(world, [], CROWD.dt);
  return roamers.every((roamer: MonsterState): boolean => !roamer.returning);
}

void test('a roamer that will not wake to the hero standing on its home settles beside him instead of walking home for ever', (): void => {
  const world: World = homeWorld();
  const home: Vec2 = { ...world.player.pos };
  const calm: MonsterDef = { ...must(content.monsters.get('unfinished_taker'), 'taker'), aggroRadius: 0 };
  const roamer: MonsterState = sendHome(world, calm, home, { x: home.x - CROWD.back, z: home.z });
  assert.ok(walkedHome(world, [roamer]), `still walking home ${distance(roamer.pos, home).toFixed(2)} m out`);
  assert.equal(roamer.aggro, false);
  assert.ok(distance(roamer.pos, home) <= LEASH.crowdReach);
});

void test('packmates walking home to one shared spot all settle round it', (): void => {
  const world: World = homeWorld();
  const def: MonsterDef = must(content.monsters.get('unfinished_taker'), 'taker');
  const home: Vec2 = { x: world.player.pos.x + def.aggroRadius + CROWD.back * 2, z: world.player.pos.z };
  const packId: number = world.nextPackId;
  const pack: MonsterState[] = Array.from({ length: CROWD.pack }, (_unused: unknown, index: number): MonsterState => sendHome(world, def, home, { x: home.x + CROWD.back, z: home.z + (index - CROWD.pack / 2) * CROWD.spread }, packId));
  assert.ok(walkedHome(world, pack), pack.map((roamer: MonsterState): string => `${distance(roamer.pos, home).toFixed(2)} m${roamer.returning ? ' returning' : ''}`).join(', '));
  for (const roamer of pack) assert.ok(distance(roamer.pos, home) <= LEASH.crowdReach);
});
