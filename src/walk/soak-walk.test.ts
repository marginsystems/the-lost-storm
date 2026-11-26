import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { Command, World } from '../../sim/world/types.ts';
import { enterZone } from '../../sim/world/zones.ts';
import type { WalkStep } from './body-walk.ts';
import type { SoakLap } from './soak-walk.ts';
import { pathTo, SOAK_WALK, soakLap, soakRoute } from './soak-walk.ts';

const content: Content = loadContent();

function freshWorld(): World {
  return createWorld(content, { seed: 7, save: null, opening: true });
}

void test('one soak lap reaches every permanent zone and comes back to where it started, each exit leading on to the next step', (): void => {
  const route = soakRoute(content);
  assert.deepEqual(route.problems, []);
  const permanent: string[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.flash === null).map((zone: ZoneDef): string => zone.id);
  assert.deepEqual([...route.zones].toSorted(), permanent.toSorted());
  assert.equal(route.steps[0]?.from, SOAK_WALK.start);
  assert.equal(route.steps.at(-1)?.exit.to, SOAK_WALK.start);
  route.steps.forEach((step: WalkStep, index: number): void => {
    const next: WalkStep | undefined = route.steps[index + 1];
    if (next !== undefined) assert.equal(step.exit.to, next.from);
    assert.equal(content.zones.get(step.from)?.exits.includes(step.exit), true);
  });
  assert.equal(route.steps.length, 2 * (permanent.length - 1));
});

void test('a soak from a missing zone says so, and one from the deepest zone still reaches them all', (): void => {
  assert.deepEqual(soakRoute(content, 'no_such_zone').problems, ['there is no zone no_such_zone to start the soak from']);
  const route = soakRoute(content, 'ledger_court');
  assert.deepEqual(route.problems, []);
  const stranded: ZoneDef = { ...must(content.zones.get('hideout'), 'hideout'), id: 'island', exits: [] };
  const zones = new Map(content.zones).set(stranded.id, stranded);
  assert.deepEqual(soakRoute({ ...content, zones }).problems, ['the soak never reaches island: no way there and back from hall_of_time']);
});

void test('the way to the start is the shortest chain of exits, and none leads to a zone that is not there', (): void => {
  assert.deepEqual(
    pathTo(content, 'between', SOAK_WALK.start)?.map((step: WalkStep): string => step.exit.to),
    [SOAK_WALK.start],
  );
  assert.deepEqual(pathTo(content, SOAK_WALK.start, SOAK_WALK.start), []);
  assert.equal(pathTo(content, SOAK_WALK.start, 'no_such_zone'), null);
});

void test('a lap from the opening walks into the hall and then the whole tour, keeping the hero alive', async (): Promise<void> => {
  const world: World = freshWorld();
  const travel = (command: Command): void => {
    if (command.type !== 'travel') return;
    const exit = must(world.zone.exits.find((candidate): boolean => candidate.id === command.exit), command.exit);
    const zone: ZoneDef = must(content.zones.get(exit.to), exit.to);
    enterZone(world, zone, { type: 'start' });
    world.player.life = 1;
  };
  const slept: number[] = [];
  const lap: SoakLap = await soakLap({ world, scene: new Group(), send: travel, sleep: (ms: number): Promise<void> => {
    slept.push(ms);
    return Promise.resolve();
  } });
  assert.deepEqual(lap.problems, []);
  assert.equal(lap.ok, true);
  assert.equal(lap.visits, 1 + soakRoute(content).steps.length);
  assert.equal(world.zone.id, SOAK_WALK.start);
  assert.equal(world.player.life, world.player.maxLife);
  assert.ok(slept.every((ms: number): boolean => ms === SOAK_WALK.pollMs));
});

void test('a travel the world holds back is sent again until it goes through', async (): Promise<void> => {
  const world: World = freshWorld();
  let refused: number = 3;
  const sent: Command[] = [];
  const travel = (command: Command): void => {
    sent.push(command);
    if (command.type !== 'travel') return;
    if (refused > 0) {
      refused -= 1;
      return;
    }
    const exit = must(world.zone.exits.find((candidate): boolean => candidate.id === command.exit), command.exit);
    enterZone(world, must(content.zones.get(exit.to), exit.to), { type: 'start' });
  };
  const lap: SoakLap = await soakLap({ world, scene: new Group(), send: travel, sleep: (): Promise<void> => Promise.resolve() });
  assert.equal(lap.ok, true);
  assert.equal(sent.length, lap.visits + 3);
});

void test('the hero is put on the exit where the world placed it, not where the data first drew it', async (): Promise<void> => {
  const world: World = freshWorld();
  world.zone = { ...world.zone, exits: world.zone.exits.map((exit) => ({ ...exit, x: exit.x * 10, z: exit.z * 10 })) };
  const at: { x: number; z: number }[] = [];
  const lap: SoakLap = await soakLap({ world, scene: new Group(), send: (command: Command): void => {
    if (command.type === 'travel' && at.length === 0) at.push({ x: world.player.pos.x, z: world.player.pos.z });
  }, sleep: (): Promise<void> => Promise.resolve() });
  const data = must(content.zones.get('between')?.exits[0], 'the opening exit');
  assert.equal(lap.ok, false);
  assert.deepEqual(at, [{ x: data.x * 10, z: data.z * 10 }]);
});

void test('a lap stops at an exit that never arrives and says where', async (): Promise<void> => {
  const world: World = freshWorld();
  const lap: SoakLap = await soakLap({ world, scene: new Group(), send: (): void => undefined, sleep: (): Promise<void> => Promise.resolve() });
  assert.equal(lap.ok, false);
  assert.equal(lap.visits, 0);
  assert.deepEqual(lap.problems, ['travel through into_the_hall never reached hall_of_time']);
});
