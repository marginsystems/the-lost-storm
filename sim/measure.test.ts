import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import type { Measurement, Meter } from './measure.ts';
import { createMeter, MEASURE_VERSION, readMeasurement, readMeter, readStream, sessionHeader, toLine } from './measure.ts';
import { grantXp } from './world/character.ts';
import { createWorld } from './world/create.ts';
import type { World, WorldEvent } from './world/types.ts';

const content: Content = loadContent();

void test('a stream written as JSON lines reads back to the same measurements', (): void => {
  const stream: Measurement[] = [
    sessionHeader('sim', 'slice', 'average/mixed', 7),
    { kind: 'milestone', t: 1.5, name: 'picked_journal' },
    { kind: 'hit', t: 2, taken: true, amount: 4.5, foe: 'mended', skill: 'mended_rhythm', zone: 'hall_of_time' },
    { kind: 'moment', t: 3, id: 9, moment: 'campfire', outcome: 'resolved' },
    { kind: 'power', t: 3, dps: 20, toughness: 100, itemLevels: 1 },
    { kind: 'end', t: 4, reason: 'done' },
  ];
  assert.deepEqual(readStream(stream.map(toLine).join('\n')), stream);
});

void test('a stream from another version or with a broken line is refused', (): void => {
  assert.throws((): Measurement => readMeasurement({ ...sessionHeader('game', 'live', 'me', null), version: MEASURE_VERSION + 1 }));
  assert.throws((): Measurement => readMeasurement({ kind: 'hit', t: 1, taken: 'yes' }));
  assert.throws((): Measurement => readMeasurement({ kind: 'nonsense', t: 1 }));
  assert.throws((): Measurement => readMeasurement({ kind: 'moment', t: 1, id: 1, moment: 'x', outcome: 'won' }));
});

void test('the meter reports levels, milestones, xp and power from the world and its events', (): void => {
  const world: World = createWorld(content, { seed: 3, save: null });
  const meter: Meter = createMeter(world, [{ kind: 'flag', name: 'camp', flag: 'camp', is: 'reached' }]);
  const first: Measurement[] = readMeter(world, meter, [], true);
  assert.ok(first.some((entry: Measurement): boolean => entry.kind === 'power'));
  world.events = [];
  grantXp(world, 10_000);
  world.flags['camp'] = 'reached';
  const events: WorldEvent[] = [...world.events];
  const next: Measurement[] = readMeter(world, meter, events);
  const kinds: string[] = next.map((entry: Measurement): string => entry.kind);
  assert.ok(kinds.includes('level') && kinds.includes('milestone') && kinds.includes('xp'), kinds.join(', '));
  assert.deepEqual(readMeter(world, meter, []), []);
});
