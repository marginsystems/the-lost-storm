import type { Scene, WebGLRenderer } from 'three';
import type { GlitchKind } from '../sim/content/glitches.ts';
import type { Command, World, WorldEvent } from '../sim/world/types.ts';
import type { AudioSystem, Trigger } from './audio/system.ts';
import type { MeasureRecorder } from './measure-recorder.ts';
import type { MemoryReport } from './mobile/memory.ts';
import { measureMemory } from './mobile/memory.ts';

export interface DebugHandle {
  readonly world: World;
  readonly scene: Scene;
  readonly audio: AudioSystem;
  readonly sounds: readonly Trigger[];
  send(command: Command): void;
  memory(): MemoryReport;
  glitch(kind: GlitchKind): void;
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
  readonly send: (command: Command) => void;
}

export interface DebugHooks {
  record(events: readonly WorldEvent[]): void;
}

export function attachDebug(deps: DebugDeps): DebugHooks {
  let recorder: MeasureRecorder | null = null;
  if (import.meta.env.DEV) {
    const { world, scene, renderer, audio, sounds, send } = deps;
    const attachRecorder = async (): Promise<void> => {
      const module = await import('./measure-recorder.ts');
      const made: MeasureRecorder = module.createRecorder(world, import.meta.env.VITE_BUILD_ID ?? 'dev');
      recorder = made;
      if (window.storm !== undefined) window.storm = { ...window.storm, saveMeasurements: (): void => module.saveRecording(made) };
    };
    void attachRecorder();
    window.storm = { world, scene, audio, sounds, send, memory: (): MemoryReport => measureMemory(renderer, scene), glitch: (kind: GlitchKind): void => send({ type: 'glitch', kind }), saveMeasurements: (): void => undefined };
  }
  return {
    record: (events: readonly WorldEvent[]): void => {
      recorder?.record(events);
    },
  };
}
