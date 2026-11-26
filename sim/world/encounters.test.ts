import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ZoneEncounter } from '../content/story-types.ts';
import type { Content, ZoneDef, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { allHold, questState } from './conditions.ts';
import { createWorld } from './create.ts';
import { fromShore, shoreDepth } from './shore.ts';
import { hudHidden } from './hud.ts';
import { stepWorld } from './step.ts';
import { beginVoid, wakeLength } from './wake.ts';
import type { Command, EncounterState, GroundItem, ItemInstance, World } from './types.ts';

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

const SHORE_LIGHT = {
  still: 0.01,
  near: 1,
  behind: 4,
  wait: 3,
} as const;

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

function onShore(world: World, point: Vec2): Vec2 {
  const shore = must(world.shore, 'shore');
  const dx: number = point.x - shore.at.x;
  const dz: number = point.z - shore.at.z;
  return { x: dx * shore.facing.z - dz * shore.facing.x, z: dx * shore.facing.x + dz * shore.facing.z };
}

void test('while the hero is on the shore the light stands at the end of the road and never moves, however long he wanders, and he still crosses only when he clicks it', (): void => {
  const world: World = fresh(34);
  world.flags['opening'] = 'read';
  world.flags['first_choice'] = 'took_journal';
  world.flags['first_blade'] = 'found';
  const anchor: Vec2 = must(lightFind.shoreAt, 'light shore point');
  const around = (at: number): Vec2 => ({ x: world.player.pos.x + Math.cos(at * HELD.circle.turn) * HELD.circle.radius, z: world.player.pos.z + Math.sin(at * HELD.circle.turn) * HELD.circle.radius });
  let clock: number = 0;
  let next: number = 0;
  let seen: Vec2 | null = null;
  for (; clock < must(lightFind.latest, 'light latest') + HELD.hold && world.zone.id === opening.id; clock += DT) {
    const commands: Command[] = clock >= next ? [{ type: 'move', held: true, dest: around(clock) }] : [];
    if (commands.length > 0) next = clock + HELD.tick;
    stepWorld(world, commands, DT);
    if (world.shore === null || (world.encounters.find((state): boolean => state.id === lightFind.id)?.pos ?? null) === null) continue;
    const at: Vec2 = onShore(world, lightExit(world));
    seen ??= at;
    assert.ok(distance(at, seen) < SHORE_LIGHT.still, `the light moved to ${String(at.x)}, ${String(at.z)} at ${String(clock)} s`);
  }
  assert.equal(world.zone.id, opening.id);
  assert.ok(seen !== null && distance(seen, anchor) < SHORE_LIGHT.near);
  assert.ok(distance(lightExit(world), world.player.pos) > lightExit(world).radius);
  walkTo(world, (): Vec2 => lightExit(world), (): boolean => distance(lightExit(world), world.player.pos) < lightExit(world).radius / 2);
  assert.ok(distance(lightExit(world), world.player.pos) < lightExit(world).radius);
  assert.equal(world.zone.id, opening.id);
  clickLight(world);
  assert.notEqual(world.zone.id, opening.id);
});

void test('a hero lost beyond the sides of the shore is still brought the light after its latest time of movement', (): void => {
  const world: World = fresh(36);
  world.flags['opening'] = 'read';
  world.flags['first_choice'] = 'took_journal';
  world.flags['first_blade'] = 'found';
  stepWorld(world, [], DT);
  const shore = must(world.shore, 'shore');
  const room = must(rules.shore?.room, 'shore room');
  world.player.pos = { x: shore.at.x + shore.facing.z * (room.half + WALK.lead), z: shore.at.z - shore.facing.x * (room.half + WALK.lead) };
  world.trail = { ...world.player.pos };
  const around = (at: number): Vec2 => ({ x: world.player.pos.x + Math.cos(at * HELD.circle.turn) * HELD.circle.radius, z: world.player.pos.z + Math.sin(at * HELD.circle.turn) * HELD.circle.radius });
  let next: number = 0;
  for (let clock: number = 0; clock < must(lightFind.latest, 'light latest') + HELD.hold; clock += DT) {
    const commands: Command[] = clock >= next ? [{ type: 'move', held: true, dest: around(clock) }] : [];
    if (commands.length > 0) next = clock + HELD.tick;
    stepWorld(world, commands, DT);
  }
  assert.ok(distance(lightExit(world), world.player.pos) <= lightExit(world).radius + HELD.circle.radius);
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

void test('the woman is laid a hand crossbow where the man is laid the blade, and it opens the same way on', (): void => {
  const world: World = createWorld(content, { seed: 41, save: null, opening: true, hero: 'woman' });
  const waking: number = Math.ceil(wakeLength(must(world.wake, 'wake').plan) / DT) + 1;
  for (let step: number = 0; step < waking; step += 1) stepWorld(world, [], DT);
  world.flags['first_choice'] = 'took_journal';
  world.flags['opening'] = 'read';
  for (let seconds: number = 0; world.player.equipped.weapon === null && seconds < WALK.limit; seconds += DT) {
    const laid: GroundItem | undefined = world.ground.find((ground: GroundItem): boolean => ground.find !== null && ground.find !== journalFind.id);
    stepWorld(world, [laid === undefined ? walk(world, world.heading) : { type: 'pickup', groundId: laid.id }], DT);
  }
  assert.equal(world.player.equipped.weapon?.base, 'worn_crossbow');
  assert.equal(world.ground.some((ground: GroundItem): boolean => ground.find === 'blade'), false);
  assert.equal(world.flags['first_blade'], 'found');
  assert.equal(must(world.player.skills[0], 'first skill').delivery.type, 'projectile');
  clickLight(world);
  assert.notEqual(world.zone.id, opening.id);
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

interface Heard {
  readonly type: 'encounter_nearing' | 'encounter_shown';
  readonly walked: number;
  readonly laid: boolean;
}

const HEARD = {
  seconds: 40,
  leg: 3,
  stepSlack: 1,
} as const;

function journalWalked(world: World): number {
  return world.encounters.find((state: EncounterState): boolean => state.id === journalFind.id)?.walked ?? -1;
}

function listen(world: World, dirAt: (seconds: number) => Vec2, seconds: number): Heard[] {
  const heard: Heard[] = [];
  for (let at: number = 0; at < seconds; at += DT) {
    for (const event of stepWorld(world, [walk(world, dirAt(at))], DT)) {
      if ((event.type === 'encounter_nearing' || event.type === 'encounter_shown') && event.encounter === journalFind.id) heard.push({ type: event.type, walked: journalWalked(world), laid: found(world) !== null });
    }
  }
  return heard;
}

void test('halfway along the walk that lays the journal the nearing moment comes once, then the moment the journal is laid it is shown once', (): void => {
  const nearing: number = must(journalFind.nearing, 'journal nearing share');
  const world: World = fresh(41);
  const heard: Heard[] = listen(world, (): Vec2 => ({ x: 1, z: 0 }), HEARD.seconds);
  assert.deepEqual(heard.map((entry: Heard): string => entry.type), ['encounter_nearing', 'encounter_shown']);
  const near: Heard = must(heard[0], 'nearing');
  const shown: Heard = must(heard[1], 'shown');
  const half: number = journalFind.after * nearing;
  assert.ok(near.walked >= half && near.walked < half + HEARD.stepSlack, `near at ${near.walked} m`);
  assert.equal(near.laid, false);
  assert.ok(shown.laid && shown.walked >= journalFind.after && shown.walked < journalFind.after + HEARD.stepSlack, `shown at ${shown.walked} m`);
});

void test('walking back and forth, and the journal moving back in front of him, never brings either moment twice', (): void => {
  const world: World = fresh(42);
  const heard: Heard[] = listen(world, (seconds: number): Vec2 => (Math.floor(seconds / HEARD.leg) % 2 === 0 ? { x: 0, z: 1 } : { x: 0, z: -1 }), HEARD.seconds * 2);
  assert.notEqual(found(world), null);
  assert.deepEqual(heard.map((entry: Heard): string => entry.type), ['encounter_nearing', 'encounter_shown']);
});

void test('a hero who already took the journal hears neither moment', (): void => {
  const world: World = fresh(43);
  world.flags['first_choice'] = 'took_journal';
  assert.deepEqual(listen(world, (): Vec2 => ({ x: 1, z: 0 }), HEARD.seconds), []);
});

void test('only the journal for the current visit to the mist draws near, until the hero takes it', (): void => {
  const world: World = fresh(41);
  const nearing = (): string[] => rules.encounters.filter((met: ZoneEncounter): boolean => met.nearing !== null && allHold(world, met.when)).map((met: ZoneEncounter): string => met.id);
  assert.deepEqual(nearing(), [journalFind.id]);
  world.flags['next_count'] = 'flashed';
  assert.deepEqual(nearing(), ['journal_again']);
  world.flags['second_choice'] = 'took_journal';
  assert.deepEqual(nearing(), []);
  delete world.flags['second_choice'];
  world.flags['first_choice'] = 'took_journal';
  assert.deepEqual(nearing(), []);
});

void test('a hero back from the Hall finds the light just behind him, and it stays there instead of going to the end of the road', (): void => {
  const world: World = fresh(37);
  world.flags['opening'] = 'read';
  world.flags['first_choice'] = 'took_journal';
  world.flags['first_blade'] = 'found';
  beginVoid(world, 'return');
  const start: Vec2 = { ...world.player.pos };
  const placed: Vec2 = { x: lightExit(world).x, z: lightExit(world).z };
  assert.ok(distance(placed, start) < lightExit(world).radius + SHORE_LIGHT.behind);
  for (let clock: number = 0; clock < SHORE_LIGHT.wait; clock += DT) stepWorld(world, [], DT);
  assert.ok(distance(lightExit(world), placed) < SHORE_LIGHT.still, `the light moved from ${String(placed.x)}, ${String(placed.z)}`);
  assert.equal(world.zone.id, opening.id);
});

void test('a light first laid during a return visit follows the old rules and never goes to the end of the road', (): void => {
  const world: World = fresh(38);
  world.flags['opening'] = 'read';
  world.flags['first_choice'] = 'took_journal';
  beginVoid(world, 'return');
  assert.equal(world.encounters.some((state): boolean => state.id === lightFind.id), false);
  world.flags['first_blade'] = 'found';
  for (let clock: number = 0; clock < SHORE_LIGHT.wait; clock += DT) stepWorld(world, [], DT);
  const pos: Vec2 = must(world.encounters.find((state): boolean => state.id === lightFind.id)?.pos, 'light laid');
  assert.ok(distance(pos, fromShore(must(world.shore, 'shore'), must(lightFind.shoreAt, 'light shore point'))) > SHORE_LIGHT.near);
});
