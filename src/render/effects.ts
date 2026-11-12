import type { Group, Object3D, Scene, Vector3 } from 'three';
import { Color, Mesh, MeshBasicMaterial, PointLight, SphereGeometry } from 'three';
import type { FlaskResource } from '../../sim/content/flasks.ts';
import type { Delivery, SkillDef } from '../../sim/content/types.ts';
import { DEGREES_TO_RADIANS, facingOf } from '../../sim/math.ts';
import type { MonsterState, ProjectileState, World, WorldEvent } from '../../sim/world/types.ts';
import { disposeObject, glow, groundArcs, markerMesh, projectileMesh, scorchMesh, shockwaveMesh, skyBolt, slashMesh, telegraphFor } from './effect-shapes.ts';
import type { Telegraph } from './effect-shapes.ts';
import type { DashTrails } from './dash-trail.ts';
import { createDashTrails } from './dash-trail.ts';
import type { IsoCamera } from './iso-camera.ts';
import type { StormEffects } from './storm-effects.ts';
import { createStormEffects } from './storm-effects.ts';
import type { BurstOptions, ParticleSystem } from './particles.ts';
import { renderBudget } from '../mobile/quality.ts';

export const EFFECTS = {
  slashTime: 0.2,
  slashHeight: 1.15,
  slashTilt: 0.22,
  ringTime: 0.42,
  waveTime: 0.55,
  waveSize: 1.2,
  waveTrail: 0.36,
  ringTrail: 0.5,
  markerSize: 0.95,
  scorchTime: 1.6,
  scorchSize: 0.8,
  boltTime: 0.22,
  arcTime: 0.26,
  markerTime: 0.4,
  flashLights: 3,
  warmFrames: 3,
  warmDepth: -30,
  warmScale: 0.001,
  flashDecay: 9,
  hurtDecay: 2.6,
  projectileHeight: 1.25,
  killStop: 0.03,
  critStop: 1.6,
  maxStop: 0.11,
  hurtShake: 0.34,
  deathShake: 0.6,
  punch: 0.16,
  emberEvery: 0.07,
  flameSize: 0.17,
  telegraphHeight: 0.09,
  telegraphStart: 0.45,
  telegraphFaint: 0.07,
  telegraphStrong: 0.24,
  telegraphEdge: 0.5,
  telegraphEdgeIn: 6,
  phaseRing: 9,
  phaseShake: 0.5,
  castLift: 1.7,
  castReach: 0.6,
  markRise: 0.4,
  guardSparks: 14,
  breakSparks: 30,
  guardShake: 0.12,
  breakShake: 0.35,
  breakRing: 2.4,
  rootRing: 1.1,
  rootSpray: 18,
  guardHeight: 1.3,
  guardBack: 0.5,
} as const;

interface Transient {
  readonly object: Mesh | Group;
  readonly duration: number;
  readonly tick: (t: number) => void;
  age: number;
  owner: number | null;
}

interface ProjectileView {
  readonly mesh: Mesh;
  readonly color: Color;
}

export interface Effects {
  handle(events: readonly WorldEvent[], world: World): void;
  update(dt: number, world: World): void;
  clickMarker(x: number, z: number, hostile: boolean): void;
  takeHitStop(): number;
  setTorches(points: readonly Vector3[]): void;
  clear(): void;
  readonly hurt: number;
}

const BONE: Color = new Color(0xe9e2cf);
const BLOOD: Color = new Color(0xff3b2a);
const GOLD: Color = new Color(0xffc94d);
const EMBER: Color = new Color(0xff8a2e);
const DUST: Color = new Color(0x2a3442);
const MOVE_MARK: Color = new Color(0xb9c6d6);
const ATTACK_MARK: Color = new Color(0xd9705a);
const TELEGRAPH: Color = new Color(0xff3a2a);
const WHITE: Color = new Color(0xffffff);
const FLASK_GLOW: Readonly<Record<FlaskResource, Color>> = { life: new Color(0xd8402e), mana: new Color(0x4f9be0) };
const FLASK_SPRAY: Partial<BurstOptions> = { speed: { min: 0.3, max: 1.4 }, lift: { min: 1.5, max: 4 }, life: { min: 0.5, max: 1 }, size: { min: 0.15, max: 0.35 }, gravity: 1, drag: 1.4, jitter: 0.6 };
const FLASK_BURST = { height: 0.5, count: 22, ring: 1.6, ringTime: 0.5 } as const;
const SPARK: Color = new Color(0xffc070);
const ROOT: Color = new Color(0x5d7a52);

