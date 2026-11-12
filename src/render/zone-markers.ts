import type { Scene } from 'three';
import { Color, Group, Mesh, PointLight, RingGeometry } from 'three';
import type { MeshBasicMaterial } from 'three';
import type { ExitLook, ZoneCheckpoint, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import type { World } from '../../sim/world/types.ts';
import { additive, glow } from './effect-shapes.ts';
import { renderBudget } from '../mobile/quality.ts';

export const MARKERS = {
  exitColor: 0x9fd0ff,
  checkpointColor: 0xffa040,
  waypointColor: 0x8fe8d0,
  waypointLight: 14,
  locked: 0.22,
  lift: 0.07,
  ringInner: 0.86,
  coreOuter: 0.8,
  coreOpacity: 0.07,
  ringOpacity: 0.5,
  pulseSpeed: 2.1,
  pulseDepth: 0.35,
  lightHeight: 1.4,
  lightDistance: 9,
  exitLight: 7,
  checkpointLight: 16,
  idle: 0.3,
  ease: 5,
  segments: 48,
  mistLight: 4,
} as const;

interface MarkerShape {
  readonly flats: boolean;
  readonly light: number;
}

interface Marker {
  readonly ring: MeshBasicMaterial;
  readonly core: MeshBasicMaterial;
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
  ring: { flats: true, light: MARKERS.exitLight },
  mist: { flats: false, light: MARKERS.mistLight },
};

export function exitShape(look: ExitLook): MarkerShape {
  return EXIT_SHAPES[look];
}

export function createZoneMarkers(scene: Scene, zone: ZoneDef): ZoneMarkers {
  const group: Group = new Group();
  const markers: Marker[] = [];
  const meshes: Mesh[] = [];

  const build = (x: number, z: number, radius: number, hex: number, shape: MarkerShape, lit: (world: World) => number): void => {
    const lightPower: number = shape.light;
    const color: Color = new Color(hex);
    const ring: Mesh<RingGeometry, MeshBasicMaterial> = new Mesh(new RingGeometry(radius * MARKERS.ringInner, radius, MARKERS.segments), additive(glow(color, 1.6), MARKERS.ringOpacity));
    const core: Mesh<RingGeometry, MeshBasicMaterial> = new Mesh(new RingGeometry(0, radius * MARKERS.coreOuter, MARKERS.segments), additive(color, MARKERS.coreOpacity));
    for (const flat of [ring, core]) {
      flat.rotation.x = -Math.PI / 2;
      flat.position.set(x, zone.floorHeight + MARKERS.lift, z);
      flat.renderOrder = 4;
      flat.visible = shape.flats;
      group.add(flat);
      meshes.push(flat);
    }
    const light: PointLight = new PointLight(color, lightPower, MARKERS.lightDistance, 1.8);
    light.position.set(x, MARKERS.lightHeight, z);
    if (renderBudget().markerLights) group.add(light);
    markers.push({ ring: ring.material, core: core.material, light, lightPower, phase: x * 0.37 + z * 0.61, lit, level: null });
  };

  const exitLit = (exit: ZoneExit): ((world: World) => number) => (world: World): number => (allHold(world, exit.requires) ? 1 : exit.hiddenWhenLocked ? 0 : MARKERS.locked);
  const checkpointLit = (checkpoint: ZoneCheckpoint): ((world: World) => number) => (world: World): number => (world.respawn.type === 'checkpoint' && world.respawn.checkpoint === checkpoint.id ? 1 : MARKERS.idle);
  for (const exit of zone.kind === 'void' ? [] : zone.exits) build(exit.x, exit.z, exit.radius, MARKERS.exitColor, exitShape(exit.look), exitLit(exit));
  for (const checkpoint of zone.checkpoints) build(checkpoint.x, checkpoint.z, checkpoint.radius, MARKERS.checkpointColor, { flats: true, light: MARKERS.checkpointLight }, checkpointLit(checkpoint));
  if (zone.waypoint !== null) build(zone.waypoint.x, zone.waypoint.z, zone.waypoint.radius, MARKERS.waypointColor, { flats: true, light: MARKERS.waypointLight }, (world: World): number => (world.waypoints.includes(zone.id) ? 1 : MARKERS.idle));
  scene.add(group);

  return {
    update(dt: number, time: number, world: World): void {
      for (const marker of markers) {
        const target: number = marker.lit(world);
        const level: number = marker.level === null ? target : marker.level + (target - marker.level) * (1 - Math.exp(-MARKERS.ease * dt));
        marker.level = level;
        const pulse: number = 1 - MARKERS.pulseDepth * (0.5 + 0.5 * Math.sin(time * MARKERS.pulseSpeed + marker.phase));
        marker.ring.opacity = MARKERS.ringOpacity * level * pulse;
        marker.core.opacity = MARKERS.coreOpacity * level;
        marker.light.intensity = marker.lightPower * level * pulse;
      }
    },
    dispose(): void {
      group.removeFromParent();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        if (!Array.isArray(mesh.material)) mesh.material.dispose();
      }
      for (const marker of markers) marker.light.dispose();
    },
  };
}
