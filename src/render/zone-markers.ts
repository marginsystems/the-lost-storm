import type { Object3D, Scene } from 'three';
import { Color, Group, PointLight } from 'three';
import type { ExitLook, ZoneCheckpoint, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import type { World } from '../../sim/world/types.ts';
import type { LightPool } from './light-pool.ts';
import { createLightPool } from './light-pool.ts';
import { renderBudget } from '../mobile/quality.ts';

export const MARKERS = {
  exitColor: 0x3d8cff,
  checkpointColor: 0xffa040,
  waypointColor: 0x2fe0b8,
  waypointLight: 14,
  locked: 0.22,
  lift: 0.07,
  glowStrength: 0.55,
  pulseSpeed: 2.1,
  pulseDepth: 0.2,
  lightHeight: 1.1,
  lightDistance: 9,
  exitLight: 10,
  checkpointLight: 16,
  idle: 0.3,
  waypointIdle: 0.7,
  ease: 5,
  mistLight: 4,
} as const;

interface MarkerShape {
  readonly flats: boolean;
  readonly column: boolean;
  readonly light: number;
}

interface Marker {
  readonly glow: LightPool;
  readonly light: PointLight;
  readonly lightPower: number;
  readonly phase: number;
  readonly lit: (world: World) => number;
  level: number | null;
}

export interface ZoneMarkers {
  update(dt: number, time: number, world: World): void;
  dispose(): void;
}

const EXIT_SHAPES: Readonly<Record<ExitLook, MarkerShape>> = {
  ring: { flats: true, column: true, light: MARKERS.exitLight },
  mist: { flats: false, column: false, light: MARKERS.mistLight },
};

export function exitShape(look: ExitLook): MarkerShape {
  return EXIT_SHAPES[look];
}

export function createZoneMarkers(scene: Scene, zone: ZoneDef): ZoneMarkers {
  const group: Group = new Group();
  const markers: Marker[] = [];

  const build = (x: number, z: number, radius: number, hex: number, shape: MarkerShape, lit: (world: World) => number): void => {
    const lightPower: number = shape.light;
    const color: Color = new Color(hex);
    const glow: LightPool = createLightPool(color, shape.column);
    glow.place(x, zone.floorHeight + MARKERS.lift, z, radius);
    glow.group.traverse((part: Object3D): void => {
      part.renderOrder = 4;
    });
    glow.group.visible = shape.flats;
    group.add(glow.group);
    const light: PointLight = new PointLight(color, lightPower, MARKERS.lightDistance, 1.8);
    light.position.set(x, MARKERS.lightHeight, z);
    if (renderBudget().markerLights) group.add(light);
    markers.push({ glow, light, lightPower, phase: x * 0.37 + z * 0.61, lit, level: null });
  };

  const exitLit = (exit: ZoneExit): ((world: World) => number) => (world: World): number => (allHold(world, exit.requires) ? 1 : exit.hiddenWhenLocked ? 0 : MARKERS.locked);
  const checkpointLit = (checkpoint: ZoneCheckpoint): ((world: World) => number) => (world: World): number => (world.respawn.type === 'checkpoint' && world.respawn.checkpoint === checkpoint.id ? 1 : MARKERS.idle);
  for (const exit of zone.kind === 'void' ? [] : zone.exits) build(exit.x, exit.z, exit.radius, MARKERS.exitColor, exitShape(exit.look), exitLit(exit));
  for (const checkpoint of zone.checkpoints) build(checkpoint.x, checkpoint.z, checkpoint.radius, MARKERS.checkpointColor, { flats: true, column: false, light: MARKERS.checkpointLight }, checkpointLit(checkpoint));
  if (zone.waypoint !== null) build(zone.waypoint.x, zone.waypoint.z, zone.waypoint.radius, MARKERS.waypointColor, { flats: true, column: false, light: MARKERS.waypointLight }, (world: World): number => (world.waypoints.includes(zone.id) ? 1 : MARKERS.waypointIdle));
  scene.add(group);

  return {
    update(dt: number, time: number, world: World): void {
      for (const marker of markers) {
        const target: number = marker.lit(world);
        const level: number = marker.level === null ? target : marker.level + (target - marker.level) * (1 - Math.exp(-MARKERS.ease * dt));
        marker.level = level;
        const pulse: number = 1 - MARKERS.pulseDepth * (0.5 + 0.5 * Math.sin(time * MARKERS.pulseSpeed + marker.phase));
        marker.glow.set(MARKERS.glowStrength * level * pulse, time);
        marker.light.intensity = marker.lightPower * level * pulse;
      }
    },
    dispose(): void {
      group.removeFromParent();
      for (const marker of markers) {
        marker.glow.dispose();
        marker.light.dispose();
      }
    },
  };
}
