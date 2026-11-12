import type { BufferGeometry, IUniform } from 'three';
import { AdditiveBlending, CircleGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ZoneExit } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import type { EncounterState, World } from '../../sim/world/types.ts';

export const VOID_LIGHT = {
  color: 0xffd99a,
  pillarWidth: 1.6,
  pillarHeight: 34,
  pillarOpacity: 0.9,
  haloRadius: 5,
  haloOpacity: 0.6,
  rise: 0.9,
  breathe: 0.12,
  breatheRate: 0.9,
  renderOrder: 20,
} as const;

export interface VoidLight {
  readonly group: Group;
  readonly uniform: IUniform<Vector3>;
  update(world: World, now: number, dt: number): void;
  dispose(): void;
}

function pillarGeometry(): BufferGeometry {
  const planes: BufferGeometry[] = [0, Math.PI / 3, (Math.PI * 2) / 3].map((yaw: number): BufferGeometry => {
    const plane: PlaneGeometry = new PlaneGeometry(VOID_LIGHT.pillarWidth, VOID_LIGHT.pillarHeight, 1, 8);
    plane.rotateY(yaw);
    plane.translate(0, VOID_LIGHT.pillarHeight / 2, 0);
    return plane;
  });
  return mergeGeometries(planes);
}

function placedLight(world: World): ZoneExit | null {
  for (const met of world.zone.void?.encounters ?? []) {
    if (met.find.type !== 'exit') continue;
    const exitId: string = met.find.exit;
    const placed: boolean = world.encounters.some((state: EncounterState): boolean => state.id === met.id && state.pos !== null);
    const exit: ZoneExit | undefined = world.zone.exits.find((entry: ZoneExit): boolean => entry.id === exitId);
    if (placed && exit !== undefined && allHold(world, exit.requires)) return exit;
  }
  return null;
}

export function createVoidLight(floor: number): VoidLight {
  const group: Group = new Group();
  const tint: Color = new Color(VOID_LIGHT.color);
  const geometry: BufferGeometry = pillarGeometry();
  const pillarMaterial: MeshBasicMaterial = new MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
  const pillar: Mesh = new Mesh(geometry, pillarMaterial);
  pillar.renderOrder = VOID_LIGHT.renderOrder;
  const haloGeometry: CircleGeometry = new CircleGeometry(VOID_LIGHT.haloRadius, 40);
  haloGeometry.rotateX(-Math.PI / 2);
  const haloMaterial: MeshBasicMaterial = new MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const halo: Mesh = new Mesh(haloGeometry, haloMaterial);
  halo.position.y = floor + 0.02;
  halo.renderOrder = VOID_LIGHT.renderOrder;
  group.add(pillar, halo);
  group.visible = false;
  const uniform: IUniform<Vector3> = { value: new Vector3() };
  let strength: number = 0;

  return {
    group,
    uniform,
    update(world: World, now: number, dt: number): void {
      const exit: ZoneExit | null = placedLight(world);
      const wanted: number = exit === null ? 0 : 1;
      strength += (wanted - strength) * Math.min(1, dt * VOID_LIGHT.rise);
      if (exit !== null) {
        group.position.set(exit.x, floor, exit.z);
        uniform.value.set(exit.x, exit.z, strength);
      } else {
        uniform.value.z = strength;
      }
      const breathing: number = 1 - VOID_LIGHT.breathe + VOID_LIGHT.breathe * Math.sin(now * VOID_LIGHT.breatheRate);
      pillarMaterial.opacity = VOID_LIGHT.pillarOpacity * strength * breathing;
      haloMaterial.opacity = VOID_LIGHT.haloOpacity * strength * breathing;
      group.visible = strength > 1e-3;
    },
    dispose(): void {
      group.removeFromParent();
      geometry.dispose();
      haloGeometry.dispose();
      pillarMaterial.dispose();
      haloMaterial.dispose();
    },
  };
}
