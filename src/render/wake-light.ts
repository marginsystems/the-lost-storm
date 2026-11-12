import { Group, SpotLight } from 'three';
import type { Vec2 } from '../../sim/math.ts';
import type { WakeStage } from '../../sim/world/wake.ts';
import { wakeFrame, WAKE_SHOT } from '../opening/wake-shot.ts';
import type { ZoneWake } from '../../sim/content/story-types.ts';
import { CAMERA } from './iso-camera.ts';

export const WAKE_LIGHT = {
  key: { color: 0xfff1e0, intensity: 3.2, turnDegrees: -55, elevationDegrees: 42, distance: 4.5, aimHeight: 0.3, angle: 0.6, penumbra: 0.85 },
  rim: { color: 0x9fb8ff, intensity: 22, turnDegrees: 205, elevationDegrees: 30, distance: 4, aimHeight: 0.5, angle: 0.5, penumbra: 0.8 },
} as const;

interface LampSpec {
  readonly color: number;
  readonly intensity: number;
  readonly turnDegrees: number;
  readonly elevationDegrees: number;
  readonly distance: number;
  readonly aimHeight: number;
  readonly angle: number;
  readonly penumbra: number;
}

export interface LampOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WakeLights {
  readonly group: Group;
  update(hero: Vec2, floor: number, lit: number, cameraYawDegrees: number): void;
  dispose(): void;
}

function smoother(value: number): number {
  const t: number = Math.min(1, Math.max(0, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function wakeLit(stage: WakeStage | null): number {
  return stage === null ? 0 : 1 - smoother(stage.settle);
}

export function lampOffset(spec: LampSpec, cameraYawDegrees: number): LampOffset {
  const yaw: number = ((cameraYawDegrees + spec.turnDegrees) * Math.PI) / 180;
  const pitch: number = (spec.elevationDegrees * Math.PI) / 180;
  const across: number = Math.cos(pitch) * spec.distance;
  return { x: Math.sin(yaw) * across, y: Math.sin(pitch) * spec.distance, z: Math.cos(yaw) * across };
}

interface Lamp {
  readonly light: SpotLight;
  readonly spec: LampSpec;
}

function lamp(spec: LampSpec): Lamp {
  const light: SpotLight = new SpotLight(spec.color, 0, 0, spec.angle, spec.penumbra, 0);
  light.castShadow = false;
  return { light, spec };
}

export function createWakeLights(): WakeLights {
  const group: Group = new Group();
  const lamps: Lamp[] = [lamp(WAKE_LIGHT.key), lamp(WAKE_LIGHT.rim)];
  for (const { light } of lamps) {
    group.add(light);
    group.add(light.target);
  }
  return {
    group,
    update(hero: Vec2, floor: number, lit: number, cameraYawDegrees: number): void {
      for (const { light, spec } of lamps) {
        const offset: LampOffset = lampOffset(spec, cameraYawDegrees);
        light.intensity = spec.intensity * lit;
        light.position.set(hero.x + offset.x, floor + offset.y, hero.z + offset.z);
        light.target.position.set(hero.x, floor + spec.aimHeight, hero.z);
      }
    },
    dispose(): void {
      for (const { light } of lamps) light.dispose();
      group.removeFromParent();
    },
  };
}

export function wakeCameraYaw(plan: ZoneWake, elapsed: number): number {
  const blend: number = wakeFrame(plan, elapsed).shot.blend;
  return WAKE_SHOT.start.yawDegrees + (CAMERA.yawDegrees - WAKE_SHOT.start.yawDegrees) * blend;
}
