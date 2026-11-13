import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ZoneEncounter } from '../content/story-types.ts';
import type { Content, ZoneDef, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { questState } from './conditions.ts';
import { createWorld } from './create.ts';
import { shoreDepth } from './shore.ts';
import { hudHidden } from './hud.ts';
import { stepWorld } from './step.ts';
import { wakeLength } from './wake.ts';
import type { Command, GroundItem, ItemInstance, World } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const opening: ZoneDef = must(content.zones.get(must(content.world.opening, 'opening zone')), 'opening');
const rules = must(opening.void, 'void rules');
const journalFind: ZoneEncounter = must(
  rules.encounters.find((met: ZoneEncounter): boolean => met.find.type === 'item'),
  'item encounter',
);
const lightFind: ZoneEncounter = must(
  rules.encounters.find((met: ZoneEncounter): boolean => met.find.type === 'exit'),
  'exit encounter',
);

const WALK = {
  lead: 6,
  findWithin: { min: 20, max: 40 },
  limit: 90,
} as const;

function fresh(seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: true });
  const wake = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / DT) + 1; step += 1) stepWorld(world, [], DT);
  return world;
}

function walk(world: World, dir: Vec2): Command {
  return { type: 'move', held: true, dest: { x: world.player.pos.x + dir.x * WALK.lead, z: world.player.pos.z + dir.z * WALK.lead } };
}

function found(world: World): GroundItem | null {
  return world.ground.find((ground: GroundItem): boolean => ground.find === journalFind.id) ?? null;
}

function walkUntil(world: World, dir: Vec2, done: () => boolean): number {
  let seconds: number = 0;
  while (!done() && seconds < WALK.limit) {
    stepWorld(world, [walk(world, dir)], DT);
    seconds += DT;
  }
  return seconds;
}

function walkTo(world: World, target: () => Vec2, done: () => boolean): void {
  let seconds: number = 0;
  while (!done() && seconds < WALK.limit) {
    stepWorld(world, [{ type: 'move', held: true, dest: target() }], DT);
    seconds += DT;
  }
}

function clickLight(world: World): void {
  stepWorld(world, [{ type: 'travel', exit: lightExit(world).id }], DT);
  for (let seconds: number = 0; world.zone.id === opening.id && seconds < WALK.limit; seconds += DT) stepWorld(world, [], DT);
}

function carriesJournal(world: World): boolean {
  return world.player.inventory.some((item: ItemInstance | null): boolean => item !== null && (content.itemBases.get(item.base)?.book ?? null) !== null);
}

function lightExit(world: World): ZoneExit {
  return must(
    world.zone.exits.find((exit: ZoneExit): boolean => lightFind.find.type === 'exit' && exit.id === lightFind.find.exit),
    'light exit',
  );
}

void test('a new game opens in the void, with the town quest held back and the HUD hidden', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null, opening: true });
  assert.equal(world.zone.id, opening.id);
  assert.notEqual(world.wake, null);
  assert.equal(world.flags['opening'], 'begun');
  assert.equal(questState(world, 'out_of_the_mist'), 'locked');
  assert.equal(hudHidden(world), true);
  const plain: World = createWorld(content, { seed: 1, save: null });
  assert.equal(plain.zone.id, content.world.start);
  assert.equal(questState(plain, 'out_of_the_mist'), 'active');
});

void test('walking any way finds the journal ahead after twenty to forty seconds', (): void => {
  for (const dir of [{ x: 1, z: 0 }, { x: -0.6, z: 0.8 }, { x: 0, z: -1 }]) {
    const world: World = fresh(2);
    const seconds: number = walkUntil(world, dir, (): boolean => {
      const ground: GroundItem | null = found(world);
      return ground !== null && distance(ground.pos, world.player.pos) < 1.5;
    });
    assert.ok(seconds >= WALK.findWithin.min && seconds <= WALK.findWithin.max, `${seconds.toFixed(1)} s walking ${dir.x},${dir.z}`);
  }
});

void test('turning away from the journal brings it back in front of the hero', (): void => {
  const world: World = fresh(3);
  walkUntil(world, { x: 1, z: 0 }, (): boolean => found(world) !== null);
  const first: Vec2 = { ...must(found(world), 'journal').pos };
  assert.ok(first.x > world.player.pos.x);
  walkUntil(world, { x: -1, z: 0 }, (): boolean => must(found(world), 'journal').pos.x < world.player.pos.x);
  const again: GroundItem = must(found(world), 'journal again');
  assert.ok(again.pos.x < world.player.pos.x);
  assert.equal(world.ground.filter((ground: GroundItem): boolean => ground.find !== null).length, 1);
});

