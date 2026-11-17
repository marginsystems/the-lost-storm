import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { arena, place } from '../../test/arena-support.ts';
import { loadContent } from '../content/content.ts';
import type { FactionDef, UnisonDef } from '../content/combat-types.ts';
import type { Content } from '../content/types.ts';
import { facingOf } from '../math.ts';
import { botFight, CAREFUL, createBot } from '../bot.ts';
import { refreshPlayer } from './character.ts';
import { kill } from './combat.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';
import { heldInUnison } from './unison.ts';

const shipped: Content = loadContent();
const keepers: FactionDef = must(shipped.factions.get('timekeepers'), 'timekeepers');
const unison: UnisonDef = must(keepers.unison, 'timekeepers act in unison');
const DT: number = 1 / 60;
const GROUP = { hero: { x: 4, z: 14 }, near: { x: 11, z: 14 }, members: [{ x: 18, z: 12 }, { x: 18.5, z: 14 }, { x: 18, z: 16 }], far: { x: 26, z: 26 } } as const;
const KINDS: readonly string[] = ['timekeeper_adept', 'timekeeper_binder', 'timekeeper_duelist'];

function byId(left: number, right: number): number {
  return left - right;
}

function withUnison(next: UnisonDef | null): Content {
  return { ...shipped, factions: new Map(shipped.factions).set(keepers.id, { ...keepers, unison: next }) };
}

function idle(world: World, kind: string, at: { readonly x: number; readonly z: number }): MonsterState {
  const member: MonsterState = place(world, kind, at);
  member.aggro = false;
  return member;
}

function trio(content: Content, seed: number = 3): World {
  const world: World = arena(seed, content);
  world.player.pos = { ...GROUP.hero };
  GROUP.members.forEach((at, index: number): void => {
    const member: MonsterState = idle(world, must(KINDS[index], 'kind'), at);
    member.facing = index;
  });
  world.events = [];
  return world;
}

function looks(events: readonly WorldEvent[]): Extract<WorldEvent, { readonly type: 'unison_look' }>[] {
  return events.filter((event: WorldEvent): event is Extract<WorldEvent, { readonly type: 'unison_look' }> => event.type === 'unison_look');
}

function approach(world: World): number {
  world.player.pos = { ...GROUP.near };
  for (let step: number = 0; step < 2 / DT; step += 1) {
    stepWorld(world, [], DT);
    if (world.monsters.some((member: MonsterState): boolean => member.aggro)) return step;
  }
  return -1;
}

function snapshot(world: World): string {
  return JSON.stringify(world.monsters.map((member: MonsterState) => [member.pos, member.facing, member.action?.phase ?? null, member.action?.timeLeft ?? null, member.life]));
}

function run(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < seconds / DT; step += 1) events.push(...stepWorld(world, [], DT));
  return events;
}

function places(world: World): string {
  return JSON.stringify(world.monsters.map((member: MonsterState) => member.pos));
}

void test('the first time the hero comes into view of three Timekeepers, all three turn to face him on the same step and hold the look, then go on as before and wake only when he comes close', (): void => {
  const world: World = trio(shipped);
  const first: WorldEvent[] = stepWorld(world, [], DT);
  const fired = looks(first);
  assert.equal(fired.length, 1);
  assert.deepEqual(must(fired[0], 'look').monsterIds.toSorted(byId), world.monsters.map((member: MonsterState): number => member.id).toSorted(byId));
  for (const member of world.monsters) {
    assert.ok(!member.aggro, 'the look woke a Timekeeper the hero was too far from');
    assert.ok(Math.abs(member.unison.lookUntil - (world.time + unison.look)) < 1e-9);
    assert.ok(Math.abs(member.facing - facingOf({ x: world.player.pos.x - member.pos.x, z: world.player.pos.z - member.pos.z })) < 1e-9);
  }
  const held: string = places(world);
  const release: number = world.time + unison.look;
  while (world.time + DT < release) {
    stepWorld(world, [], DT);
    assert.equal(places(world), held, 'a Timekeeper moved during the look');
    assert.ok(world.monsters.every((member: MonsterState): boolean => heldInUnison(world, member) && member.action === null), 'a Timekeeper let go of the look early or acted during it');
  }
  const after: WorldEvent[] = run(world, 3);
  assert.ok(world.monsters.every((member: MonsterState): boolean => !member.aggro && !heldInUnison(world, member)));
  assert.equal(looks(after).length, 0, 'the look fired a second time');
  assert.ok(approach(world) >= 0, 'they never woke when the hero came close');
  const fight: WorldEvent[] = run(world, 4);
  assert.equal(looks(fight).length, 0, 'the look fired again once they woke');
  assert.notEqual(places(world), held, 'they never acted after the look');
});