function landsAhead(skill: SkillDef): boolean {
  const delivery = skill.delivery;
  return skill.leap !== null || delivery.type === 'blink' || (delivery.type === 'area' && delivery.anchor === 'ground');
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export function createEffects(scene: Scene, particles: ParticleSystem, camera: IsoCamera, onFlash: (power: number) => void): Effects {
  const transients: Transient[] = [];
  const projectiles: Map<number, ProjectileView> = new Map<number, ProjectileView>();
  const colors: Map<string, Color> = new Map<string, Color>();
  const lights: PointLight[] = [];
  let nextLight: number = 0;
  let hitStop: number = 0;
  let hurt: number = 0;
  let emberTimer: number = 0;
  const dashTrails: DashTrails = createDashTrails(scene, particles);

  const flashCount: number = Math.max(1, Math.min(EFFECTS.flashLights, renderBudget().flashLights));
  for (let index: number = 0; index < flashCount; index += 1) {
    const light: PointLight = new PointLight(0xffffff, 0, 16, 1.6);
    scene.add(light);
    lights.push(light);
  }
  const flameMaterial: MeshBasicMaterial = new MeshBasicMaterial({ color: glow(EMBER, 3.4) });
  const flameGeometry: SphereGeometry = new SphereGeometry(EFFECTS.flameSize, 10, 8);
  let torches: readonly Vector3[] = [];
  let flames: Mesh[] = [];

  const keepers: Mesh[] = [shockwaveMesh(WHITE, EFFECTS.waveTrail, 1).mesh, scorchMesh(WHITE).mesh, markerMesh(WHITE).mesh, slashMesh(1, 1, WHITE).mesh];
  let warmFrames: number = EFFECTS.warmFrames;
  for (const keeper of keepers) {
    keeper.position.set(0, EFFECTS.warmDepth, 0);
    keeper.scale.setScalar(EFFECTS.warmScale);
    keeper.frustumCulled = false;
    scene.add(keeper);
  }

  const colorOf = (hex: string): Color => {
    const cached: Color | undefined = colors.get(hex);
    if (cached !== undefined) return cached;
    const created: Color = new Color(hex);
    colors.set(hex, created);
    return created;
  };

  const add = (object: Mesh | Group, duration: number, tick: (t: number) => void, owner: number | null): void => {
    scene.add(object);
    tick(0);
    transients.push({ object, duration, tick, age: 0, owner });
  };

  const cancelOwned = (owner: number): void => {
    for (const transient of transients) if (transient.owner === owner) transient.age = transient.duration;
  };

  const flashLight = (x: number, y: number, z: number, color: Color, intensity: number): void => {
    const light: PointLight | undefined = lights[nextLight];
    nextLight = (nextLight + 1) % flashCount;
    if (light === undefined) return;
    light.color.copy(color);
    light.intensity = intensity;
    light.position.set(x, y, z);
  };

  const spray = (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>): void => {
    particles.burst({ x, y, z, count, color, speed: { min: 2, max: 7 }, lift: { min: 1, max: 5 }, life: { min: 0.25, max: 0.6 }, size: { min: 0.25, max: 0.6 }, gravity: 14, drag: 2.2, dirX: 0, dirZ: 1, spread: Math.PI * 2, jitter: 0.3, ...overrides });
  };

  const slash = (x: number, z: number, direction: { readonly x: number; readonly z: number }, reach: number, arcDegrees: number, color: Color, mirrored: boolean): void => {
    const { mesh, material } = slashMesh(arcDegrees * DEGREES_TO_RADIANS, reach, glow(color, 1.6));
    mesh.position.set(x, EFFECTS.slashHeight, z);
    mesh.rotation.set(0, facingOf(direction), mirrored ? -EFFECTS.slashTilt : EFFECTS.slashTilt, 'YXZ');
    mesh.scale.x = mirrored ? -1 : 1;
    add(
      mesh,
      EFFECTS.slashTime,
      (t: number): void => {
        material.uniforms['uProgress'] = { value: easeOut(t) };
        material.uniforms['uOpacity'] = { value: 1 - t * t * t };
      },
      null,
    );
  };

  const ring = (x: number, z: number, radius: number, color: Color, duration: number): void => {
    const wave = shockwaveMesh(glow(color, 0.9), EFFECTS.ringTrail, 0);
    wave.mesh.position.set(x, 0.12, z);
    wave.mesh.scale.setScalar(radius * EFFECTS.waveSize);
    add(
      wave.mesh,
      duration,
      (t: number): void => {
        wave.material.uniforms['uProgress'] = { value: t };
      },
      null,
    );
  };

  const shockwave = (x: number, z: number, radius: number, color: Color): void => {
    const wave = shockwaveMesh(glow(color, 1.25), EFFECTS.waveTrail, 1);
    wave.mesh.position.set(x, 0.13, z);
    wave.mesh.scale.setScalar(radius * EFFECTS.waveSize);
    add(
      wave.mesh,
      EFFECTS.waveTime,
      (t: number): void => {
        wave.material.uniforms['uProgress'] = { value: t };
      },
      null,
    );
    const scorch = scorchMesh(color);
    scorch.mesh.position.set(x, 0.1, z);
    scorch.mesh.scale.setScalar(radius * EFFECTS.scorchSize);
    add(
      scorch.mesh,
      EFFECTS.scorchTime,
      (t: number): void => {
        scorch.material.uniforms['uFade'] = { value: 1 - t * t };
      },
      null,
    );
    const bolt = skyBolt(color);
    bolt.position.set(x, 0, z);
    add(
      bolt,
      EFFECTS.boltTime,
      (t: number): void => {
        bolt.visible = t < 0.4 || (t > 0.55 && t < 0.8);
      },
      null,
    );
    const arcs = groundArcs(color, radius);
    arcs.position.set(x, 0.16, z);
    add(
      arcs,
      EFFECTS.arcTime,
      (t: number): void => {
        arcs.visible = t < 0.3 || (t > 0.45 && t < 0.7) || t > 0.85;
        arcs.material.opacity = 1 - t * t;
      },
      null,
    );
    for (let step: number = 0; step < 20; step += 1) {
      const angle: number = (step / 20) * Math.PI * 2 + Math.random() * 0.3;
      const dirX: number = Math.sin(angle);
      const dirZ: number = Math.cos(angle);
      spray(x + dirX * 0.7, 0.25, z + dirZ * 0.7, color, 2, { dirX, dirZ, spread: 0.35, speed: { min: radius * 2.4, max: radius * 4.2 }, lift: { min: 0.3, max: 2.6 }, life: { min: 0.22, max: 0.5 }, size: { min: 0.22, max: 0.5 }, drag: 4.5 });
      spray(x + dirX * 1.1, 0.2, z + dirZ * 1.1, DUST, 2, { dirX, dirZ, spread: 0.6, speed: { min: radius * 0.9, max: radius * 1.7 }, lift: { min: 0.2, max: 1.4 }, life: { min: 0.5, max: 1.1 }, size: { min: 1.6, max: 3.2 }, gravity: 0.4, drag: 2.6, jitter: 0.6 });
    }
    spray(x, 0.4, z, color, 20, { speed: { min: 1, max: 5 }, lift: { min: 4, max: 12 }, life: { min: 0.25, max: 0.6 }, size: { min: 0.16, max: 0.36 } });
    flashLight(x, 3, z, color, 70);
    onFlash(0.5);
  };

  const telegraph = (owner: number, x: number, z: number, direction: { readonly x: number; readonly z: number }, skill: SkillDef, duration: number): void => {
    const shape: Telegraph = telegraphFor(skill.delivery, TELEGRAPH);
    shape.object.position.set(x, EFFECTS.telegraphHeight, z);
    shape.object.rotation.y = facingOf(direction);
    add(
      shape.object,
      duration,
      (t: number): void => {
        const grown: number = EFFECTS.telegraphStart + (1 - EFFECTS.telegraphStart) * easeOut(t);
        for (const fill of shape.fills) {
          fill.material.opacity = EFFECTS.telegraphFaint + EFFECTS.telegraphStrong * t * t;
          if (shape.lanes) fill.scale.set(1, 1, grown);
          else fill.scale.setScalar(grown);
        }
        for (const edge of shape.edges) edge.material.opacity = EFFECTS.telegraphEdge * Math.min(1, t * EFFECTS.telegraphEdgeIn);
      },
      owner,
    );
  };

  const levelUp = (x: number, z: number): void => {
    ring(x, z, 6, GOLD, 0.7);
    spray(x, 0.3, z, GOLD, 60, { speed: { min: 0.5, max: 3.5 }, lift: { min: 4, max: 14 }, life: { min: 0.6, max: 1.3 }, size: { min: 0.25, max: 0.6 }, gravity: 3, drag: 1.2, jitter: 1.4 });
    flashLight(x, 3, z, GOLD, 110);
    onFlash(0.5);
  };

  const onSkillStart = (event: Extract<WorldEvent, { type: 'skill_start' }>, world: World): void => {
    if (event.skill.vfx.style === 'roll') {
      const roller: { readonly pos: { readonly x: number; readonly z: number } } | undefined = event.actorId === world.player.id ? world.player : world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
      if (roller !== undefined) dashTrails.start(event.actorId, roller.pos, event.direction, colorOf(event.skill.vfx.color));
    }
    if (event.actorId === world.player.id) return;
    const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
    if (monster === undefined) return;
    const type: Delivery['type'] = event.skill.delivery.type;
    const casts: boolean = type === 'projectile' || type === 'mark' || type === 'field' || type === 'revive';
    const lands: { readonly x: number; readonly z: number } = landsAhead(event.skill) ? (monster.action?.target ?? monster.pos) : monster.pos;
    if (!casts || type === 'projectile') telegraph(monster.id, lands.x, lands.z, event.direction, event.skill, event.windup);
    if (casts) spray(monster.pos.x + event.direction.x * 0.6, 1.7, monster.pos.z + event.direction.z * 0.6, colorOf(event.skill.vfx.color), 16, { speed: { min: 0.3, max: 1.6 }, lift: { min: 0.3, max: 2.2 }, life: { min: 0.3, max: event.windup + 0.1 }, gravity: -1, size: { min: 0.25, max: 0.55 } });
  };

  const onImpact = (event: Extract<WorldEvent, { type: 'skill_impact' }>): void => {
    const color: Color = colorOf(event.skill.vfx.color);
    const delivery = event.skill.delivery;
    cancelOwned(event.actorId);
    switch (delivery.type) {
      case 'arc':
        slash(event.origin.x, event.origin.z, event.direction, delivery.reach, delivery.arcDegrees, color, event.team === 'monster');
        break;
      case 'nova':
        shockwave(event.origin.x, event.origin.z, delivery.radius, color);
        break;
      case 'mark':
      case 'field':
        spray(event.origin.x + event.direction.x * EFFECTS.castReach, EFFECTS.castLift, event.origin.z + event.direction.z * EFFECTS.castReach, color, 12, { speed: { min: 1, max: 4 }, lift: { min: 0.5, max: 3 }, life: { min: 0.2, max: 0.5 } });
        break;
      case 'projectile':
        spray(event.origin.x + event.direction.x, EFFECTS.projectileHeight, event.origin.z + event.direction.z, color, 10, { dirX: event.direction.x, dirZ: event.direction.z, spread: 0.9, speed: { min: 3, max: 9 }, lift: { min: -1, max: 2 }, gravity: 2 });
        if (event.team === 'player') flashLight(event.origin.x, 2, event.origin.z, color, 40);
        break;
      case 'dash':
        if (event.skill.vfx.style === 'roll') dashTrails.land(event.origin, event.direction, color);
        break;
      case 'revive':
      case 'area':
      case 'chain':
      case 'beam':
      case 'blink':
        break;
    }
    if (event.team !== 'player') return;
    const landed: boolean = event.hits > 0 || delivery.type === 'nova';
    camera.addTrauma(event.skill.shake * (landed ? 1 : 0.2));
  };

  const onDamage = (event: Extract<WorldEvent, { type: 'damage' }>): void => {
    const skillColor: Color = colorOf(event.skill.vfx.color);
    if (event.targetTeam === 'player') {
      hurt = 1;
      camera.addTrauma(Math.max(EFFECTS.hurtShake, event.skill.shake));
      hitStop = Math.min(EFFECTS.maxStop, Math.max(hitStop, event.skill.hitStop));
      if (event.skill.root > 0 && !event.killed) {
        ring(event.pos.x, event.pos.z, EFFECTS.rootRing, ROOT, event.skill.root);
        spray(event.pos.x, 0.3, event.pos.z, ROOT, EFFECTS.rootSpray, { speed: { min: 0.3, max: 1.4 }, lift: { min: 0.2, max: 1.6 }, life: { min: 0.4, max: event.skill.root }, gravity: 1, size: { min: 0.3, max: 0.7 } });
      }
      spray(event.pos.x, 1.3, event.pos.z, BLOOD, 14, { dirX: event.direction.x, dirZ: event.direction.z, spread: 1.4, speed: { min: 2, max: 7 } });
      return;
    }
    const count: number = event.crit ? 22 : 11;
    spray(event.pos.x, 1.25, event.pos.z, BONE, count, { dirX: event.direction.x, dirZ: event.direction.z, spread: 1.1, speed: { min: 4, max: event.crit ? 15 : 10 }, lift: { min: 0.5, max: 6 } });
    spray(event.pos.x, 1.25, event.pos.z, skillColor, Math.ceil(count / 2), { dirX: event.direction.x, dirZ: event.direction.z, spread: 1.8, speed: { min: 2, max: 8 }, size: { min: 0.3, max: 0.8 }, life: { min: 0.15, max: 0.4 } });
    hitStop = Math.min(EFFECTS.maxStop, Math.max(hitStop, event.skill.hitStop * (event.crit ? EFFECTS.critStop : 1) + (event.killed ? EFFECTS.killStop : 0)));
    camera.punch(event.direction.x, event.direction.z, EFFECTS.punch * (event.crit ? 2 : 1));
    if (event.crit) flashLight(event.pos.x, 2, event.pos.z, WHITE, 60);
  };

  const onDeath = (event: Extract<WorldEvent, { type: 'death' }>, world: World): void => {
    cancelOwned(event.actorId);
    if (event.team === 'player') {
      camera.addTrauma(EFFECTS.deathShake);
      spray(event.pos.x, 1.2, event.pos.z, BLOOD, 50, { speed: { min: 2, max: 9 }, lift: { min: 2, max: 9 }, life: { min: 0.4, max: 1 } });
      return;
    }
    const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
    const tint: Color = monster === undefined ? BONE : colorOf(monster.def.color);
    spray(event.pos.x, 1.1, event.pos.z, BONE, 26, { dirX: event.direction.x, dirZ: event.direction.z, spread: 2.4, speed: { min: 3, max: 12 }, lift: { min: 2, max: 9 }, life: { min: 0.4, max: 0.95 }, size: { min: 0.3, max: 0.7 } });
    spray(event.pos.x, 1.4, event.pos.z, tint, 18, { speed: { min: 0.5, max: 3 }, lift: { min: 2, max: 7 }, life: { min: 0.5, max: 1.1 }, gravity: -2, size: { min: 0.35, max: 0.9 } });
    ring(event.pos.x, event.pos.z, 2.2, tint, 0.3);
  };

  const onProjectileEnd = (event: Extract<WorldEvent, { type: 'projectile_end' }>): void => {
    const view: ProjectileView | undefined = projectiles.get(event.id);
    if (view !== undefined) {
      disposeObject(view.mesh);
      projectiles.delete(event.id);
    }
    const color: Color = colorOf(event.skill.vfx.color);
    spray(event.pos.x, EFFECTS.projectileHeight, event.pos.z, color, event.hit ? 20 : 8, { speed: { min: 2, max: 9 }, lift: { min: -1, max: 5 }, life: { min: 0.2, max: 0.5 }, size: { min: 0.3, max: 0.8 } });
    if (event.hit) {
      ring(event.pos.x, event.pos.z, 1.6, color, 0.24);
      flashLight(event.pos.x, 1.6, event.pos.z, color, 55);
    }
  };

  const onHazard = (event: Extract<WorldEvent, { type: 'hazard' }>): void => {
    const hazard = event.hazard;
    const color: Color = colorOf(hazard.skill.vfx.color);
    if (!event.burst) {
      telegraph(hazard.id, hazard.pos.x, hazard.pos.z, { x: 0, z: 1 }, hazard.skill, hazard.delay);
      spray(hazard.pos.x, 0.2, hazard.pos.z, color, 10, { speed: { min: 0.2, max: 1 }, lift: { min: 0.5, max: 2 }, life: { min: EFFECTS.markRise, max: hazard.delay }, gravity: -0.5, jitter: hazard.radius * 0.5 });
      return;
    }
    cancelOwned(hazard.id);
    shockwave(hazard.pos.x, hazard.pos.z, hazard.radius, color);
    if (event.hits > 0) camera.addTrauma(hazard.skill.shake);
  };

  const onGuarded = (event: Extract<WorldEvent, { type: 'guarded' }>): void => {
    const lift: number = EFFECTS.guardHeight;
    const backX: number = event.pos.x - event.direction.x * EFFECTS.guardBack;
    const backZ: number = event.pos.z - event.direction.z * EFFECTS.guardBack;
    spray(backX, lift, backZ, SPARK, event.broken ? EFFECTS.breakSparks : EFFECTS.guardSparks, { dirX: -event.direction.x, dirZ: -event.direction.z, spread: 1.2, speed: { min: 3, max: 10 }, lift: { min: 0.5, max: 5 }, life: { min: 0.12, max: 0.35 }, size: { min: 0.15, max: 0.35 }, gravity: 6 });
    flashLight(backX, lift, backZ, SPARK, event.broken ? 60 : 25);
    camera.addTrauma(event.broken ? EFFECTS.breakShake : EFFECTS.guardShake);
    if (event.broken) ring(event.pos.x, event.pos.z, EFFECTS.breakRing, SPARK, EFFECTS.ringTime);
  };

  const projectileView = (projectile: ProjectileState): ProjectileView => {
    const existing: ProjectileView | undefined = projectiles.get(projectile.id);
    if (existing !== undefined) return existing;
    const color: Color = colorOf(projectile.skill.vfx.color);
    const mesh: Mesh = projectileMesh(projectile.skill.vfx.style === 'orb' ? 'orb' : 'bolt', color);
    mesh.rotation.y = facingOf(projectile.direction);
    scene.add(mesh);
    const view: ProjectileView = { mesh, color };
    projectiles.set(projectile.id, view);
    return view;
  };

  const storm: StormEffects = createStormEffects({ add, spray, ring, shockwave, flashLight, colorOf, addObject: (object: Object3D): void => void scene.add(object), trauma: (amount: number): void => camera.addTrauma(amount) });

  return {
    get hurt(): number {
      return hurt;
    },
    takeHitStop(): number {
      const pending: number = hitStop;
      hitStop = 0;
      return pending;
    },
    clickMarker(x: number, z: number, hostile: boolean): void {
      const marker = markerMesh(hostile ? ATTACK_MARK : MOVE_MARK);
      marker.mesh.position.set(x, 0.11, z);
      marker.mesh.scale.setScalar(EFFECTS.markerSize);
      add(
        marker.mesh,
        EFFECTS.markerTime,
        (t: number): void => {
          marker.material.uniforms['uProgress'] = { value: t };
        },
        null,
      );
      if (!hostile) spray(x, 0.12, z, DUST, 5, { speed: { min: 0.3, max: 1.2 }, lift: { min: 0.3, max: 1.1 }, life: { min: 0.3, max: 0.6 }, size: { min: 0.5, max: 1.1 }, gravity: 1.5, drag: 3 });
    },
    handle(events: readonly WorldEvent[], world: World): void {
      for (const event of events) {
        storm.handle(event);
        switch (event.type) {
          case 'skill_start':
            onSkillStart(event, world);
            break;
          case 'skill_impact':
            onImpact(event);
            break;
          case 'skill_interrupt':
            cancelOwned(event.actorId);
            break;
          case 'revive':
            break;
          case 'hazard':
            onHazard(event);
            break;
          case 'guarded':
            onGuarded(event);
            break;
          case 'damage':
            onDamage(event);
            break;
          case 'death':
            onDeath(event, world);
            break;
          case 'projectile_spawn':
            projectileView(event.projectile);
            break;
          case 'projectile_end':
            onProjectileEnd(event);
            break;
          case 'level_up':
            levelUp(world.player.pos.x, world.player.pos.z);
            break;
          case 'monster_spawn': {
            const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.monsterId);
            if (monster !== undefined) spray(monster.pos.x, 0.2, monster.pos.z, colorOf(monster.def.color), 16, { speed: { min: 0.5, max: 2.5 }, lift: { min: 2, max: 8 }, life: { min: 0.4, max: 1 }, gravity: 2, jitter: 0.8 });
            break;
          }
          case 'pickup':
            spray(event.ground.pos.x, 0.5, event.ground.pos.z, GOLD, event.ground.content.kind === 'gold' ? 12 : 20, { speed: { min: 0.5, max: 3 }, lift: { min: 2, max: 7 }, life: { min: 0.3, max: 0.7 }, gravity: 4 });
            break;
          case 'surge':
            onFlash(1);
            camera.addTrauma(0.35);
            break;
          case 'player_respawn':
            ring(world.player.pos.x, world.player.pos.z, 5, MOVE_MARK, 0.6);
            break;
          case 'checkpoint':
            ring(event.pos.x, event.pos.z, 4, EMBER, 0.7);
            spray(event.pos.x, 0.3, event.pos.z, EMBER, 26, { speed: { min: 0.5, max: 2.6 }, lift: { min: 2, max: 7 }, life: { min: 0.5, max: 1.1 }, gravity: 2, jitter: 0.6 });
            break;
          case 'boss_phase': {
            const boss: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.monsterId);
            if (boss === undefined) break;
            ring(boss.pos.x, boss.pos.z, EFFECTS.phaseRing, colorOf(boss.def.color), EFFECTS.waveTime);
            spray(boss.pos.x, 1.4, boss.pos.z, colorOf(boss.def.color), 40, { speed: { min: 2, max: 9 }, lift: { min: 1, max: 8 }, life: { min: 0.4, max: 1.1 }, gravity: 3, jitter: 0.8 });
            camera.addTrauma(EFFECTS.phaseShake);
            break;
          }
          case 'flask_used':
            spray(event.pos.x, FLASK_BURST.height, event.pos.z, FLASK_GLOW[event.resource], FLASK_BURST.count, FLASK_SPRAY);
            ring(event.pos.x, event.pos.z, FLASK_BURST.ring, FLASK_GLOW[event.resource], FLASK_BURST.ringTime);
            break;
          case 'bark':
          case 'flasks_refilled':
          case 'monster_remove':
          case 'aggro':
          case 'drop':
          case 'area':
          case 'chain':
          case 'beam':
          case 'blink':
          case 'brand':
          case 'skill_unlocked':
          case 'xp':
          case 'surge_cleared':
          case 'notice':
          case 'glitch_start':
          case 'glitch_end':
          case 'glitch_word':
          case 'silence':
          case 'zone_edited':
          case 'moment_mark':
          case 'moment_strike':
          case 'moment_woke':
          case 'moment_ended':
          case 'moment_gone':
          case 'path_marked':
          case 'character_changed':
          case 'zone_changed':
          case 'hero_step':
          case 'explored':
          case 'dialogue_line':
          case 'dialogue_closed':
          case 'quest_started':
          case 'quest_advanced':
          case 'act_ended':
          case 'triggered':
          case 'quest_completed':
          case 'waypoint_unlocked':
          case 'exit_locked':
            break;
        }
      }
    },
    setTorches(points: readonly Vector3[]): void {
      for (const flame of flames) flame.removeFromParent();
      torches = points;
      flames = points.map((point: Vector3): Mesh => {
        const flame: Mesh = new Mesh(flameGeometry, flameMaterial);
        flame.position.copy(point);
        scene.add(flame);
        return flame;
      });
    },
    clear(): void {
      for (const transient of transients) disposeObject(transient.object);
      transients.length = 0;
      for (const view of projectiles.values()) disposeObject(view.mesh);
      projectiles.clear();
      for (const light of lights) light.intensity = 0;
      dashTrails.clear();
      storm.clear();
    },
    update(dt: number, world: World): void {
      dashTrails.update(dt, world);
      storm.update(dt, world);
      for (const transient of transients) {
        transient.age += dt;
        if (transient.age < transient.duration) transient.tick(transient.age / transient.duration);
        else disposeObject(transient.object);
      }
      for (let index: number = transients.length - 1; index >= 0; index -= 1) {
        const transient: Transient | undefined = transients[index];
        if (transient !== undefined && transient.age >= transient.duration) transients.splice(index, 1);
      }
      for (const projectile of world.projectiles) {
        const view: ProjectileView = projectileView(projectile);
        view.mesh.position.set(projectile.pos.x, EFFECTS.projectileHeight, projectile.pos.z);
        view.mesh.rotation.z += dt * 14;
        spray(projectile.pos.x, EFFECTS.projectileHeight, projectile.pos.z, view.color, 2, { speed: { min: 0, max: 1.2 }, lift: { min: -0.6, max: 0.8 }, life: { min: 0.12, max: 0.32 }, size: { min: 0.3, max: 0.7 }, gravity: 0, jitter: 0.25 });
      }
      if (warmFrames > 0) {
        warmFrames -= 1;
        if (warmFrames === 0) for (const keeper of keepers) keeper.visible = false;
      }
      for (const light of lights) light.intensity *= Math.exp(-EFFECTS.flashDecay * dt);
      hurt = Math.max(0, hurt - EFFECTS.hurtDecay * dt);
      emberTimer -= dt;
      if (emberTimer <= 0 && torches.length > 0) {
        emberTimer = EFFECTS.emberEvery;
        const torch: Vector3 | undefined = torches[Math.floor(Math.random() * torches.length)];
        if (torch !== undefined) spray(torch.x, torch.y + 0.1, torch.z, EMBER, 1, { speed: { min: 0, max: 0.5 }, lift: { min: 0.8, max: 2.4 }, life: { min: 0.6, max: 1.5 }, size: { min: 0.2, max: 0.45 }, gravity: -0.6, drag: 0.5, jitter: 0.15 });
      }
      flames.forEach((flame: Mesh, index: number): void => {
        flame.scale.setScalar(0.85 + 0.25 * Math.sin(world.time * 17 + index * 2.1) + 0.12 * Math.sin(world.time * 41 + index));
      });
    },
  };
}
