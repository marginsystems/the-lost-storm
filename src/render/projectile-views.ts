import type { Color, Mesh, Scene } from 'three';
import type { VfxStyle } from '../../sim/content/vfx-types.ts';
import { facingOf } from '../../sim/math.ts';
import { SKILLS } from '../../sim/world/skills.ts';
import type { ProjectileState, World, WorldEvent } from '../../sim/world/types.ts';
import { disposeObject, glow, orbHalo, projectileMesh } from './effect-shapes.ts';
import type { EffectKit } from './effect-kit.ts';
import { KIT } from './effect-kit.ts';
import { beatWings, firebirdMesh } from './firebird.ts';
import type { GhostWaves } from './ghost-wave.ts';
import type { BurstOptions } from './particles.ts';
import { floorUp, glideFloor, liftHere } from './terrain-lift.ts';

export const PROJECTILE_VIEWS = {
  height: 1.25,
  slimFrom: 0.35,
  shortFrom: 0.45,
  dimFrom: 0.4,
  spin: 14,
  hitSparks: 20,
  missSparks: 8,
  hitRing: 1.6,
  hitRingTime: 0.24,
  hitLight: 55,
  hitLightHeight: 1.6,
  flightMotes: 2,
  tintPeak: 0.6,
} as const;

const END_SPRAY: Partial<BurstOptions> = { speed: { min: 2, max: 9 }, lift: { min: -1, max: 5 }, life: { min: 0.2, max: 0.5 }, size: { min: 0.3, max: 0.8 } };
const FLIGHT_SPRAY: Partial<BurstOptions> = { speed: { min: 0, max: 1.2 }, lift: { min: -0.6, max: 0.8 }, life: { min: 0.12, max: 0.32 }, size: { min: 0.3, max: 0.7 }, gravity: 0, jitter: 0.25 };

export interface BoltShape {
  readonly glow: number;
  readonly girth: number;
  readonly length: number;
}

export function boltShape(style: VfxStyle, light: number): BoltShape {
  const lit: number = Math.min(1, light);
  const girth: number = PROJECTILE_VIEWS.slimFrom + (1 - PROJECTILE_VIEWS.slimFrom) * lit;
  return {
    glow: PROJECTILE_VIEWS.dimFrom + (1 - PROJECTILE_VIEWS.dimFrom) * lit,
    girth,
    length: style === 'orb' ? girth : PROJECTILE_VIEWS.shortFrom + (1 - PROJECTILE_VIEWS.shortFrom) * lit,
  };
}

export interface ShotTint {
  readonly core: Color;
  readonly glow: Color;
}

export function tintCore(core: Color, light: number): Color {
  const peak: number = Math.max(core.r, core.g, core.b);
  return core.clone().multiplyScalar(peak > 0 ? (PROJECTILE_VIEWS.tintPeak * light) / peak : 0);
}

export interface ProjectileViewDeps {
  readonly scene: Scene;
  readonly kit: EffectKit;
  readonly waves: GhostWaves;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
  readonly colorOf: (hex: string) => Color;
  readonly tintOf: (projectileId: number) => ShotTint | null;
}

export interface ProjectileViews {
  spawn(projectile: ProjectileState): void;
  end(event: Extract<WorldEvent, { type: 'projectile_end' }>): void;
  update(dt: number, world: World): void;
  clear(): void;
}

interface ProjectileView {
  readonly mesh: Mesh;
  readonly color: Color;
}

