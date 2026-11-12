import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import type { SaveData } from '../save.ts';
import { readSave, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import type { PathEntry, PathLog } from './glitch-types.ts';
import { compactPath, emptyPathLog, PATH_LOG, pathToSave, readPathLog, recordPath } from './path-log.ts';
import type { World } from './types.ts';

const content: Content = loadContent();
const ZONES: ReadonlySet<string> = new Set<string>(content.zones.keys());

function step(index: number, act: PathEntry['act'] = 'step'): PathEntry {
  return { t: index, zone: 'waystation', x: index, z: 0, act };
}

void test('a new world marks where the hero stands, and standing still adds nothing', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  assert.equal(world.path.entries.length, 1);
  world.events = [];
  recordPath(world, 1);
  assert.equal(world.path.entries.length, 1);
  assert.equal(world.events.length, 0);
  assert.equal(world.path.clock, 1);
});

void test('walking adds a mark every stride and notable moments add their own', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  world.events = [];
  world.player.pos = { x: world.player.pos.x + PATH_LOG.stride + 0.1, z: world.player.pos.z };
  recordPath(world, 0.5);
  assert.equal(world.path.entries.at(-1)?.act, 'step');
  world.events = [{ type: 'level_up', level: 2 }, { type: 'death', actorId: 9, team: 'monster', pos: { x: 0, z: 0 }, direction: { x: 0, z: 1 } }];
  recordPath(world, 0.5);
  assert.deepEqual(world.path.entries.slice(-2).map((entry: PathEntry): string => entry.act), ['level', 'kill']);
  assert.equal(world.events.filter((event): boolean => event.type === 'path_marked').length, 2);
});

void test('a full log thins the older steps and keeps every notable moment and the newest path', (): void => {
  const entries: PathEntry[] = Array.from({ length: 200 }, (_: unknown, index: number): PathEntry => step(index, index % 50 === 0 ? 'kill' : 'step'));
  const compacted: PathEntry[] = compactPath(entries, 160);
  assert.ok(compacted.length <= 160);
  assert.deepEqual(compacted.filter((entry: PathEntry): boolean => entry.act === 'kill').map((entry: PathEntry): number => entry.t), [0, 50, 100, 150]);
  assert.deepEqual(compacted.slice(-100), entries.slice(-100));
  assert.equal(compacted[0]?.t, 0);
});

void test('the log never grows past its cap however long the hero walks', (): void => {
  const world: World = createWorld(content, { seed: 2, save: null });
  for (let index: number = 0; index < PATH_LOG.cap * 3; index += 1) {
    world.events = [];
    world.player.pos = { x: 20 + (index % 2) * PATH_LOG.stride * 1.5, z: 20 };
    recordPath(world, 1);
  }
  assert.ok(world.path.entries.length <= PATH_LOG.cap);
  assert.equal(world.path.entries[0]?.t, 0);
});

void test('the log survives a save compactly and comes back the same', (): void => {
  const log: PathLog = { entries: [step(1), step(2, 'zone'), { t: 3.4, zone: 'shallows', x: -1.5, z: 22.3, act: 'glitch' }], clock: 9 };
  const saved = pathToSave(log);
  assert.deepEqual(saved.zones, ['waystation', 'shallows']);
  const back: PathLog = readPathLog(JSON.parse(JSON.stringify(saved)), ZONES);
  assert.deepEqual(back.entries, log.entries);
  assert.equal(back.clock, 3.4);
});

void test('a broken, foreign or future log is dropped entry by entry or as a whole', (): void => {
  assert.deepEqual(readPathLog(null, ZONES), emptyPathLog());
  assert.deepEqual(readPathLog({ version: PATH_LOG.version + 1, zones: [], entries: [] }, ZONES), emptyPathLog());
  const read: PathLog = readPathLog({ version: PATH_LOG.version, zones: ['waystation', 'nowhere'], entries: [[10, 0, 5, 5, 0], [20, 1, 5, 5, 0], [30, 0, 5, 5, 99], ['x'], [40, 0, 5, 5, 2]] }, ZONES);
  assert.deepEqual(read.entries.map((entry: PathEntry): number => entry.t), [1, 4]);
});

void test('a version 5 save from before the log loads with an empty log, and the current one keeps it', (): void => {
  const world: World = createWorld(content, { seed: 3, save: null });
  world.path.entries.push(step(5, 'kill'));
  const current = toSave(world);
  const loaded = readSave(content, JSON.parse(JSON.stringify(current)));
  assert.deepEqual(loaded?.path, current.path);
  const older: SaveData = must(readSave(content, JSON.parse(JSON.stringify({ ...current, version: 5, path: undefined, glitch: undefined }))), 'version 5 save');
  assert.deepEqual(older.path, pathToSave(emptyPathLog()));
  assert.deepEqual(older.glitch, { progress: 0, fired: [] });
});

void test('when thinning is not enough, old steps go before any notable moment', (): void => {
  const entries: PathEntry[] = Array.from({ length: 300 }, (_: unknown, index: number): PathEntry => step(index, index % 3 === 0 ? 'kill' : 'step'));
  const compacted: PathEntry[] = compactPath(entries, 110);
  assert.equal(compacted.length, 110);
  assert.equal(compacted.filter((entry: PathEntry): boolean => entry.act === 'kill').length, 100);
  assert.equal(compacted[0]?.t, 0);
});
