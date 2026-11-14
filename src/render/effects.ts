import type { Group, Object3D, Scene, Vector3 } from 'three';
import { Color, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { FlaskResource } from '../../sim/content/flasks.ts';
import type { Delivery, SkillDef } from '../../sim/content/types.ts';
import { DEGREES_TO_RADIANS, facingOf } from '../../sim/math.ts';
import type { MonsterState, ProjectileState, World, WorldEvent } from '../../sim/world/types.ts';
import { disposeObject, glow, programKeepers, projectileMesh, slashMesh } from './effect-shapes.ts';
import type { Shockwave } from './shockwave.ts';
import { createShockwave } from './shockwave.ts';
import type { Telegraphs } from './telegraphs.ts';
import { createTelegraphs } from './telegraphs.ts';
import type { DashTrails } from './dash-trail.ts';
import { createDashTrails } from './dash-trail.ts';
import type { IsoCamera } from './iso-camera.ts';
import type { StormEffects } from './storm-effects.ts';
import { createStormEffects } from './storm-effects.ts';
import type { BurstOptions, ParticleSystem } from './particles.ts';
import { renderBudget } from '../mobile/quality.ts';
import type { AbilityCues } from './ability-cues.ts';
import { createAbilityCues, novaLook } from './ability-cues.ts';
import type { HurtWash } from './hurt-wash.ts';
import { CALM_WASH, stepWash, washHit } from './hurt-wash.ts';
import type { NovaLook } from './ability-cues.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, flare, GROUND_LIGHT, held, spread } from './ground-light.ts';
import type { EffectKit, KitBudget, MotionWatch } from './effect-kit.ts';
import { createEffectKit, heft, KIT, kitBudget, watchMotion } from './effect-kit.ts';
import type { FlashLights } from './flash-lights.ts';
import { createFlashLights } from './flash-lights.ts';

export const EFFECTS = {
  levelLight: 45,
  levelRing: 2.4,
  levelLightHeight: 1.6,
  slashTime: 0.2,
  slashHeight: 1.15,
  slashTilt: 0.22,
  slashGlow: 0.8,
  ringTime: 0.42,
  waveTime: 0.42,
  ringGlow: 0.9,
  ringFill: 0.18,
  ringWidth: 0.16,
  ringMinWidth: 0.25,
  ringWobble: 0.08,
  markGlow: 0.55,
  markFill: 0.6,
  markWidth: 0.35,
  markerSize: 0.75,
  markerFill: 0.3,
  markerWidth: 0.22,
  markerClose: 0.55,
  markerGlow: 0.8,
  boltLight: 40,
  markerTime: 0.4,
  flashLights: 3,
  warmFrames: 3,
  warmDepth: -30,
  warmScale: 0.001,
  releaseSparks: 5,
  projectileHeight: 1.25,
  killStop: 0.03,
  critStop: 1.6,
  maxStop: 0.11,
  hurtShake: 0.34,
  deathShake: 0.6,
  punch: 0.16,
  emberEvery: 0.07,
  flameSize: 0.17,
  phaseRing: 9,
  phaseShake: 0.5,
  defeatRing: 12,
  defeatShake: 0.9,
  defeatSparks: 90,
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
  heftReach: 0.35,
  heftGround: 0.3,
  heftAhead: 0.25,
  heftDust: 8,
  critLight: 16,
  critHeight: 2.6,
  slimFrom: 0.35,
  shortFrom: 0.45,
  dimFrom: 0.4,
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
const TELEGRAPH: Color = new Color(0xc65a4a);
const WHITE: Color = new Color(0xffffff);
const FLASK_GLOW: Readonly<Record<FlaskResource, Color>> = { life: new Color(0xd8402e), mana: new Color(0x4f9be0) };
const FLASK_SPRAY: Partial<BurstOptions> = { speed: { min: 0.3, max: 1.4 }, lift: { min: 1.5, max: 4 }, life: { min: 0.5, max: 1 }, size: { min: 0.15, max: 0.35 }, gravity: 1, drag: 1.4, jitter: 0.6 };
const FLASK_BURST = { height: 0.5, count: 22, ring: 1.6, ringTime: 0.5 } as const;
const CHEST_SPRAY: Partial<BurstOptions> = { speed: { min: 0.4, max: 2.2 }, lift: { min: 3, max: 7 }, life: { min: 0.6, max: 1.2 }, size: { min: 0.15, max: 0.4 }, gravity: 5, drag: 0.8, jitter: 0.3 };
const CHEST_BURST = { height: 0.8, count: 34, ring: 2.2, ringTime: 0.9, shake: 0.12 } as const;
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
  let hitStop: number = 0;
  let wash: HurtWash = CALM_WASH;
  let emberTimer: number = 0;
  const dashTrails: DashTrails = createDashTrails(scene, particles);

  const flashes: FlashLights = createFlashLights(scene, Math.min(EFFECTS.flashLights, renderBudget().flashLights));
  const flameMaterial: MeshBasicMaterial = new MeshBasicMaterial({ color: glow(EMBER, 3.4) });
  const flameGeometry: SphereGeometry = new SphereGeometry(EFFECTS.flameSize, 10, 8);
  let torches: readonly Vector3[] = [];
  let flames: Mesh[] = [];

  const keepers: Mesh[] = programKeepers(WHITE);
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

  const telegraphs: Telegraphs = createTelegraphs(scene);

  const cancelOwned = (owner: number): void => {
    for (const transient of transients) if (transient.owner === owner) transient.age = transient.duration;
    telegraphs.cancel(owner);
  };

  const riseLight = (x: number, y: number, z: number, color: Color, intensity: number, rise: number): void => flashes.flash(x, y, z, color, intensity, rise);
  const flashLight = (x: number, y: number, z: number, color: Color, intensity: number): void => flashes.flash(x, y, z, color, intensity, KIT.flashRise);

  const motion: MotionWatch = watchMotion();
  const kit: EffectKit = createEffectKit(scene, particles, riseLight, (): KitBudget => kitBudget(renderBudget().name, motion.reduced));

  const spray = (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>): void => {
    particles.burst({ x, y, z, count, color, speed: { min: 2, max: 7 }, lift: { min: 1, max: 5 }, life: { min: 0.25, max: 0.6 }, size: { min: 0.25, max: 0.6 }, gravity: 14, drag: 2.2, dirX: 0, dirZ: 1, spread: Math.PI * 2, jitter: 0.3, ...overrides });
  };

  const slash = (x: number, z: number, direction: { readonly x: number; readonly z: number }, reach: number, arcDegrees: number, color: Color, mirrored: boolean): void => {
    const { mesh, material } = slashMesh(arcDegrees * DEGREES_TO_RADIANS, reach, glow(color, EFFECTS.slashGlow));
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
    const wave: GroundLight = createGroundLight(color, { kind: 'round', radius, inner: 0, arc: Math.PI * 2 }, { fill: EFFECTS.ringFill, band: 1, width: Math.max(EFFECTS.ringMinWidth, radius * EFFECTS.ringWidth), wobble: radius * EFFECTS.ringWobble });
    wave.mesh.position.set(x, GROUND_LIGHT.height + 0.04, z);
    add(
      wave.mesh,
      duration,
      (t: number): void => {
        wave.front(spread(t));
        wave.pose(EFFECTS.ringGlow * flare(t), t * duration);
      },
      null,
    );
  };

  const mark = (x: number, z: number, radius: number, color: Color, duration: number): void => {
    const spot: GroundLight = createGroundLight(color, { kind: 'round', radius, inner: 0, arc: Math.PI * 2 }, { fill: EFFECTS.markFill, band: 1, width: radius * EFFECTS.markWidth, wobble: radius * EFFECTS.ringWobble });
    spot.mesh.position.set(x, GROUND_LIGHT.height + 0.03, z);
    add(
      spot.mesh,
      duration,
      (t: number): void => {
        spot.pose(EFFECTS.markGlow * held(t), t * duration);
      },
      null,
    );
  };

  const cues: AbilityCues = createAbilityCues({ add, spray, flashLight, gather: riseLight, ring });
  const shockwave: Shockwave = createShockwave({ add, spray, flashLight, shade: (x: number, z: number, radius: number): void => cues.shade(x, z, radius), kit, dust: DUST });

  const burst = (x: number, z: number, radius: number, skill: SkillDef): void => {
    const color: Color = colorOf(skill.vfx.color);
    const look: NovaLook = novaLook(skill.vfx.style);
    if (look === 'shockwave') shockwave(x, z, radius, color, skill);
    else if (look === 'whirl') cues.whirl(x, z, radius, color);
    else if (look === 'gust') cues.gust(x, z, radius, color, skill.vfx.light);
    else ring(x, z, radius, color, EFFECTS.ringTime);
  };

  const levelUp = (x: number, z: number): void => {
    ring(x, z, EFFECTS.levelRing, GOLD, 0.7);
    spray(x, 0.3, z, GOLD, 60, { speed: { min: 0.5, max: 3.5 }, lift: { min: 3, max: 8 }, life: { min: 0.6, max: 1.3 }, size: { min: 0.25, max: 0.6 }, gravity: 3, drag: 1.2, jitter: 1.4 });
    flashLight(x, EFFECTS.levelLightHeight, z, GOLD, EFFECTS.levelLight);
  };

  const onSkillStart = (event: Extract<WorldEvent, { type: 'skill_start' }>, world: World): void => {
    if (event.skill.vfx.style === 'roll') {
      const roller: { readonly pos: { readonly x: number; readonly z: number } } | undefined = event.actorId === world.player.id ? world.player : world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
      if (roller !== undefined) dashTrails.start(event.actorId, roller.pos, event.direction, colorOf(event.skill.vfx.color));
    }
    if (event.actorId === world.player.id) {
      if (event.skill.press?.type !== 'charge') cues.windup(event.actorId, world.player.pos, event.direction, event.skill, event.windup, colorOf(event.skill.vfx.color));
      return;
    }
    const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
    if (monster === undefined) return;
    const type: Delivery['type'] = event.skill.delivery.type;
    const casts: boolean = type === 'projectile' || type === 'mark' || type === 'field' || type === 'revive';
    const lands: { readonly x: number; readonly z: number } = landsAhead(event.skill) || type === 'field' ? (monster.action?.target ?? monster.pos) : monster.pos;
    if (!casts || type === 'projectile' || type === 'field') telegraphs.start(monster.id, 'actor', lands, event.direction, event.skill, event.windup, TELEGRAPH);
    if (casts) spray(monster.pos.x + event.direction.x * 0.6, 1.7, monster.pos.z + event.direction.z * 0.6, colorOf(event.skill.vfx.color), 16, { speed: { min: 0.3, max: 1.6 }, lift: { min: 0.3, max: 2.2 }, life: { min: 0.3, max: event.windup + 0.1 }, gravity: -1, size: { min: 0.25, max: 0.55 } });
  };

  const onImpact = (event: Extract<WorldEvent, { type: 'skill_impact' }>): void => {
    const color: Color = colorOf(event.skill.vfx.color);
    const delivery = event.skill.delivery;
    cancelOwned(event.actorId);
    switch (delivery.type) {
      case 'arc': {
        const weight: number = heft(event.skill.shake);
        slash(event.origin.x, event.origin.z, event.direction, delivery.reach * (1 + EFFECTS.heftReach * weight), delivery.arcDegrees, color, event.team === 'monster');
        if (weight <= 0) break;
        const aheadX: number = event.origin.x + event.direction.x * delivery.reach * EFFECTS.heftAhead;
        const aheadZ: number = event.origin.z + event.direction.z * delivery.reach * EFFECTS.heftAhead;
        kit.ground(aheadX, aheadZ, delivery.reach * EFFECTS.heftGround * weight, color);
        spray(aheadX, 0.2, aheadZ, DUST, Math.round(EFFECTS.heftDust * weight), { dirX: event.direction.x, dirZ: event.direction.z, spread: 1.6, speed: { min: 1, max: 3.5 }, lift: { min: 0.3, max: 1.4 }, life: { min: 0.35, max: 0.7 }, size: { min: 0.6, max: 1.3 }, gravity: 0.4, drag: 2.6, jitter: 0.5 });
        break;
      }
      case 'nova':
        burst(event.origin.x, event.origin.z, delivery.radius, event.skill);
        break;
      case 'mark':
      case 'field':
        spray(event.origin.x + event.direction.x * EFFECTS.castReach, EFFECTS.castLift, event.origin.z + event.direction.z * EFFECTS.castReach, color, 12, { speed: { min: 1, max: 4 }, lift: { min: 0.5, max: 3 }, life: { min: 0.2, max: 0.5 } });
        break;
      case 'projectile':
        spray(event.origin.x + event.direction.x, EFFECTS.projectileHeight, event.origin.z + event.direction.z, color, event.skill.vfx.lightning === null ? 10 : EFFECTS.releaseSparks, { dirX: event.direction.x, dirZ: event.direction.z, spread: 0.9, speed: { min: 3, max: 9 }, lift: { min: -1, max: 2 }, gravity: 2 });
        if (event.team === 'player') flashLight(event.origin.x, 2, event.origin.z, color, EFFECTS.boltLight * event.skill.vfx.light);
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
      wash = washHit(wash);
      camera.addTrauma(Math.max(EFFECTS.hurtShake, event.skill.shake));
      hitStop = Math.min(EFFECTS.maxStop, Math.max(hitStop, event.skill.hitStop));
      if (event.skill.root > 0 && !event.killed) {
        mark(event.pos.x, event.pos.z, EFFECTS.rootRing, ROOT, event.skill.root);
        spray(event.pos.x, 0.3, event.pos.z, ROOT, EFFECTS.rootSpray, { speed: { min: 0.3, max: 1.4 }, lift: { min: 0.2, max: 1.6 }, life: { min: 0.4, max: event.skill.root }, gravity: 1, size: { min: 0.3, max: 0.7 } });
      }
      spray(event.pos.x, 1.3, event.pos.z, BLOOD, 14, { dirX: event.direction.x, dirZ: event.direction.z, spread: 1.4, speed: { min: 2, max: 7 } });
      return;
    }
    const impact = event.skill.vfx.impact;
    if (impact !== null && event.skill.delivery.type === 'arc') kit.impact(event.pos.x, event.pos.z, skillColor, impact, event.skill.vfx.light, 0);
    const count: number = event.crit ? 22 : 11;
    spray(event.pos.x, 1.25, event.pos.z, BONE, count, { dirX: event.direction.x, dirZ: event.direction.z, spread: 1.1, speed: { min: 4, max: event.crit ? 15 : 10 }, lift: { min: 0.5, max: 6 } });
    spray(event.pos.x, 1.25, event.pos.z, skillColor, Math.ceil(count / 2), { dirX: event.direction.x, dirZ: event.direction.z, spread: 1.8, speed: { min: 2, max: 8 }, size: { min: 0.3, max: 0.8 }, life: { min: 0.15, max: 0.4 } });
    hitStop = Math.min(EFFECTS.maxStop, Math.max(hitStop, event.skill.hitStop * (event.crit ? EFFECTS.critStop : 1) + (event.killed ? EFFECTS.killStop : 0)));
    camera.punch(event.direction.x, event.direction.z, EFFECTS.punch * (event.crit ? 2 : 1));
    if (event.crit) flashLight(event.pos.x, EFFECTS.critHeight, event.pos.z, skillColor, EFFECTS.critLight);
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
    kit.drop(event.id);
    const color: Color = colorOf(event.skill.vfx.color);
    const impact = event.skill.vfx.impact;
    if (impact !== null) {
      kit.impact(event.pos.x, event.pos.z, color, event.hit ? impact : { sparks: impact.sparks * KIT.impactMiss, flash: impact.flash * KIT.impactMiss }, event.skill.vfx.light * (event.hit ? 1 : KIT.impactMiss), 0);
      return;
    }
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
      if (hazard.skill.delivery.type === 'field') telegraphs.field(hazard.id, hazard.pos, hazard.radius, color);
      else telegraphs.start(hazard.id, 'hazard', hazard.pos, { x: 0, z: 1 }, hazard.skill, hazard.delay, TELEGRAPH);
      spray(hazard.pos.x, 0.2, hazard.pos.z, color, 10, { speed: { min: 0.2, max: 1 }, lift: { min: 0.5, max: 2 }, life: { min: EFFECTS.markRise, max: hazard.delay }, gravity: -0.5, jitter: hazard.radius * 0.5 });
      return;
    }
    cancelOwned(hazard.id);
    if (hazard.skill.delivery.type === 'field') return;
    burst(hazard.pos.x, hazard.pos.z, hazard.radius, hazard.skill);
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

  const projectileView = (projectile: ProjectileState): ProjectileView | null => {
    if (projectile.skill.vfx.lightning !== null) return null;
    const existing: ProjectileView | undefined = projectiles.get(projectile.id);
    if (existing !== undefined) return existing;
    const color: Color = colorOf(projectile.skill.vfx.color);
    const light: number = Math.min(1, projectile.skill.vfx.light);
    const mesh: Mesh = projectileMesh(projectile.skill.vfx.style === 'orb' ? 'orb' : 'bolt', glow(color, EFFECTS.dimFrom + (1 - EFFECTS.dimFrom) * light));
    const slim: number = EFFECTS.slimFrom + (1 - EFFECTS.slimFrom) * light;
    if (projectile.skill.vfx.style === 'orb') mesh.scale.multiplyScalar(slim);
    else mesh.scale.set(mesh.scale.x * slim, mesh.scale.y * slim, mesh.scale.z * (EFFECTS.shortFrom + (1 - EFFECTS.shortFrom) * light));
    mesh.rotation.y = facingOf(projectile.direction);
    scene.add(mesh);
    const view: ProjectileView = { mesh, color };
    projectiles.set(projectile.id, view);
    return view;
  };

  const storm: StormEffects = createStormEffects({ add, spray, ring, burst, flashLight, colorOf, kit, addObject: (object: Object3D): void => void scene.add(object), trauma: (amount: number): void => camera.addTrauma(amount) });

  return {
    get hurt(): number {
      return wash.level;
    },
    takeHitStop(): number {
      const pending: number = hitStop;
      hitStop = 0;
      return pending;
    },
    clickMarker(x: number, z: number, hostile: boolean): void {
      const marker: GroundLight = createGroundLight(hostile ? ATTACK_MARK : MOVE_MARK, { kind: 'round', radius: EFFECTS.markerSize, inner: 0, arc: Math.PI * 2 }, { fill: EFFECTS.markerFill, band: 1, width: EFFECTS.markerSize * EFFECTS.markerWidth, wobble: EFFECTS.markerSize * EFFECTS.ringWobble });
      marker.mesh.position.set(x, GROUND_LIGHT.height + 0.05, z);
      add(
        marker.mesh,
        EFFECTS.markerTime,
        (t: number): void => {
          marker.front(1 - EFFECTS.markerClose * spread(t));
          marker.pose(EFFECTS.markerGlow * flare(t), t * EFFECTS.markerTime);
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
          case 'boss_defeated': {
            const boss: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.monsterId);
            if (boss === undefined) break;
            ring(boss.pos.x, boss.pos.z, EFFECTS.defeatRing, colorOf(boss.def.color), EFFECTS.waveTime);
            spray(boss.pos.x, 1.4, boss.pos.z, colorOf(boss.def.color), EFFECTS.defeatSparks, { speed: { min: 2, max: 11 }, lift: { min: 2, max: 10 }, life: { min: 0.6, max: 1.6 }, gravity: 2.5, jitter: 0.9 });
            camera.addTrauma(EFFECTS.defeatShake);
            break;
          }
          case 'boss_phase': {
            const boss: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.monsterId);
            if (boss === undefined) break;
            ring(boss.pos.x, boss.pos.z, EFFECTS.phaseRing, colorOf(boss.def.color), EFFECTS.waveTime);
            spray(boss.pos.x, 1.4, boss.pos.z, colorOf(boss.def.color), 40, { speed: { min: 2, max: 9 }, lift: { min: 1, max: 8 }, life: { min: 0.4, max: 1.1 }, gravity: 3, jitter: 0.8 });
            camera.addTrauma(EFFECTS.phaseShake);
            break;
          }
          case 'chest_opened':
            spray(event.pos.x, CHEST_BURST.height, event.pos.z, GOLD, CHEST_BURST.count, CHEST_SPRAY);
            ring(event.pos.x, event.pos.z, CHEST_BURST.ring, GOLD, CHEST_BURST.ringTime);
            camera.addTrauma(CHEST_BURST.shake);
            break;
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
          case 'chart_point':
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
          case 'moment_chest':
          case 'path_marked':
          case 'character_changed':
          case 'zone_changed':
          case 'hero_step':
          case 'wake':
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
      flashes.clear();
      kit.clear();
      dashTrails.clear();
      storm.clear();
      telegraphs.clear();
    },
    update(dt: number, world: World): void {
      dashTrails.update(dt, world);
      storm.update(dt, world);
      telegraphs.update(dt, world);
      for (const transient of transients) {
        transient.age += dt;
        if (transient.age < transient.duration) transient.tick(transient.age / transient.duration);
        else disposeObject(transient.object);
      }
      for (let index: number = transients.length - 1; index >= 0; index -= 1) {
        const transient: Transient | undefined = transients[index];
        if (transient !== undefined && transient.age >= transient.duration) transients.splice(index, 1);
      }
      kit.update(dt);
      for (const projectile of world.projectiles) {
        const lightning = projectile.skill.vfx.lightning;
        if (lightning !== null) {
          kit.carry(projectile.id, projectile.pos.x, EFFECTS.projectileHeight, projectile.pos.z, projectile.direction.x, projectile.direction.z, colorOf(projectile.skill.vfx.color), lightning, projectile.skill.vfx.trail, dt);
          continue;
        }
        const view: ProjectileView | null = projectileView(projectile);
        if (view === null) continue;
        view.mesh.position.set(projectile.pos.x, EFFECTS.projectileHeight, projectile.pos.z);
        view.mesh.rotation.z += dt * 14;
        if (projectile.skill.vfx.trail > 0) kit.carry(projectile.id, projectile.pos.x, EFFECTS.projectileHeight, projectile.pos.z, projectile.direction.x, projectile.direction.z, view.color, null, projectile.skill.vfx.trail, dt);
        else spray(projectile.pos.x, EFFECTS.projectileHeight, projectile.pos.z, view.color, 2, { speed: { min: 0, max: 1.2 }, lift: { min: -0.6, max: 0.8 }, life: { min: 0.12, max: 0.32 }, size: { min: 0.3, max: 0.7 }, gravity: 0, jitter: 0.25 });
      }
      if (warmFrames > 0) {
        warmFrames -= 1;
        if (warmFrames === 0) for (const keeper of keepers) keeper.visible = false;
      }
      flashes.update(dt);
      wash = stepWash(wash, world.player.maxLife > 0 ? world.player.life / world.player.maxLife : 1, dt);
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
