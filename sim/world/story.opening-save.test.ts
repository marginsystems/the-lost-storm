import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { parseSaveText, toSave } from '../save.ts';
import type { SaveData } from '../save.ts';
import { createWorld } from './create.ts';
import { stepWorld } from './step.ts';
import { wakeLength } from './wake.ts';
import type { Command, GroundItem, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const OPENING = { dt: 1 / 60, limit: 90, stride: 6, shoreWalk: 6, book: 'journal', page: 'do_not', find: 'journal', item: 'worn_journal' } as const;

function walk(world: World, dir: Vec2): Command {
  return { type: 'move', held: true, dest: { x: world.player.pos.x + dir.x * OPENING.stride, z: world.player.pos.z + dir.z * OPENING.stride } };
}

function journalOf(world: World): GroundItem | null {
  return world.ground.find((ground: GroundItem): boolean => ground.find === OPENING.find) ?? null;
}

function carriesJournal(world: World): boolean {
  return world.player.inventory.some((item): boolean => item?.base === OPENING.item);
}

function changedFlags(events: readonly WorldEvent[]): string[] {
  return events.flatMap((event: WorldEvent): readonly string[] => (event.type === 'flags_changed' ? event.flags : []));
}

function risen(seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: true });
  const wake = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / OPENING.dt) + 1; step += 1) stepWorld(world, [], OPENING.dt);
  return world;
}

function takeJournal(world: World, changed: string[]): void {
  for (let seconds: number = 0; journalOf(world) === null && seconds < OPENING.limit; seconds += OPENING.dt) changed.push(...changedFlags(stepWorld(world, [walk(world, world.heading)], OPENING.dt)));
  const journal: GroundItem = must(journalOf(world), 'the journal');
  changed.push(...changedFlags(stepWorld(world, [{ type: 'pickup', groundId: journal.id }], OPENING.dt)));
  for (let seconds: number = 0; !carriesJournal(world) && seconds < OPENING.limit; seconds += OPENING.dt) changed.push(...changedFlags(stepWorld(world, [], OPENING.dt)));
}

void test('taking and reading the journal in the opening is in the save, and a reload keeps the shore and leaves the journal taken', (): void => {
  const changed: string[] = [];
  const world: World = risen(3);
  takeJournal(world, changed);
  assert.equal(world.flags['first_choice'], 'took_journal');
  assert.equal(toSave(world).flags['first_choice'], 'took_journal');
  changed.push(...changedFlags(stepWorld(world, [{ type: 'read', book: OPENING.book, page: OPENING.page }], OPENING.dt)));
  assert.ok(changed.includes('first_choice'));
  assert.ok(changed.includes('opening'));
  const save: SaveData = toSave(world);
  assert.equal(save.flags['first_choice'], 'took_journal');
  assert.equal(save.flags['opening'], 'read');
  const loaded: SaveData = must(parseSaveText(content, JSON.stringify(save)), 'the save read back');
  assert.equal(loaded.flags['first_choice'], 'took_journal');
  assert.equal(loaded.flags['opening'], 'read');
  const again: World = createWorld(content, { seed: 4, save: loaded, opening: true });
  assert.equal(again.zone.id, 'between');
  for (let walked: number = 0; walked < OPENING.shoreWalk; walked += OPENING.dt) stepWorld(again, [walk(again, again.heading)], OPENING.dt);
  assert.notEqual(again.shore, null);
  assert.equal(journalOf(again), null);
});