void test('one Timekeeper alone, or the Reckoner alone, wakes without the look, and the Reckoner turns with any other in sight', (): void => {
  const lone: World = arena(5, shipped);
  lone.player.pos = { ...GROUP.hero };
  idle(lone, 'timekeeper_adept', GROUP.members[1]);
  lone.events = [];
  assert.ok(approach(lone) >= 0);
  assert.equal(looks(lone.events).length, 0);
  const boss: World = arena(5, shipped);
  boss.player.pos = { ...GROUP.hero };
  idle(boss, 'timekeeper_gatekeeper', GROUP.members[1]);
  boss.events = [];
  assert.ok(approach(boss) >= 0);
  assert.equal(looks(boss.events).length, 0);
  const pair: World = arena(5, shipped);
  pair.player.pos = { ...GROUP.hero };
  idle(pair, 'timekeeper_gatekeeper', GROUP.members[1]);
  idle(pair, 'timekeeper_binder', GROUP.members[0]);
  pair.events = [];
  assert.ok(approach(pair) >= 0);
  assert.equal(must(looks(pair.events)[0], 'the Reckoner and the binder look together').monsterIds.length, 2);
});

void test('when one Timekeeper dies, every other within range flinches on the same step without damage, holding whatever it was doing, and one out of range does not', (): void => {
  const world: World = trio(shipped);
  const stray: MonsterState = idle(world, 'timekeeper_adept', GROUP.far);
  approach(world);
  for (let step: number = 0; step < 6 / DT && !world.monsters.some((member: MonsterState): boolean => member.action !== null && member.id !== stray.id); step += 1) stepWorld(world, [], DT);
  const [fallen, ...rest] = world.monsters.filter((member: MonsterState): boolean => member.id !== stray.id);
  const dying: MonsterState = must(fallen, 'a Timekeeper to fall');
  world.events = [];
  kill(world, dying, { x: 1, z: 0 });
  const flinched = world.events.find((event: WorldEvent): event is Extract<WorldEvent, { readonly type: 'unison_flinch' }> => event.type === 'unison_flinch');
  assert.deepEqual(must(flinched, 'a shared flinch').monsterIds.toSorted(byId), rest.map((member: MonsterState): number => member.id).toSorted(byId));
  assert.equal(stray.unison.flinchUntil, 0);
  const before: string = snapshot({ ...world, monsters: rest });
  for (const member of rest) assert.equal(member.unison.flinchUntil, world.time + unison.flinch);
  const release: number = world.time + unison.flinch;
  for (let step: number = 0; world.time + DT < release; step += 1) stepWorld(world, [], DT);
  assert.ok(rest.every((member: MonsterState): boolean => heldInUnison(world, member)));
  assert.equal(snapshot({ ...world, monsters: rest }), before, 'a flinching Timekeeper moved, acted or lost life');
});

void test('with the look and the flinch set to nothing, a Timekeeper fight plays out step for step as it does for a people that does not act in unison', (): void => {
  const plain: World = trio(withUnison(null), 7);
  const still: World = trio(withUnison({ ...unison, look: 0, flinch: 0 }), 7);
  plain.player.pos = { ...GROUP.near };
  still.player.pos = { ...GROUP.near };
  for (let step: number = 0; step < 8 / DT; step += 1) {
    stepWorld(plain, [], DT);
    stepWorld(still, [], DT);
    assert.equal(snapshot(still), snapshot(plain), `the fights parted at step ${String(step)}`);
  }
});

const MEASURE = { seeds: 8, level: 4, settle: 1.5, worst: 0.12 } as const;

function mean(fights: readonly { readonly seconds: number }[]): number {
  return fights.reduce((sum: number, fight): number => sum + fight.seconds, 0) / fights.length;
}

function measured(content: Content, seed: number): { readonly won: boolean; readonly seconds: number } {
  const world: World = trio(content, seed);
  world.rng.reseed(seed);
  world.player.level = MEASURE.level;
  refreshPlayer(world);
  world.player.life = world.player.stats.maxLife;
  run(world, MEASURE.settle);
  for (const member of world.monsters) member.facing = facingOf({ x: world.player.pos.x - member.pos.x, z: world.player.pos.z - member.pos.z });
  approach(world);
  const start: number = world.time;
  const done = (): boolean => !world.player.alive || world.monsters.every((member: MonsterState): boolean => !member.alive);
  botFight(createBot(world, CAREFUL), done, null);
  return { won: world.player.alive && done(), seconds: world.time - start };
}

void test('a careful hero wins the same Timekeeper fights with the unison as without it, and the shared flinch lengthens them only a little', (): void => {
  const seeds: number[] = Array.from({ length: MEASURE.seeds }, (_, index: number): number => index + 1);
  const plain = seeds.map((seed: number) => measured(withUnison(null), seed));
  const together = seeds.map((seed: number) => measured(shipped, seed));
  assert.deepEqual(together.map((fight): boolean => fight.won), plain.map((fight): boolean => fight.won));
  const longer: number = mean(together) / mean(plain) - 1;
  assert.ok(Math.abs(longer) <= MEASURE.worst, `the unison changed the mean fight by ${(longer * 100).toFixed(1)}%`);
});
