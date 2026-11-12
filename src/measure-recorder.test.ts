import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../sim/content/content.ts';
import type { Measurement } from '../sim/measure.ts';
import { readStream } from '../sim/measure.ts';
import { grantXp } from '../sim/world/character.ts';
import { createWorld } from '../sim/world/create.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { World } from '../sim/world/types.ts';
import { summarize } from '../tools/simulate-summary.ts';
import type { MeasureRecorder } from './measure-recorder.ts';
import { createRecorder } from './measure-recorder.ts';

void test('a recorded live session reads back as a game stream the simulator report understands', (): void => {
  const world: World = createWorld(loadContent(), { seed: 5, save: null });
  const recorder: MeasureRecorder = createRecorder(world, 'dev');
  recorder.record(stepWorld(world, [], 1 / 30));
  world.events = [];
  grantXp(world, 10_000);
  recorder.record([...world.events]);
  const stream: Measurement[] = readStream(recorder.text());
  const header: Measurement | undefined = stream[0];
  assert.ok(header?.kind === 'session' && header.source === 'game' && header.policy === 'dev');
  assert.equal(stream.at(-1)?.kind, 'end');
  const run = summarize(stream);
  assert.equal(run.scenario, 'live');
  assert.ok(run.endLevel > 1);
  assert.ok(recorder.count() > 2);
});
