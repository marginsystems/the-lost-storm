import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box3 } from 'three';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Timers } from '../backend/backend.ts';
import { oneAtATime, oneGlove, THUMBNAIL, trunk } from './item-thumbnails.ts';

interface ManualTimers extends Timers {
  readonly due: (() => void)[];
}

function manualTimers(): ManualTimers {
  const due: (() => void)[] = [];
  return {
    due,
    after(_ms: number, task: () => void): () => void {
      due.push(task);
      return (): void => undefined;
    },
  };
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

async function fireNext(timers: ManualTimers): Promise<void> {
  await settle();
  const task: (() => void) | undefined = timers.due.shift();
  assert.ok(task !== undefined, 'no timer was waiting');
  task();
  await settle();
}

void test('each shot waits for its own timer before it runs', async (): Promise<void> => {
  const timers: ManualTimers = manualTimers();
  const done: string[] = [];
  const all: Promise<void> = oneAtATime(['sword', 'coat', 'hood'], timers, 0, (item: string): Promise<void> => {
    done.push(item);
    return Promise.resolve();
  });
  await settle();
  assert.deepEqual(done, []);
  await fireNext(timers);
  assert.deepEqual(done, ['sword']);
  await fireNext(timers);
  assert.deepEqual(done, ['sword', 'coat']);
  await fireNext(timers);
  await all;
  assert.deepEqual(done, ['sword', 'coat', 'hood']);
});

void test('the next shot waits until the one before it has finished', async (): Promise<void> => {
  const timers: ManualTimers = manualTimers();
  const finishers: (() => void)[] = [];
  const started: string[] = [];
  const all: Promise<void> = oneAtATime(['sword', 'coat'], timers, 0, (item: string): Promise<void> => {
    started.push(item);
    return new Promise<void>((resolve: () => void): void => {
      finishers.push(resolve);
    });
  });
  await fireNext(timers);
  assert.deepEqual(started, ['sword']);
  assert.equal(timers.due.length, 0);
  for (const finish of finishers.splice(0)) finish();
  await fireNext(timers);
  assert.deepEqual(started, ['sword', 'coat']);
  for (const finish of finishers.splice(0)) finish();
  await all;
});

function slab(width: number, height: number, at: number): Mesh {
  const geometry: BoxGeometry = new BoxGeometry(width, height, 0.2);
  geometry.translate(at, 0, 0);
  return new Mesh(geometry, new MeshBasicMaterial());
}

void test('a chest piece with its sleeves out is framed on the trunk, and a narrow piece is framed whole', (): void => {
  const wide: Group = new Group();
  wide.add(slab(1.8, 0.7, 0));
  const framed: Vector3 = trunk(wide).getSize(new Vector3());
  assert.ok(Math.abs(framed.x - 0.7 * THUMBNAIL.trunkWide) < 1e-6);
  assert.ok(Math.abs(framed.y - 0.7) < 1e-6);
  const narrow: Group = new Group();
  narrow.add(slab(0.5, 0.7, 0));
  assert.ok(Math.abs(trunk(narrow).getSize(new Vector3()).x - 0.5) < 1e-6);
});

void test('a pair of gloves is framed on one glove only', (): void => {
  const pair: Group = new Group();
  const both: BoxGeometry = new BoxGeometry(0.3, 0.1, 0.1);
  both.translate(-0.7, 0, 0);
  const other: BoxGeometry = new BoxGeometry(0.3, 0.1, 0.1);
  other.translate(0.7, 0, 0);
  const left: Mesh = new Mesh(both, new MeshBasicMaterial());
  const right: Mesh = new Mesh(other, new MeshBasicMaterial());
  pair.add(left, right);
  const one: Box3 = oneGlove(pair);
  assert.ok(one.min.x > 0.5);
  assert.ok(Math.abs(one.getSize(new Vector3()).x - 0.3) < 1e-6);
  const merged: Group = new Group();
  const span: BoxGeometry = new BoxGeometry(1.7, 0.1, 0.1, 16, 1, 1);
  merged.add(new Mesh(span, new MeshBasicMaterial()));
  const half: Box3 = oneGlove(merged);
  assert.ok(half.min.x >= 0.85 * THUMBNAIL.gloveFrom - 0.11);
  assert.ok(half.max.x > 0.84);
});
