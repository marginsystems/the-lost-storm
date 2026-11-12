import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Camera, Object3D } from 'three';
import { Mesh, PerspectiveCamera, Scene } from 'three';
import type { Timers } from '../backend/backend.ts';
import type { ShaderCompiler } from './warm-up.ts';
import { warmUp, warmUpWithin } from './warm-up.ts';

interface Recorder extends ShaderCompiler {
  readonly seen: boolean[];
  finish(): void;
}

function recorder(standIn: Object3D): Recorder {
  const seen: boolean[] = [];
  const finishers: (() => void)[] = [];
  return {
    seen,
    finish: (): void => {
      for (const finish of finishers) finish();
    },
    compileAsync(scene: Object3D, _camera: Camera): Promise<Object3D> {
      let inScene: boolean = false;
      scene.traverse((object: Object3D): void => {
        if (object === standIn) inScene = true;
      });
      seen.push(inScene);
      return new Promise<Object3D>((resolve: (value: Object3D) => void): void => {
        finishers.push((): void => resolve(scene));
      });
    },
  };
}

interface ManualTimers {
  readonly timers: Timers;
  pending(): number;
  fire(): void;
}

function manualTimers(): ManualTimers {
  const tasks: (() => void)[] = [];
  return {
    timers: {
      after: (_ms: number, task: () => void): (() => void) => {
        tasks.push(task);
        return (): void => {
          const index: number = tasks.indexOf(task);
          if (index >= 0) tasks.splice(index, 1);
        };
      },
    },
    pending: (): number => tasks.length,
    fire: (): void => {
      for (const task of tasks.splice(0, tasks.length)) task();
    },
  };
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

function tracked(promise: Promise<void>): { settled(): boolean } {
  let done: boolean = false;
  void promise.finally((): void => {
    done = true;
  });
  return { settled: (): boolean => done };
}

void test('stand-ins are in the scene while their shaders are queued and gone from it afterwards', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const standIn: Mesh = new Mesh();
  const compiler: Recorder = recorder(standIn);
  const done: Promise<void> = warmUp(compiler, scene, new PerspectiveCamera(), [standIn]);
  assert.deepEqual(compiler.seen, [true]);
  assert.equal(scene.children.length, 0);
  assert.equal(standIn.parent, null);
  compiler.finish();
  await done;
});

void test('a compiler that throws at once still ends the warm-up and leaves the scene clean', async (): Promise<void> => {
  const scene: Scene = new Scene();
  const standIn: Mesh = new Mesh();
  const throwing: ShaderCompiler = {
    compileAsync(_target: Object3D, _camera: Camera): Promise<Object3D> {
      throw new Error('no context');
    },
  };
  await warmUp(throwing, scene, new PerspectiveCamera(), [standIn]);
  assert.equal(scene.children.length, 0);
  assert.equal(standIn.parent, null);
});

void test('a warm-up that outlasts its wait holds the game only until the wait ends', async (): Promise<void> => {
  const compiler: Recorder = recorder(new Mesh());
  const clock: ManualTimers = manualTimers();
  const done: Promise<void> = warmUpWithin(compiler, new Scene(), new PerspectiveCamera(), [], clock.timers, 1);
  const watched: { settled(): boolean } = tracked(done);
  await settle();
  assert.equal(watched.settled(), false);
  assert.equal(clock.pending(), 1);
  clock.fire();
  await settle();
  assert.equal(watched.settled(), true);
  compiler.finish();
});

void test('a warm-up that finishes in time cancels its wait', async (): Promise<void> => {
  const compiler: Recorder = recorder(new Mesh());
  const clock: ManualTimers = manualTimers();
  const done: Promise<void> = warmUpWithin(compiler, new Scene(), new PerspectiveCamera(), [], clock.timers, 1);
  assert.equal(clock.pending(), 1);
  compiler.finish();
  await done;
  assert.equal(clock.pending(), 0);
});