void test('taking the journal is the first choice and brings the HUD; reading it shows the light and starts the quest, the blade is taken with a click, and the light leads on to the first moment', (): void => {
  const world: World = fresh(4);
  walkUntil(world, { x: 0, z: 1 }, (): boolean => found(world) !== null);
  const journal: GroundItem = must(found(world), 'journal');
  stepWorld(world, [{ type: 'pickup', groundId: journal.id }], DT);
  for (let step: number = 0; step < WALK.limit / DT && !carriesJournal(world); step += 1) stepWorld(world, [], DT);
  assert.ok(carriesJournal(world));
  assert.equal(world.flags['first_choice'], 'took_journal');
  assert.equal(questState(world, 'out_of_the_mist'), 'locked');
  assert.equal(hudHidden(world), false);
  const page: string = must(must(content.books.get('journal'), 'journal book').pages[0], 'page').id;
  stepWorld(world, [{ type: 'read', book: 'journal', page }], DT);
  assert.equal(world.flags['opening'], 'read');
  assert.equal(questState(world, 'out_of_the_mist'), 'active');
  assert.equal(questState(world, 'to_the_waystation'), 'locked');
  assert.equal(hudHidden(world), false);
  stepWorld(world, [], DT);
  assert.ok(distance(lightExit(world), world.player.pos) > lightExit(world).radius);
  walkUntil(world, world.heading, (): boolean => shoreDepth(world) >= 1);
  assert.equal(world.zone.id, opening.id);
  assert.equal(hudHidden(world), false);
  walkUntil(world, world.heading, (): boolean => world.ground.some((ground: GroundItem): boolean => ground.find === 'blade'));
  assert.equal(world.flags['first_blade'], undefined);
  takeBlade(world);
  assert.equal(world.player.equipped.weapon?.base, 'rusted_blade');
  assert.equal(world.zone.id, opening.id);
  clickLight(world);
  assert.equal(world.zone.id, content.world.start);
  stepWorld(world, [], DT);
  assert.equal(questState(world, 'out_of_the_mist'), 'done');
  assert.equal(questState(world, 'the_first_taker'), 'active');
  assert.equal(questState(world, 'to_the_waystation'), 'locked');
});

void test('reading needs the book in the pack, and an unknown page does nothing', (): void => {
  const world: World = fresh(5);
  stepWorld(world, [{ type: 'read', book: 'journal', page: 'do_not' }], DT);
  assert.equal(world.flags['opening'], 'begun');
});

const HELD = {
  idle: 5,
  hold: 5,
  release: 0.3,
  tick: 0.09,
  legs: 40,
  mouse: { x: 4.6, z: -1.4 },
  near: 1.5,
  circle: { radius: 3, turn: 1.6 },
} as const;

function tookJournal(world: World): boolean {
  return world.flags['first_choice'] !== undefined;
}

const SEEN = {
  within: 20,
  limit: 60,
} as const;

function laidInView(world: World): boolean {
  const ground: GroundItem | null = found(world);
  return ground !== null && distance(ground.pos, world.player.pos) <= SEEN.within;
}

function takeBlade(world: World): void {
  for (let seconds: number = 0; world.player.equipped.weapon === null && seconds < WALK.limit; seconds += DT) {
    const blade: GroundItem | undefined = world.ground.find((ground: GroundItem): boolean => ground.find === 'blade');
    stepWorld(world, [blade === undefined ? walk(world, world.heading) : { type: 'pickup', groundId: blade.id }], DT);
  }
}

function holdFor(world: World, seconds: number, aim: (at: number) => Vec2, start: number): number {
  let clock: number = start;
  let next: number = start;
  for (let spent: number = 0; spent < seconds && !laidInView(world); spent += DT) {
    const commands: Command[] = [];
    if (clock >= next) {
      commands.push({ type: 'move', held: true, dest: aim(clock) });
      next = clock + HELD.tick;
    }
    stepWorld(world, commands, DT);
    clock += DT;
  }
  return clock;
}

function idleFor(world: World, seconds: number, start: number): number {
  for (let spent: number = 0; spent < seconds; spent += DT) stepWorld(world, [], DT);
  return start + seconds;
}

function beside(world: World, offset: Vec2): () => Vec2 {
  return (): Vec2 => ({ x: world.player.pos.x + offset.x, z: world.player.pos.z + offset.z });
}

void test('holding the button at one screen point, in five-second legs, lays the journal in view but never takes it', (): void => {
  const world: World = fresh(31);
  let clock: number = idleFor(world, HELD.idle, 0);
  for (let leg: number = 0; leg < HELD.legs && !laidInView(world); leg += 1) {
    clock = holdFor(world, HELD.hold, beside(world, HELD.mouse), clock);
    clock = idleFor(world, HELD.release, clock);
  }
  assert.ok(laidInView(world));
  assert.ok(clock < HELD.idle + SEEN.limit);
  holdFor(world, HELD.hold, beside(world, HELD.mouse), clock);
  assert.equal(tookJournal(world), false);
});

void test('walking in a small circle still lays the journal in view once he has moved far enough', (): void => {
  const world: World = fresh(32);
  const around = (at: number): Vec2 => ({ x: world.player.pos.x + Math.cos(at * HELD.circle.turn) * HELD.circle.radius, z: world.player.pos.z + Math.sin(at * HELD.circle.turn) * HELD.circle.radius });
  holdFor(world, SEEN.limit, around, 0);
  assert.ok(laidInView(world));
  assert.equal(tookJournal(world), false);
});

