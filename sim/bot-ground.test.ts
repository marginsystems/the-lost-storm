import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../test/arena-support.ts';
import { must } from '../test/support.ts';
import { FINISH, hotGround, standingBurn, worthTheBurn } from './bot-ground.ts';
import type { SkillDef } from './content/types.ts';
import { expectedHit } from './stats.ts';
import { placeArea } from './world/areas.ts';
import { offenceOf } from './world/combat.ts';
import type { MonsterState, World } from './world/types.ts';

const GROUND_TEST = {
  foe: 1.4,
  far: 9,
  low: 0.4,
  window: 2,
  hurt: 0.9,
} as const;

interface Scene {
  readonly world: World;
  readonly foe: MonsterState;
  readonly swing: SkillDef;
  readonly patch: SkillDef;
}

function scene(seed: number): Scene {
  const world: World = arena(seed);
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  const foe: MonsterState = place(world, 'test_rower', { x: ARENA_CENTRE.x + GROUND_TEST.foe, z: ARENA_CENTRE.z });
  const swing: SkillDef = must(world.player.skills[0], 'basic attack');
  const patch: SkillDef = must(world.content.skills.get('cinder_patch'), 'cinder_patch');
  return { world, foe, swing, patch };
}

void test('standing on cool ground or in the hero\'s own fire costs nothing, and a foe\'s burning patch costs more the longer the hero stands in it', (): void => {
  const { world, foe, patch } = scene(41);
  assert.equal(standingBurn(world, world.player.pos, GROUND_TEST.window), 0);
  placeArea(world, offenceOf(world.player), patch, world.player.pos);
  assert.equal(standingBurn(world, world.player.pos, GROUND_TEST.window), 0);
  placeArea(world, offenceOf(foe), patch, world.player.pos);
  assert.equal(hotGround(world, world.player.pos), true);
  const short: number = standingBurn(world, world.player.pos, patch.delivery.type === 'area' ? patch.delivery.pulse : GROUND_TEST.window);
  const long: number = standingBurn(world, world.player.pos, GROUND_TEST.window);
  assert.ok(short > 0);
  assert.ok(long > short);
  world.zone = { ...world.zone, floors: Object.fromEntries(Object.keys(world.zone.floors).map((tile: string): [string, string] => [tile, 'vent_ground'])) };
  assert.ok(standingBurn(world, world.player.pos, GROUND_TEST.window) > long);
});

void test('a melee hero takes a short burn only for a foe in reach that its next swing or two will kill, with life to spare', (): void => {
  const { world, foe, swing, patch } = scene(42);
  placeArea(world, offenceOf(foe), patch, world.player.pos);
  const hit: number = expectedHit(world.player.stats, swing);
  foe.life = hit * FINISH.swings * 2;
  assert.equal(worthTheBurn(world, foe, swing, swing.engageRange), false, 'too much life left');
  foe.life = hit / 2;
  assert.equal(worthTheBurn(world, foe, swing, swing.engageRange), true);
  assert.equal(worthTheBurn(world, foe, swing, FINISH.meleeReach + 1), false, 'only melee');
  world.player.life = world.player.maxLife * FINISH.lifeFloor * GROUND_TEST.hurt;
  assert.equal(worthTheBurn(world, foe, swing, swing.engageRange), false, 'too hurt');
  world.player.life = world.player.maxLife;
  foe.pos = { x: world.player.pos.x + GROUND_TEST.far, z: world.player.pos.z };
  assert.equal(worthTheBurn(world, foe, swing, swing.engageRange), false, 'out of reach');
  foe.pos = { x: world.player.pos.x + GROUND_TEST.foe, z: world.player.pos.z };
  world.zone = { ...world.zone, floors: Object.fromEntries(Object.keys(world.zone.floors).map((tile: string): [string, string] => [tile, 'vent_ground'])) };
  assert.equal(worthTheBurn(world, foe, swing, swing.engageRange), true, 'a moment on a vent at full life');
  world.player.life = world.player.maxLife * GROUND_TEST.low;
  assert.ok(world.player.life > world.player.maxLife * FINISH.lifeFloor);
  assert.equal(worthTheBurn(world, foe, swing, swing.engageRange), false, 'the burn is too big a share of what is left');
});
