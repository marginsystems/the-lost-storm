import type { Scene, WebGLRenderer } from 'three';
import type { GlitchKind } from '../sim/content/glitches.ts';
import type { Command, World, WorldEvent } from '../sim/world/types.ts';
import type { AudioSystem, Trigger } from './audio/system.ts';
import type { EventWatcher, FightPlan, FightRaw } from './bench/fight-bench.ts';
import type { MeasureRecorder } from './measure-recorder.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import type { MemoryReport } from './mobile/memory.ts';
import type { WalkReport } from './walk/body-walk.ts';
import { measureMemory } from './mobile/memory.ts';

export interface DebugHandle {
  readonly world: World;
  readonly scene: Scene;
  readonly audio: AudioSystem;
  readonly sounds: readonly Trigger[];
  readonly camera: IsoCamera;
  send(command: Command): void;
  memory(): MemoryReport;
  glitch(kind: GlitchKind): void;
  spawn(monster: string, count: number): void;
  walk(): Promise<WalkReport>;
  bench(plan: FightPlan): Promise<FightRaw>;
  saveMeasurements(): void;
}

declare global {
  interface Window {
    storm?: DebugHandle;
  }
}

export interface DebugDeps {
  readonly world: World;
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly audio: AudioSystem;
  readonly sounds: readonly Trigger[];
  readonly camera: IsoCamera;
  readonly send: (command: Command) => void;
}

export interface DebugHooks {
  record(events: readonly WorldEvent[]): void;
}

export function attachDebug(deps: DebugDeps): DebugHooks {
  let recorder: MeasureRecorder | null = null;
  let watcher: EventWatcher | null = null;
  if (import.meta.env.DEV) {
    const { world, scene, renderer, audio, sounds, camera, send } = deps;
    const attachRecorder = async (): Promise<void> => {
      const module = await import('./measure-recorder.ts');
      const made: MeasureRecorder = module.createRecorder(world, import.meta.env.VITE_BUILD_ID ?? 'dev');
      recorder = made;
      if (window.storm !== undefined) window.storm = { ...window.storm, saveMeasurements: (): void => module.saveRecording(made) };
    };
    void attachRecorder();
    window.storm = { world, scene, audio, sounds, camera, send, memory: (): MemoryReport => measureMemory(renderer, scene), glitch: (kind: GlitchKind): void => send({ type: 'glitch', kind }), spawn: (monster: string, count: number): void => send({ type: 'spawn', monster, count }), walk: async (): Promise<WalkReport> => (await import('./walk/body-walk.ts')).walkBodies({ world, scene, send, sleep: (ms: number): Promise<void> => new Promise<void>((resolve: () => void): void => void window.setTimeout(resolve, ms)) }), bench: async (plan: FightPlan): Promise<FightRaw> => (await import('./bench/fight-bench.ts')).runFightBench({ world, scene, renderer, send, watch: (next: EventWatcher | null): void => void (watcher = next) }, plan), saveMeasurements: (): void => undefined };
  }
  return {
    record: (events: readonly WorldEvent[]): void => {
      recorder?.record(events);
      watcher?.(events);
    },
  };
}