void test('holding a point right beside the hero still lays the journal in view, and it stays on the ground', (): void => {
  const world: World = fresh(33);
  holdFor(world, SEEN.limit, beside(world, { x: HELD.near, z: 0 }), 0);
  assert.ok(laidInView(world));
  assert.equal(tookJournal(world), false);
});

void test('a hero who never walks onto the light is brought to it after its latest time of movement, and still crosses only when he clicks it', (): void => {
  const world: World = fresh(34);
  world.flags['opening'] = 'read';
  world.flags['first_choice'] = 'took_journal';
  world.flags['first_blade'] = 'found';
  const around = (at: number): Vec2 => ({ x: world.player.pos.x + Math.cos(at * HELD.circle.turn) * HELD.circle.radius, z: world.player.pos.z + Math.sin(at * HELD.circle.turn) * HELD.circle.radius });
  let clock: number = 0;
  let next: number = 0;
  for (; clock < must(lightFind.latest, 'light latest') + HELD.hold && world.zone.id === opening.id; clock += DT) {
    const commands: Command[] = clock >= next ? [{ type: 'move', held: true, dest: around(clock) }] : [];
    if (commands.length > 0) next = clock + HELD.tick;
    stepWorld(world, commands, DT);
  }
  assert.equal(world.zone.id, opening.id);
  assert.ok(distance(lightExit(world), world.player.pos) <= lightExit(world).radius + HELD.circle.radius);
  clickLight(world);
  assert.notEqual(world.zone.id, opening.id);
  assert.deepEqual(world.shift, { x: 0, z: 0 });
});

const PATTERN = {
  swing: 2,
  reach: 6,
  clickEvery: 0.5,
  edgeInside: 0.3,
} as const;

void test('walking back and forth finds the journal', (): void => {
  const world: World = fresh(35);
  const along: Vec2 = world.heading;
  const swing = (at: number): Vec2 => {
    const sign: number = Math.floor(at / PATTERN.swing) % 2 === 0 ? 1 : -1;
    return { x: world.player.pos.x + along.x * PATTERN.reach * sign, z: world.player.pos.z + along.z * PATTERN.reach * sign };
  };
  holdFor(world, SEEN.limit, swing, 0);
  assert.ok(laidInView(world));
  assert.equal(tookJournal(world), false);
});

void test('clicking ahead every half second lays the journal in view without taking it', (): void => {
  const world: World = fresh(36);
  let next: number = 0;
  for (let clock: number = 0; clock < SEEN.limit && !laidInView(world); clock += DT) {
    const click: Command[] = clock >= next ? [{ type: 'move', held: false, dest: { x: world.player.pos.x + HELD.mouse.x, z: world.player.pos.z + HELD.mouse.z } }] : [];
    if (click.length > 0) next = clock + PATTERN.clickEvery;
    stepWorld(world, click, DT);
  }
  assert.ok(laidInView(world));
  assert.equal(tookJournal(world), false);
});

function readOnTheShore(seed: number): World {
  const world: World = fresh(seed);
  world.flags['first_choice'] = 'took_journal';
  world.flags['opening'] = 'read';
  return world;
}

void test('the light waits for the blade, so nobody reaches the Hall unarmed', (): void => {
  const world: World = readOnTheShore(37);
  for (let step: number = 0; step < 60 / DT; step += 1) stepWorld(world, [], DT);
  assert.equal(world.encounters.some((state): boolean => state.id === lightFind.id && state.pos !== null), false);
  takeBlade(world);
  clickLight(world);
  assert.notEqual(world.zone.id, opening.id);
  assert.equal(world.player.equipped.weapon?.base, 'rusted_blade');
});

void test('walking into the light and stopping in it never carries the hero through; only a click on it does', (): void => {
  const world: World = readOnTheShore(38);
  takeBlade(world);
  stepWorld(world, [], DT);
  const exit = lightExit(world);
  const toward: Vec2 = { x: world.player.pos.x - exit.x, z: world.player.pos.z - exit.z };
  const away: number = Math.hypot(toward.x, toward.z);
  const edge: number = exit.radius - PATTERN.edgeInside;
  const stop: Vec2 = { x: exit.x + (toward.x / away) * edge, z: exit.z + (toward.z / away) * edge };
  walkTo(world, (): Vec2 => stop, (): boolean => world.zone.id !== opening.id || distance(world.player.pos, stop) < 0.2);
  walkTo(world, (): Vec2 => exit, (): boolean => world.zone.id !== opening.id || distance(world.player.pos, exit) < 0.2);
  for (let step: number = 0; step < 10 && world.zone.id === opening.id; step += 1) stepWorld(world, [], DT);
  assert.equal(world.zone.id, opening.id);
  clickLight(world);
  assert.notEqual(world.zone.id, opening.id);
});
