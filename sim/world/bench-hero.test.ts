import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { createRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
import { worldIn } from '../../test/support.ts';
import { readyBenchHero, refillHero } from './bench-hero.ts';
import { MAX_STEP, stepWorld } from './step.ts';
import type { World, WorldEvent } from './types.ts';

const content: Content = loadContent();

void test('a bench hero reaches the asked level with the asked bar and full life and mana', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  const unknown: readonly string[] = readyBenchHero(world, { seed: 11, level: 12, weapon: 'cairn_maul', bar: ['forkline', 'thunderclap', 'squall', 'downdraught', 'standing_storm', 'fire_burst'] });
  assert.deepEqual(unknown, []);
  assert.equal(world.player.level, 12);
  assert.deepEqual(world.player.bar, ['forkline', 'thunderclap', 'squall', 'downdraught', 'standing_storm', 'fire_burst']);
  assert.deepEqual(world.player.skills.map((skill: SkillDef | null): string | null => skill?.id ?? null).slice(1, 4), ['thunderclap', 'squall', 'downdraught']);
  assert.equal(world.player.equipped.weapon?.base, 'cairn_maul');
  assert.equal(world.player.wielding, 'heavy');
  assert.equal(world.player.life, world.player.maxLife);
  assert.equal(world.player.mana, world.player.stats.maxMana);
});

void test('the bench command readies the hero inside a step and tells the renderer', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  const events: WorldEvent[] = stepWorld(world, [{ type: 'bench', hero: { seed: 5, level: 4, weapon: 'iron_maul', bar: ['forkline'] } }], MAX_STEP);
  assert.equal(world.player.level, 4);
  assert.equal(world.player.bar[0], 'forkline');
  assert.equal(world.player.equipped.weapon?.base, 'iron_maul');
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'character_changed'));
});

void test('a bench hero is reseeded so two benches roll the same numbers', (): void => {
  const first: World = worldIn(content, 'hall_of_time', 3);
  const second: World = worldIn(content, 'hall_of_time', 99);
  readyBenchHero(first, { seed: 7, level: 2, weapon: null, bar: [] });
  readyBenchHero(second, { seed: 7, level: 2, weapon: null, bar: [] });
  const reference: Rng = createRng(7);
  const expected: number = reference.next();
  assert.equal(first.rng.next(), expected);
  assert.equal(second.rng.next(), expected);
});

void test('an unknown skill is reported and leaves its slot empty', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  const unknown: readonly string[] = readyBenchHero(world, { seed: 1, level: 1, weapon: 'no_such_weapon', bar: ['no_such_skill', 'thunderclap'] });
  assert.deepEqual(unknown, ['no_such_skill', 'no_such_weapon']);
  assert.equal(world.player.bar[0], null);
  assert.equal(world.player.bar[1], 'thunderclap');
});

void test('assigning a travel skill to a bench slot leaves its extra home slot empty', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  readyBenchHero(world, { seed: 1, level: 1, weapon: null, bar: [null, 'ember_swift'] });
  assert.deepEqual(world.player.bar, [null, 'ember_swift', null, null, null, null, null]);
});

void test('refilling tops a hurt hero back up and leaves a dead one dead', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  world.player.life = 1;
  world.player.mana = 0;
  refillHero(world);
  assert.equal(world.player.life, world.player.maxLife);
  assert.equal(world.player.mana, world.player.stats.maxMana);
  world.player.alive = false;
  world.player.life = 0;
  refillHero(world);
  assert.equal(world.player.life, 0);
});
