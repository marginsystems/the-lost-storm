import type { Group, Scene, Vector3 } from 'three';
import { Color, Mesh, MeshBasicMaterial, PointLight, SphereGeometry } from 'three';
import type { SkillDef } from '../../sim/content/types.ts';
import { DEGREES_TO_RADIANS, facingOf } from '../../sim/math.ts';
import type { MonsterState, ProjectileState, World, WorldEvent } from '../../sim/world/types.ts';
import { disposeObject, glow, groundArcs, markerMesh, pillarMesh, projectileMesh, scorchMesh, shockwaveMesh, skyBolt, slashMesh, telegraphMesh } from './effect-shapes.ts';
import type { IsoCamera } from './iso-camera.ts';
import type { BurstOptions, ParticleSystem } from './particles.ts';

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
  levelTime: 1.1,
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

  for (let index: number = 0; index < EFFECTS.flashLights; index += 1) {
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
    nextLight = (nextLight + 1) % EFFECTS.flashLights;
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
    if (skill.delivery.type !== 'arc') return;
    const mesh = telegraphMesh(skill.delivery.arcDegrees * DEGREES_TO_RADIANS, skill.delivery.reach, TELEGRAPH);
    mesh.position.set(x, 0.09, z);
    mesh.rotation.y = facingOf(direction);
    add(
      mesh,
      duration,
      (t: number): void => {
        mesh.material.opacity = 0.08 + 0.34 * t * t;
        mesh.scale.setScalar(0.55 + 0.45 * easeOut(t));
      },
      owner,
    );
  };

  const levelUp = (x: number, z: number): void => {
    const pillar = pillarMesh(glow(GOLD, 1.6), 1.1, 16);
    pillar.position.x = x;
    pillar.position.z = z;
    add(
      pillar,
      EFFECTS.levelTime,
      (t: number): void => {
        pillar.scale.set(1 + t * 0.8, 1, 1 + t * 0.8);
        pillar.material.opacity = 0.55 * (1 - t) * (1 - t);
      },
      null,
    );
    ring(x, z, 6, GOLD, 0.7);
    spray(x, 0.3, z, GOLD, 60, { speed: { min: 0.5, max: 3.5 }, lift: { min: 4, max: 14 }, life: { min: 0.6, max: 1.3 }, size: { min: 0.25, max: 0.6 }, gravity: 3, drag: 1.2, jitter: 1.4 });
    flashLight(x, 3, z, GOLD, 110);
    onFlash(0.5);
  };

  const onSkillStart = (event: Extract<WorldEvent, { type: 'skill_start' }>, world: World): void => {
    if (event.actorId === world.player.id) return;
    const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
    if (monster === undefined) return;
    telegraph(monster.id, monster.pos.x, monster.pos.z, event.direction, event.skill, event.windup);
    if (event.skill.delivery.type === 'projectile') spray(monster.pos.x + event.direction.x * 0.6, 1.7, monster.pos.z + event.direction.z * 0.6, colorOf(event.skill.vfx.color), 16, { speed: { min: 0.3, max: 1.6 }, lift: { min: 0.3, max: 2.2 }, life: { min: 0.3, max: event.windup + 0.1 }, gravity: -1, size: { min: 0.25, max: 0.55 } });
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
      case 'projectile':
        spray(event.origin.x + event.direction.x, EFFECTS.projectileHeight, event.origin.z + event.direction.z, color, 10, { dirX: event.direction.x, dirZ: event.direction.z, spread: 0.9, speed: { min: 3, max: 9 }, lift: { min: -1, max: 2 }, gravity: 2 });
        if (event.team === 'player') flashLight(event.origin.x, 2, event.origin.z, color, 40);
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
      camera.addTrauma(EFFECTS.hurtShake);
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
          case 'monster_remove':
          case 'aggro':
          case 'drop':
          case 'xp':
          case 'surge_cleared':
          case 'notice':
          case 'character_changed':
          case 'zone_changed':
          case 'hero_step':
          case 'dialogue_line':
          case 'dialogue_closed':
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
    },
    update(dt: number, world: World): void {
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
