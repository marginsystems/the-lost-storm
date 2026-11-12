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
import { hudHidden } from './hud.ts';
import { stepWorld } from './step.ts';
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
  for (let step: number = 0; step < Math.ceil((wake.lie + wake.rise) / DT) + 1; step += 1) stepWorld(world, [], DT);
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

void test('taking the journal is the first choice; reading it shows the light, starts the quest and the HUD, and the light leads to the shallows', (): void => {
  const world: World = fresh(4);
  walkUntil(world, { x: 0, z: 1 }, (): boolean => found(world) !== null);
  const journal: GroundItem = must(found(world), 'journal');
  stepWorld(world, [{ type: 'pickup', groundId: journal.id }], DT);
  for (let step: number = 0; step < WALK.limit / DT && !carriesJournal(world); step += 1) stepWorld(world, [], DT);
  assert.ok(carriesJournal(world));
  assert.equal(world.flags['first_choice'], 'took_journal');
  assert.equal(questState(world, 'out_of_the_mist'), 'locked');
  assert.equal(hudHidden(world), true);
  const page: string = must(must(content.books.get('journal'), 'journal book').pages[0], 'page').id;
  stepWorld(world, [{ type: 'read', book: 'journal', page }], DT);
  assert.equal(world.flags['opening'], 'read');
  assert.equal(questState(world, 'out_of_the_mist'), 'active');
  assert.equal(questState(world, 'to_the_waystation'), 'locked');
  assert.equal(hudHidden(world), false);
  stepWorld(world, [], DT);
  assert.ok(distance(lightExit(world), world.player.pos) > lightExit(world).radius);
  walkTo(world, (): Vec2 => (world.zone.id === opening.id ? lightExit(world) : world.player.pos), (): boolean => world.zone.id !== opening.id);
  assert.equal(world.zone.id, content.world.start);
  stepWorld(world, [], DT);
  assert.equal(questState(world, 'out_of_the_mist'), 'done');
  assert.equal(questState(world, 'to_the_waystation'), 'active');
});

void test('reading needs the book in the pack, and an unknown page does nothing', (): void => {
  const world: World = fresh(5);
  stepWorld(world, [{ type: 'read', book: 'journal', page: 'do_not' }], DT);
  assert.equal(world.flags['opening'], 'begun');
});
