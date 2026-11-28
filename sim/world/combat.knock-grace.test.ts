import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { must } from '../../test/support.ts';
import { ringContent, ringWorld } from '../../test/rival-support.ts';
import { rivalOf, startRivalDuel } from '../rl/rival.ts';
import type { RivalDuel } from '../rl/rival.ts';
import { applyHit, offenceOf } from './combat.ts';
import { monsterLevel, spawnMonster } from './spawn.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, Offence, PlayerState, World, WorldEvent } from './types.ts';

const CONTENT: Content = ringContent(loadContent());
const BOLT: SkillDef = must(CONTENT.skills.get('storm_bolt'), 'storm bolt');
const BRUTE: MonsterDef = must(CONTENT.monsters.get('unfinished_brute'), 'brute');
const HAYMAKER: SkillDef = must(CONTENT.skills.get(BRUTE.skill), 'haymaker');
const DT: number = 1 / 60;
const AWAY: Vec2 = { x: 1, z: 0 };
const SPAM = { seconds: 6, mostHeld: 0.5 } as const;

interface Pair {
  readonly world: World;
  readonly hero: PlayerState;
  readonly rival: PlayerState;
}

function pair(seed: number): Pair {
  const world: World = ringWorld(CONTENT, seed, 20);
  const duel: RivalDuel = must(startRivalDuel(world, seed), 'duel');
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  world.player.life = world.player.maxLife;
  return { world, hero: world.player, rival };
}

function speed(hero: PlayerState): number {
  return Math.hypot(hero.knock.x, hero.knock.z);
}

function graceOf(hero: PlayerState): number {
  return hero.knockGrace;
}

function wait(world: World, seconds: number): void {
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) stepWorld(world, [], DT);
}

void test('a hero shoved once cannot be shoved again until the knock grace runs out, though the hits still land', (): void => {
  const { world, hero, rival }: Pair = pair(31);
  assert.ok(applyHit(world, offenceOf(rival), hero, BOLT, AWAY));
  const first: number = speed(hero);
  assert.ok(first > 0, 'the first bolt shoves the hero');
  assert.equal(hero.knockGrace, CONTENT.player.knockGrace);
  wait(world, BOLT.cooldown);
  const sliding: number = speed(hero);
  const life: number = hero.life;
  assert.ok(applyHit(world, offenceOf(rival), hero, BOLT, AWAY));
  assert.ok(hero.life < life, 'the second bolt still hurts');
  assert.ok(speed(hero) <= sliding, 'the second bolt adds no push inside the grace');
  wait(world, CONTENT.player.knockGrace);
  assert.equal(hero.knockGrace, 0);
  assert.equal(speed(hero), 0);
  assert.ok(applyHit(world, offenceOf(rival), hero, BOLT, AWAY));
  assert.ok(speed(hero) > 0, 'once the grace is over a bolt shoves the hero again');
});

void test('a hero bolted at the bolt cooldown is free to walk most of the time instead of being held in place', (): void => {
  const { world, hero, rival }: Pair = pair(32);
  const offence: Offence = { ...offenceOf(rival), damageMin: 0, damageMax: 0, critChance: 0 };
  const start: Vec2 = { x: hero.pos.x, z: hero.pos.z };
  const dest: Vec2 = { x: hero.pos.x - 30, z: hero.pos.z };
  let held: number = 0;
  let next: number = 0;
  for (let time: number = 0; time < SPAM.seconds; time += DT) {
    if (time >= next) {
      assert.ok(applyHit(world, offence, hero, BOLT, AWAY));
      assert.ok(hero.alive);
      hero.life = hero.maxLife;
      next += BOLT.cooldown;
    }
    stepWorld(world, [{ type: 'move', held: true, dest }], DT);
    if (hero.motion === 'knocked') held += DT;
  }
  assert.ok(held / SPAM.seconds < SPAM.mostHeld, `held ${(held / SPAM.seconds).toFixed(2)} of the time`);
  assert.ok(start.x - hero.pos.x > 1, 'the hero made ground against the bolts');
});

function graced(world: World, hero: PlayerState): boolean | null {
  const hit: WorldEvent | undefined = world.events.findLast((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === hero.id);
  return hit?.type === 'damage' ? hit.shoveGraced : null;
}

void test('the hit says when the grace turned its shove away, so the hero does not reel from a shove that never moved it', (): void => {
  const { world, hero, rival }: Pair = pair(33);
  world.events = [];
  applyHit(world, offenceOf(rival), hero, BOLT, AWAY);
  assert.equal(graced(world, hero), false);
  applyHit(world, offenceOf(rival), hero, BOLT, { x: -1, z: 0 });
  assert.equal(graced(world, hero), true);
});

void test('a hero hit that carries no push starts no grace, even while the hero still slides from an earlier shove', (): void => {
  const { world, hero, rival }: Pair = pair(35);
  const tap: SkillDef = { ...BOLT, knockback: 0 };
  world.events = [];
  hero.knock.x = BOLT.knockback;
  hero.life = hero.maxLife;
  assert.ok(applyHit(world, offenceOf(rival), hero, tap, AWAY));
  assert.equal(graceOf(hero), 0);
  assert.equal(graced(world, hero), false);
  hero.life = hero.maxLife;
  assert.ok(applyHit(world, offenceOf(rival), hero, BOLT, AWAY));
  assert.ok(graceOf(hero) > 0, 'the real bolt after the tap still shoves and starts the grace');
});

void test('a monster shoves a hero inside the grace and starts none of its own, so fights against monsters are unchanged', (): void => {
  const { world, hero, rival }: Pair = pair(34);
  const brute: MonsterState = spawnMonster(world, BRUTE, world.nextPackId, { x: hero.pos.x + 1, z: hero.pos.z }, { summonerId: null, scatter: 0, revived: false, level: monsterLevel(world) });
  const strike = (striker: MonsterState | PlayerState, skill: SkillDef): void => {
    hero.life = hero.maxLife;
    assert.ok(applyHit(world, offenceOf(striker), hero, skill, AWAY));
  };
  world.events = [];
  strike(brute, HAYMAKER);
  assert.ok(speed(hero) > 0);
  assert.equal(graceOf(hero), 0);
  strike(rival, BOLT);
  assert.ok(graceOf(hero) > 0);
  const sliding: number = speed(hero);
  strike(brute, HAYMAKER);
  assert.equal(graced(world, hero), false);
  assert.ok(speed(hero) > sliding, 'the brute still shoves the hero during the grace');
});
