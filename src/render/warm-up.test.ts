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

function manualTimers(): { readonly timers: Timers; fire(): void } {
  const tasks: (() => void)[] = [];
  return {
    timers: {
      after: (_ms: number, task: () => void): (() => void) => {
        tasks.push(task);
        return (): void => {
          tasks.splice(tasks.indexOf(task), 1);
        };
      },
    },
    fire: (): void => {
      for (const task of tasks.splice(0, tasks.length)) task();
    },
  };
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

void test('a warm-up that outlasts its wait lets the game go on', async (): Promise<void> => {
  const compiler: Recorder = recorder(new Mesh());
  const clock = manualTimers();
  const done: Promise<void> = warmUpWithin(compiler, new Scene(), new PerspectiveCamera(), [], clock.timers, 1);
  const early: string = await Promise.race([done.then((): string => 'settled'), Promise.resolve('waiting')]);
  assert.equal(early, 'waiting');
  clock.fire();
  await done;
});

void test('a warm-up that finishes in time cancels its wait', async (): Promise<void> => {
  const compiler: Recorder = recorder(new Mesh());
  const clock = manualTimers();
  const done: Promise<void> = warmUpWithin(compiler, new Scene(), new PerspectiveCamera(), [], clock.timers, 1);
  compiler.finish();
  await done;
  clock.fire();
});
