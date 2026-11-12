import type { Scene } from 'three';
import { Group, PointLight } from 'three';
import type { ZoneDef } from '../../sim/content/types.ts';

export const LIGHT_SLOTS = {
  voidLights: 1,
  fillerDistance: 1,
  fillerDecay: 2,
  fillerDepth: -40,
} as const;

export interface LightBudget {
  readonly zone: number;
  readonly markers: boolean;
}

export function zoneLightCount(zone: ZoneDef, budget: LightBudget): number {
  if (zone.kind === 'void') return LIGHT_SLOTS.voidLights;
  return budget.zone;
}

export function markerLightCount(zone: ZoneDef, budget: LightBudget): number {
  if (!budget.markers) return 0;
  const exits: number = zone.kind === 'void' ? 0 : zone.exits.length;
  return exits + zone.checkpoints.length + (zone.waypoint === null ? 0 : 1);
}

export function lightsIn(zone: ZoneDef, budget: LightBudget): number {
  return zoneLightCount(zone, budget) + markerLightCount(zone, budget);
}

export function fillersFor(zone: ZoneDef, zones: Iterable<ZoneDef>, budget: LightBudget): number {
  let most: number = 0;
  for (const other of zones) most = Math.max(most, lightsIn(other, budget));
  return Math.max(0, most - lightsIn(zone, budget));
}

export interface LightSlots {
  readonly lit: number;
  fill(count: number): void;
}

export function createLightSlots(scene: Scene): LightSlots {
  const group: Group = new Group();
  group.position.y = LIGHT_SLOTS.fillerDepth;
  scene.add(group);
  const fillers: PointLight[] = [];
  let lit: number = 0;
  return {
    get lit(): number {
      return lit;
    },
    fill(count: number): void {
      while (fillers.length < count) {
        const light: PointLight = new PointLight(0x000000, 0, LIGHT_SLOTS.fillerDistance, LIGHT_SLOTS.fillerDecay);
        fillers.push(light);
        group.add(light);
      }
      fillers.forEach((light: PointLight, index: number): void => {
        light.visible = index < count;
      });
      lit = count;
    },
  };
}