export function createProjectileViews(deps: ProjectileViewDeps): ProjectileViews {
  const { scene, kit, waves, spray, ring, flashLight, colorOf, tintOf } = deps;
  const views: Map<number, ProjectileView> = new Map<number, ProjectileView>();
  const flights: Map<number, number> = new Map<number, number>();

  const viewOf = (projectile: ProjectileState): ProjectileView | null => {
    const vfx = projectile.skill.vfx;
    if (vfx.lightning !== null || vfx.wave !== null) return null;
    const existing: ProjectileView | undefined = views.get(projectile.id);
    if (existing !== undefined) return existing;
    const tint: ShotTint | null = tintOf(projectile.id);
    const color: Color = tint?.glow ?? colorOf(vfx.color);
    const shape: BoltShape = boltShape(vfx.style, vfx.light);
    const mesh: Mesh = vfx.style === 'firebird' ? firebirdMesh() : projectileMesh(vfx.style === 'orb' ? 'orb' : 'bolt', tint === null ? glow(color, shape.glow) : tintCore(tint.core, shape.glow));
    mesh.scale.set(mesh.scale.x * shape.girth, mesh.scale.y * shape.girth, mesh.scale.z * shape.length);
    if (tint !== null && vfx.style !== 'orb' && vfx.style !== 'firebird') mesh.add(orbHalo(tint.glow));
    mesh.rotation.y = facingOf(projectile.direction);
    scene.add(mesh);
    const view: ProjectileView = { mesh, color };
    views.set(projectile.id, view);
    return view;
  };

  return {
    spawn(projectile: ProjectileState): void {
      viewOf(projectile);
      const look = projectile.skill.vfx.wave;
      const delivery = projectile.skill.delivery;
      if (look === null || delivery.type !== 'projectile') return;
      const water = projectile.skill.vfx.water;
      waves.launch(projectile.id, projectile.from, projectile.direction, look, colorOf(projectile.skill.vfx.color), delivery.speed, delivery.range + SKILLS.projectileOrigin, water === null ? null : { foam: colorOf(water.foam), power: projectile.skill.spent });
    },
    end(event: Extract<WorldEvent, { type: 'projectile_end' }>): void {
      const view: ProjectileView | undefined = views.get(event.id);
      const color: Color = view?.color ?? colorOf(event.skill.vfx.color);
      if (view !== undefined) {
        disposeObject(view.mesh);
        views.delete(event.id);
      }
      flights.delete(event.id);
      kit.drop(event.id);
      if (event.skill.vfx.wave !== null) {
        waves.end(event.id, event.pos);
        return;
      }
      const impact = event.skill.vfx.impact;
      if (impact !== null) {
        kit.impact(event.pos.x, event.pos.z, color, event.hit ? impact : { sparks: impact.sparks * KIT.impactMiss, flash: impact.flash * KIT.impactMiss }, event.skill.vfx.light * (event.hit ? 1 : KIT.impactMiss), 0);
        return;
      }
      spray(event.pos.x, PROJECTILE_VIEWS.height, event.pos.z, color, event.hit ? PROJECTILE_VIEWS.hitSparks : PROJECTILE_VIEWS.missSparks, END_SPRAY);
      if (!event.hit) return;
      ring(event.pos.x, event.pos.z, PROJECTILE_VIEWS.hitRing, color, PROJECTILE_VIEWS.hitRingTime);
      flashLight(event.pos.x, PROJECTILE_VIEWS.hitLightHeight, event.pos.z, color, PROJECTILE_VIEWS.hitLight);
    },
    update(dt: number, world: World): void {
      for (const projectile of world.projectiles) {
        const vfx = projectile.skill.vfx;
        if (vfx.wave !== null) {
          waves.carry(projectile.id, projectile.pos);
          continue;
        }
        const flight: number = glideFloor(flights.get(projectile.id), projectile.pos.x, projectile.pos.z, dt);
        flights.set(projectile.id, flight);
        const flying: number = PROJECTILE_VIEWS.height + flight - liftHere(projectile.pos.x, projectile.pos.z);
        if (vfx.lightning !== null) {
          kit.carry(projectile.id, projectile.pos.x, flying, projectile.pos.z, projectile.direction.x, projectile.direction.z, colorOf(vfx.color), vfx.lightning, vfx.trail, vfx.linger, dt);
          continue;
        }
        const view: ProjectileView | null = viewOf(projectile);
        if (view === null) continue;
        view.mesh.position.set(projectile.pos.x, floorUp(projectile.pos.x, flying, projectile.pos.z), projectile.pos.z);
        if (vfx.style === 'firebird') beatWings(view.mesh, world.time, projectile.id);
        else view.mesh.rotation.z += dt * PROJECTILE_VIEWS.spin;
        if (vfx.trail > 0) kit.carry(projectile.id, projectile.pos.x, flying, projectile.pos.z, projectile.direction.x, projectile.direction.z, view.color, null, vfx.trail, vfx.linger, dt);
        else spray(projectile.pos.x, flying, projectile.pos.z, view.color, PROJECTILE_VIEWS.flightMotes, FLIGHT_SPRAY);
      }
    },
    clear(): void {
      for (const view of views.values()) disposeObject(view.mesh);
      views.clear();
      flights.clear();
    },
  };
}
