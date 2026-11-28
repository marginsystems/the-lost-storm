import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must, worldIn } from '../../test/support.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { stepWorld } from '../world/step.ts';
import { enterZone } from '../world/zones.ts';
import type { Command, ItemInstance, PlayerState, World, WorldEvent } from '../world/types.ts';
import type { Action } from './contract.ts';
import { NO_ACTION } from './contract.ts';
import { DUEL } from './duel.ts';
import { observe } from './observe.ts';
import type { RivalDuel, RivalPilot } from './rival.ts';
import { RIVAL, rivalCommands, rivalContext, rivalHeard, rivalOf, startRivalDuel } from './rival.ts';

const CONTENT: Content = ringContent(loadContent());
const FRAME: number = 1 / 60;
const STRIKE: Action = { move: 0, skill: 1, target: 0, use: 0 };

interface Played {
  readonly sent: Command[];
  readonly decisions: number;
}

function play(world: World, duel: RivalDuel, pilot: RivalPilot, seconds: number): Played {
  const sent: Command[] = [];
  let decisions: number = 0;
  const counted: RivalPilot = (obs: Float32Array, mask: Uint8Array): Action => {
    decisions += 1;
    return pilot(obs, mask);
  };
  for (let time: number = 0; time < seconds; time += FRAME) {
    const commands: Command[] = rivalCommands(duel, world, counted, FRAME);
    sent.push(...commands);
    const events: WorldEvent[] = stepWorld(world, commands, FRAME);
    rivalHeard(duel, world, events);
  }
  return { sent, decisions };
}

function rival(world: World, duel: RivalDuel): PlayerState {
  return must(rivalOf(duel, world), 'rival');
}

void test('no rival comes outside a duel zone', (): void => {
  assert.equal(startRivalDuel(worldIn(CONTENT, 'hideout', 3), 3), null);
});

void test('the rival is a hostile hero of the player level in the standard kit, standing where the zone says', (): void => {
  for (const level of [1, 7, 20]) {
    const world: World = ringWorld(CONTENT, 11, level);
    const duel: RivalDuel = must(startRivalDuel(world, 11), 'duel');
    const hero: PlayerState = rival(world, duel);
    assert.equal(hero.level, level);
    assert.equal(duel.level, level);
    assert.equal(hero.party, DUEL.rivalParty);
    assert.notEqual(hero.party, world.player.party);
    assert.equal(world.heroes.length, 2);
    const items: ItemInstance[] = Object.values(hero.equipped).map((item: ItemInstance | null): ItemInstance => must(item, 'duel equipment'));
    assert.equal(items.filter((item: ItemInstance): boolean => item.rarity === 'stormtouched').length, 3);
    assert.equal(items.filter((item: ItemInstance): boolean => item.rarity === 'rare').length, 4);
    assert.deepEqual(hero.pos, must(world.zone.duel, 'duel').rival);
    assert.deepEqual(observe(world, rivalContext(duel, world), hero).view.targets, [world.player]);
  }
});

void test('the same seed gives the same rival', (): void => {
  const first: RivalDuel = must(startRivalDuel(ringWorld(CONTENT, 4, 12), 4), 'first');
  const second: RivalDuel = must(startRivalDuel(ringWorld(CONTENT, 4, 12), 4), 'second');
  assert.deepEqual(first.build, second.build);
});

void test('the rival waits out the start, then decides once a decision time, and every order is its own', (): void => {
  const world: World = ringWorld(CONTENT, 5, 10);
  const duel: RivalDuel = must(startRivalDuel(world, 5), 'duel');
  assert.equal(play(world, duel, (): Action => STRIKE, RIVAL.startIn - 0.1).decisions, 0);
  const played: Played = play(world, duel, (): Action => STRIKE, 2);
  assert.ok(Math.abs(played.decisions - 2 / RIVAL.decisionTime) <= 2, `${played.decisions} decisions in 2 s`);
  assert.ok(played.sent.length > 0);
  assert.ok(played.sent.every((command: Command): boolean => command.by === duel.rivalId));
});

void test('felling the rival wins, and after the hold one leave takes the player home at full life with the rival gone', (): void => {
  const world: World = ringWorld(CONTENT, 6, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 6), 'duel');
  world.player.life = world.player.maxLife / 2;
  rival(world, duel).alive = false;
  rivalHeard(duel, world, []);
  assert.equal(duel.outcome, 'won');
  const played: Played = play(world, duel, (): Action => NO_ACTION, RIVAL.holdAfter + 0.5);
  assert.deepEqual(played.sent.filter((command: Command): boolean => command.type === 'leave_duel'), [{ type: 'leave_duel' }]);
  assert.equal(world.zone.id, RING.home.zone);
  assert.deepEqual(world.heroes, [world.player]);
  assert.ok(world.player.alive);
  assert.equal(world.player.life, world.player.maxLife);
});

void test('falling to the rival loses no experience and still ends at home, alive', (): void => {
  const world: World = ringWorld(CONTENT, 7, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 7), 'duel');
  world.player.xp = 50;
  world.player.life = 1;
  rival(world, duel).pos = { x: world.player.pos.x + 1, z: world.player.pos.z };
  play(world, duel, (): Action => STRIKE, RIVAL.startIn + 6);
  assert.equal(duel.outcome, 'lost');
  assert.equal(world.player.xp, 50);
  play(world, duel, (): Action => STRIKE, RIVAL.holdAfter + 0.5);
  assert.equal(world.zone.id, RING.home.zone);
  assert.ok(world.player.alive);
  assert.equal(world.player.xp, 50);
});

void test('walking out of the duel by its way home is no win, and sends no leave', (): void => {
  const world: World = ringWorld(CONTENT, 9, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 9), 'duel');
  enterZone(world, must(CONTENT.zones.get(RING.home.zone), 'home'), { type: 'exit', exit: RING.home.exit }, true);
  rivalHeard(duel, world, []);
  assert.equal(duel.outcome, 'left');
  assert.deepEqual(play(world, duel, (): Action => STRIKE, RIVAL.holdAfter + 0.5).sent, []);
});
