import type { Group } from 'three';
import { Color, PointLight, Vector3 } from 'three';
import type { BufferGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three';
import type { AreaDelivery } from '../../sim/content/shape-types.ts';
import type { SkillDef, VfxImpact, VfxLightning } from '../../sim/content/types.ts';
import type { VfxCover, VfxPunch, VfxShadow, VfxWater } from '../../sim/content/vfx-types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { areaOf } from '../../sim/world/areas.ts';
import { chargeOf, SKILLS } from '../../sim/world/skills.ts';
import type { Actor, AreaState, EmpowerState, MonsterState, ProjectileState, World, WorldEvent } from '../../sim/world/types.ts';
import { heldLook } from '../../sim/world/character.ts';
import type { StunMarks } from './stun-marks.ts';
import { createStunMarks } from './stun-marks.ts';
import { glow, groundArcs, lightningLine, skyBolt } from './effect-shapes.ts';
import type { GroundLight, GroundLightForm, GroundLightLook } from './ground-light.ts';
import { AURA_LIGHT, auraForm, auraLook } from './aura-light.ts';
import type { ShotTint } from './projectile-views.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';
import { lap, poolOf, splash, surge, swell, whirl, WATER_LOOK } from './water-look.ts';
import { STRAND } from './strand-shape.ts';
import { dripsDue, SOAK_COLOR, SOAK_LOOK } from './soak-look.ts';
import { burnsAsFire, burnTongues, FIRE_LOOK, flare, heatGlow, heatShare, lick } from './fire-look.ts';
import type { BurstOptions } from './particles.ts';
import type { EffectKit } from './effect-kit.ts';
import { floorUp } from './terrain-lift.ts';
import type { PunchRoll } from './punch.ts';
import { dustHeadings, PUNCH, punchRoll, reachedFrom, swungFrom } from './punch.ts';

export const STORM_EFFECTS = {
  handHeight: 1.35,
  handSide: 0.2,
  handReach: 0.5,
  bodyHeight: 1.1,
  arcsHeight: 0.15,
  linkTime: 0.24,
  linkJitter: 0.55,
  linkWidth: 0.13,
  beamJitter: 0.35,
  beamWidth: 0.18,
  beamHold: 0.24,
  blinkTime: 0.3,
  areaGlow: 0.34,
  areaFill: 0.2,
  gapFill: 0.035,
  gapLight: 24,
  gapGlow: 0.12,
  pullSpray: 16,
  areaBandWidth: 0.1,
  areaWobble: 0.07,
  coverFill: 0.25,
  coverBandWidth: 0.06,
  poolFill: 1,
  poolSoft: 0.45,
  poolWobble: 0.14,
  poolTint: 0.08,
  poolEdgeFill: 0.02,
  poolEdgeGlow: 0.16,
  biteMotes: 10,
  areaFadeOut: 0.3,
  areaGoneBelow: 0.004,
  windSpin: 2.6,
  windMotes: 7,
  windDust: 3,
  windReach: 1.15,
  stormMotes: 1,
  gapMotes: 2,
  brandSize: 0.55,
  brandHeight: 0.08,
  brandGlow: 0.3,
  brandFill: 0.35,
  brandWidth: 0.25,
  brandPulse: 0.3,
  brandRate: 9,
  chargeMotes: 4,
  chargeReach: 1.6,
  chargeLight: 50,
  chargeLightRange: 10,
  chargeLightDecay: 1.6,
  arcTime: 0.22,
  releaseWave: 0.8,
  hop: 0.035,
  blinkHeight: 1,
  stepPool: 1.4,
  stepMotes: 16,
  stepWakeEvery: 0.25,
  stepWakeLift: 1.3,
  strikeReach: 0.5,
  missShare: 0.4,
  wakeHeight: 0.9,
  wakeMotes: 3,
  veilBurst: 22,
  veilLight: 40,
  veilLift: 0.45,
  veilWake: 1.6,
  veilCore: 0.35,
  veilMoteRate: 6,
  lashStagger: 0.035,
  crackleSparks: 6,
  crackleLight: 12,
} as const;

export interface StormKit {
  readonly add: (object: Mesh | Group, duration: number, tick: (t: number) => void, owner: number | null) => void;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
  readonly burst: (x: number, z: number, radius: number, skill: SkillDef) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
  readonly colorOf: (hex: string) => Color;
  readonly kit: EffectKit;
  readonly addObject: (object: Object3D) => void;
  readonly trauma: (amount: number) => void;
}

export interface StormEffects {
  handle(event: WorldEvent): void;
  update(dt: number, world: World): void;
  tintOf(projectileId: number): ShotTint | null;
  clear(): void;
}

interface AreaView {
  readonly light: GroundLight;
  readonly pool: GroundLight | null;
  readonly depth: number;
  readonly glow: number;
  readonly color: Color;
  readonly foam: Color | null;
  readonly fire: boolean;
  readonly cover: VfxCover | null;
  heat: number;
  readonly delivery: AreaDelivery;
  readonly duration: number;
  readonly ownerId: number;
  readonly skillId: string;
  readonly center: { x: number; z: number };
  age: number;
  moteTimer: number;
  lashes: number;
}

interface BrandView {
  readonly mark: GroundLight;
}

const MIST: Color = new Color(0xc9d6e2);
const WIND_DUST: Color = new Color(0x5d6b78);

interface Spot {
  x: number;
  y: number;
  z: number;
}

const START: Spot = { x: 0, y: 0, z: 0 };
const END: Spot = { x: 0, y: 0, z: 0 };

function placed(target: Spot, at: Vec2, y: number): Spot {
  target.x = at.x;
  target.y = y;
  target.z = at.z;
  return target;
}

function inHand(target: Spot, at: Vec2, toward: Vec2, reach: number): Spot {
  const dx: number = toward.x - at.x;
  const dz: number = toward.z - at.z;
  const length: number = Math.max(1e-4, Math.hypot(dx, dz));
  target.x = at.x + (dz * STORM_EFFECTS.handSide + dx * reach) / length;
  target.y = STORM_EFFECTS.handHeight;
  target.z = at.z + (dz * reach - dx * STORM_EFFECTS.handSide) / length;
  return target;
}

function missed(impact: VfxImpact, hits: number): VfxImpact {
  return hits > 0 ? impact : { sparks: Math.round(impact.sparks * STORM_EFFECTS.missShare), flash: impact.flash * STORM_EFFECTS.missShare };
}

export function createStormEffects(kit: StormKit): StormEffects {
  const areas: Map<number, AreaView> = new Map<number, AreaView>();
  const fading: GroundLight[] = [];
  const brands: Map<number, BrandView> = new Map<number, BrandView>();
  const stuns: StunMarks = createStunMarks(kit);
  const veiledShots: Map<number, ShotTint> = new Map<number, ShotTint>();
  const veil: { color: Color | null; spark: Color; core: Color; wake: Color; skills: Set<string>; heroId: number } = { color: null, spark: new Color(), core: new Color(), wake: new Color(), skills: new Set<string>(), heroId: -1 };
  const white: Color = new Color(1, 1, 1);
  const wet: Map<number, number> = new Map<number, number>();
  const at: Vector3 = new Vector3();
  const chargeGlow: PointLight = new PointLight(0xffffff, 0, STORM_EFFECTS.chargeLightRange, STORM_EFFECTS.chargeLightDecay);
  kit.addObject(chargeGlow);

  const flicker = (mesh: Mesh<BufferGeometry, MeshBasicMaterial>, duration: number): void => {
    kit.add(
      mesh,
      duration,
      (t: number): void => {
        mesh.visible = t < 0.45 || (t > 0.55 && t < 0.85);
        mesh.material.opacity = 1 - t * t;
      },
      null,
    );
  };

  const onPunch = (event: Extract<WorldEvent, { type: 'chain' }>, look: VfxLightning, punch: VfxPunch): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    const impact: VfxImpact | null = event.skill.vfx.impact;
    event.points.forEach((from: Vec2, index: number): void => {
      const to: Vec2 | undefined = event.points[index + 1];
      if (to === undefined) return;
      const roll: PunchRoll = punchRoll(impact === null ? 0 : impact.sparks, Math.random);
      const delay: number = index * STORM_EFFECTS.hop;
      const start: Spot = index === 0 ? placed(START, swungFrom(reachedFrom(from, to, SKILLS.projectileOrigin), to, roll.swing), STORM_EFFECTS.handHeight) : placed(START, from, STORM_EFFECTS.bodyHeight);
      kit.kit.strike(start, placed(END, to, STORM_EFFECTS.bodyHeight), color, look, delay);
      if (impact !== null) kit.kit.impact(to.x, to.z, color, { sparks: roll.sparks, flash: impact.flash }, event.skill.vfx.light, delay);
      for (const heading of dustHeadings(punch.dust, roll.turn)) {
        kit.spray(to.x, PUNCH.dustHeight, to.z, color, 1, { dirX: heading.x, dirZ: heading.z, spread: PUNCH.dustSpread, speed: { min: punch.kick * PUNCH.dustSlowest, max: punch.kick }, lift: { min: PUNCH.dustLiftMin, max: PUNCH.dustLiftMax }, life: { min: PUNCH.dustLifeMin, max: PUNCH.dustLifeMax }, size: { min: PUNCH.dustSizeMin, max: PUNCH.dustSizeMax }, gravity: 0, drag: PUNCH.dustDrag, jitter: 0.1 });
      }
    });
  };

  const onChain = (event: Extract<WorldEvent, { type: 'chain' }>): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    const lightning = event.skill.vfx.lightning;
    const punch: VfxPunch | null = event.skill.vfx.punch;
    if (lightning !== null && punch !== null) {
      onPunch(event, lightning, punch);
      return;
    }
    if (lightning !== null) {
      const impact = event.skill.vfx.impact;
      event.points.forEach((point: Vec2, index: number): void => {
        const next: Vec2 | undefined = event.points[index + 1];
        if (next === undefined) return;
        const delay: number = index * STORM_EFFECTS.hop;
        kit.kit.strike(index === 0 ? inHand(START, point, next, STORM_EFFECTS.handReach) : placed(START, point, STORM_EFFECTS.bodyHeight), placed(END, next, STORM_EFFECTS.bodyHeight), color, lightning, delay);
        if (impact !== null) kit.kit.impact(next.x, next.z, color, impact, event.skill.vfx.light, delay + STRAND.lead);
      });
      return;
    }
    event.points.forEach((point: Vec2, index: number): void => {
      const next: Vec2 | undefined = event.points[index + 1];
      if (next === undefined) return;
      const from: Vector3 = new Vector3(point.x, floorUp(point.x, index === 0 ? STORM_EFFECTS.handHeight : STORM_EFFECTS.bodyHeight, point.z), point.z);
      const to: Vector3 = new Vector3(next.x, floorUp(next.x, STORM_EFFECTS.bodyHeight, next.z), next.z);
      flicker(lightningLine(from, to, color, STORM_EFFECTS.linkJitter, STORM_EFFECTS.linkWidth), STORM_EFFECTS.linkTime + index * 0.03);
      kit.spray(next.x, STORM_EFFECTS.bodyHeight, next.z, color, 12, { speed: { min: 2, max: 8 }, lift: { min: 0.5, max: 4 }, life: { min: 0.12, max: 0.32 }, size: { min: 0.2, max: 0.45 } });
      if (index < 3) kit.flashLight(next.x, 1.6, next.z, color, 45);
    });
  };

  const onBeam = (event: Extract<WorldEvent, { type: 'beam' }>): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    const lightning = event.skill.vfx.lightning;
    if (lightning !== null) {
      inHand(START, event.from, event.to, 0);
      placed(END, event.to, STORM_EFFECTS.bodyHeight);
      if (event.skill.press?.type === 'channel') kit.kit.channel(event.actorId, START, END, color, lightning, STORM_EFFECTS.beamHold);
      else kit.kit.strike(START, END, color, lightning, 0);
      const impact = event.skill.vfx.impact;
      if (impact !== null) kit.kit.impact(event.to.x, event.to.z, color, missed(impact, event.hits), event.skill.vfx.light, 0);
      return;
    }
    const from: Vector3 = new Vector3(event.from.x, floorUp(event.from.x, STORM_EFFECTS.handHeight, event.from.z), event.from.z);
    const to: Vector3 = new Vector3(event.to.x, floorUp(event.to.x, STORM_EFFECTS.bodyHeight, event.to.z), event.to.z);
    flicker(lightningLine(from, to, color, STORM_EFFECTS.beamJitter, STORM_EFFECTS.beamWidth), STORM_EFFECTS.beamHold);
    flicker(lightningLine(from, to, glow(color, 0.6), STORM_EFFECTS.beamJitter * 2, STORM_EFFECTS.beamWidth * 0.5), STORM_EFFECTS.beamHold * 0.7);
    kit.spray(event.to.x, STORM_EFFECTS.bodyHeight, event.to.z, color, event.hits > 0 ? 8 : 4, { speed: { min: 1, max: 6 }, lift: { min: 0.3, max: 3 }, life: { min: 0.1, max: 0.25 }, size: { min: 0.2, max: 0.4 } });
    kit.flashLight(event.from.x, 1.5, event.from.z, color, 18);
  };

  const shadowStep = (event: Extract<WorldEvent, { type: 'blink' }>, shadow: VfxShadow): void => {
    const shade: Color = kit.colorOf(shadow.color);
    const wake: Color = shade.clone().multiplyScalar(STORM_EFFECTS.veilWake);
    const round: GroundLightForm = { kind: 'round', radius: STORM_EFFECTS.stepPool, inner: 0, arc: Math.PI * 2 };
    for (const spot of [event.from, event.to]) {
      const pool: GroundLight = createGroundLight(shade.clone().multiplyScalar(STORM_EFFECTS.poolTint), round, { fill: STORM_EFFECTS.poolFill, band: 0, width: STORM_EFFECTS.stepPool * STORM_EFFECTS.poolSoft, wobble: STORM_EFFECTS.stepPool * STORM_EFFECTS.poolWobble }, 'shade');
      pool.mesh.position.set(spot.x, floorUp(spot.x, GROUND_LIGHT.height, spot.z), spot.z);
      pool.setNow(shadow.strength);
      pool.show(0);
      kit.addObject(pool.mesh);
      fading.push(pool);
      kit.spray(spot.x, STORM_EFFECTS.wakeHeight, spot.z, wake, STORM_EFFECTS.stepMotes, { speed: { min: 0.3, max: 1.6 }, lift: { min: 0.4, max: 2 }, life: { min: 0.4, max: 0.8 }, size: { min: 0.4, max: 0.75 }, gravity: -0.4, drag: 1.5, jitter: 0.4 });
    }
    const span: number = Math.hypot(event.to.x - event.from.x, event.to.z - event.from.z);
    const motes: number = Math.max(1, Math.ceil(span / STORM_EFFECTS.stepWakeEvery));
    for (let mote: number = 0; mote <= motes; mote += 1) {
      const along: number = mote / motes;
      const x: number = event.from.x + (event.to.x - event.from.x) * along;
      const z: number = event.from.z + (event.to.z - event.from.z) * along;
      kit.spray(x, STORM_EFFECTS.stepWakeLift * Math.random(), z, wake, 1, { speed: { min: 0, max: 0.4 }, lift: { min: 0.2, max: 0.8 }, life: { min: 0.4, max: 0.8 }, size: { min: 0.45, max: 0.85 }, gravity: 0, drag: 1 });
    }
  };

  const mistStep = (event: Extract<WorldEvent, { type: 'blink' }>, color: Color): void => {
    for (const spot of [event.from, event.to]) {
      kit.spray(spot.x, 0.9, spot.z, MIST, 26, { speed: { min: 0.4, max: 2.4 }, lift: { min: 0.2, max: 1.6 }, life: { min: 0.4, max: 0.9 }, size: { min: 0.8, max: 1.7 }, gravity: -0.6, drag: 2.4, jitter: 0.6 });
    }
    const lightning = event.skill.vfx.lightning;
    if (lightning !== null) kit.kit.strike(placed(START, event.from, STORM_EFFECTS.blinkHeight), placed(END, event.to, STORM_EFFECTS.blinkHeight), color, lightning, 0);
    else {
      const streak = lightningLine(new Vector3(event.from.x, floorUp(event.from.x, STORM_EFFECTS.blinkHeight, event.from.z), event.from.z), new Vector3(event.to.x, floorUp(event.to.x, STORM_EFFECTS.blinkHeight, event.to.z), event.to.z), glow(color, 0.5), 0.15, 0.5);
      kit.add(
        streak,
        STORM_EFFECTS.blinkTime,
        (t: number): void => {
          streak.material.opacity = (1 - t) * 0.5;
        },
        null,
      );
    }
  };

  const onBlink = (event: Extract<WorldEvent, { type: 'blink' }>): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    const shadow: VfxShadow | null = event.skill.vfx.shadow;
    if (shadow !== null) shadowStep(event, shadow);
    else mistStep(event, color);
    const delivery = event.skill.delivery;
    if (delivery.type === 'blink' && delivery.radius > 0) kit.ring(event.to.x, event.to.z, delivery.radius, color, 0.35);
  };

  const areaColor = (area: AreaState): Color => kit.colorOf(area.skill.vfx.color);

  const startArea = (area: AreaState): void => {
    const delivery: AreaDelivery | null = areaOf(area.skill);
    if (delivery === null) return;
    const color: Color = areaColor(area);
    const gap: boolean = delivery.pulse === 0 && delivery.pull === 0;
    const shadow: VfxShadow | null = poolOf(area.skill.vfx);
    const round: GroundLightForm = { kind: 'round', radius: delivery.radius, inner: 0, arc: Math.PI * 2 };
    const cover: VfxCover | null = area.skill.vfx.cover;
    const aura: boolean = delivery.aura !== null;
    const look: GroundLightLook = cover !== null
      ? { fill: STORM_EFFECTS.coverFill, band: 1, width: delivery.radius * STORM_EFFECTS.coverBandWidth, wobble: delivery.radius * cover.wobble }
      : aura
        ? auraLook(delivery.radius)
        : { fill: shadow !== null ? STORM_EFFECTS.poolEdgeFill : gap ? STORM_EFFECTS.gapFill : STORM_EFFECTS.areaFill, band: 1, width: delivery.radius * STORM_EFFECTS.areaBandWidth, wobble: delivery.radius * STORM_EFFECTS.areaWobble };
    const light: GroundLight = createGroundLight(color, aura ? auraForm(delivery.radius) : round, look);
    light.mesh.position.set(area.pos.x, floorUp(area.pos.x, GROUND_LIGHT.height, area.pos.z), area.pos.z);
    const shine: number = cover !== null ? cover.glow : aura ? AURA_LIGHT.glow : shadow !== null ? STORM_EFFECTS.poolEdgeGlow : gap ? STORM_EFFECTS.gapGlow : STORM_EFFECTS.areaGlow;
    light.show(shine);
    kit.addObject(light.mesh);
    const pool: GroundLight | null = shadow === null ? null : createGroundLight(kit.colorOf(shadow.color).clone().multiplyScalar(STORM_EFFECTS.poolTint), round, { fill: STORM_EFFECTS.poolFill, band: 0, width: delivery.radius * STORM_EFFECTS.poolSoft, wobble: delivery.radius * STORM_EFFECTS.poolWobble }, 'shade');
    if (pool !== null) {
      pool.mesh.position.copy(light.mesh.position);
      pool.show(shadow?.strength ?? 0);
      kit.addObject(pool.mesh);
    }
    areas.set(area.id, { light, pool, depth: shadow?.strength ?? 0, glow: shine, color, foam: area.skill.vfx.water === null ? null : kit.colorOf(area.skill.vfx.water.foam), fire: burnsAsFire(area.skill.vfx), cover, heat: 0, delivery, duration: delivery.duration, ownerId: area.offence.sourceId, skillId: area.skill.id, center: { x: area.pos.x, z: area.pos.z }, age: 0, moteTimer: 0, lashes: 0 });
    if (gap && delivery.slow < 1 && cover === null) kit.flashLight(area.pos.x, 3, area.pos.z, color, STORM_EFFECTS.gapLight);
  };

  const pulseArea = (area: AreaState, hits: number): void => {
    const view: AreaView | undefined = areas.get(area.id);
    if (view === undefined) return;
    const { delivery, color } = view;
    if (view.cover !== null) {
      if (hits > 0) kit.trauma(area.skill.shake);
      return;
    }
    if (view.fire) {
      view.heat = heatShare(delivery, area.pulses);
      flare(kit, area.pos, delivery.radius, color, view.heat, Math.random);
      if (hits > 0) kit.trauma(area.skill.shake);
      return;
    }
    if (delivery.pull > 0) {
      kit.burst(area.pos.x, area.pos.z, delivery.radius * 0.55, area.skill);
      if (view.foam !== null) surge(kit, area.pos, view.foam);
      else kit.spray(area.pos.x, 0.3, area.pos.z, color, STORM_EFFECTS.pullSpray, { speed: { min: 3, max: 9 }, lift: { min: 0.2, max: 1.4 }, life: { min: 0.3, max: 0.7 }, size: { min: 0.5, max: 1.1 }, drag: 3 });
      if (hits > 0) kit.trauma(area.skill.shake);
      return;
    }
    if (view.foam !== null) {
      swell(kit, area.pos, delivery.radius, view.foam);
      return;
    }
    const angle: number = Math.random() * Math.PI * 2;
    const reach: number = Math.random() * delivery.radius * 0.7;
    const x: number = area.pos.x + Math.sin(angle) * reach;
    const z: number = area.pos.z + Math.cos(angle) * reach;
    const lightning = area.skill.vfx.lightning;
    if (lightning !== null && delivery.anchor === 'caster') {
      crackle(view, area, hits);
      return;
    }
    if (lightning !== null) {
      const impact = area.skill.vfx.impact;
      kit.kit.skyStrike(x, z, color, lightning, delivery.radius * STORM_EFFECTS.strikeReach, impact === null ? null : missed(impact, hits), area.skill.vfx.light, 0);
      if (hits > 0) kit.trauma(area.skill.shake);
      return;
    }
    const bolt = skyBolt(color);
    bolt.position.set(x, floorUp(x, 0, z), z);
    flicker(bolt, STORM_EFFECTS.arcTime);
    const arcs = groundArcs(color, delivery.radius * 0.8);
    arcs.position.set(area.pos.x, floorUp(area.pos.x, STORM_EFFECTS.arcsHeight, area.pos.z), area.pos.z);
    flicker(arcs, STORM_EFFECTS.arcTime);
    kit.flashLight(x, 3, z, color, hits > 0 ? 70 : 40);
    kit.spray(x, 0.3, z, color, 10, { speed: { min: 1, max: 5 }, lift: { min: 1, max: 6 }, life: { min: 0.2, max: 0.5 } });
    if (hits > 0) kit.trauma(area.skill.shake);
  };

  const crackle = (view: AreaView, area: AreaState, hits: number): void => {
    view.lashes = 0;
    kit.spray(area.pos.x, STORM_EFFECTS.bodyHeight, area.pos.z, view.color, STORM_EFFECTS.crackleSparks, { speed: { min: 1, max: 4 }, lift: { min: 0.5, max: 3 }, life: { min: 0.15, max: 0.35 }, size: { min: 0.15, max: 0.35 } });
    kit.flashLight(area.pos.x, STORM_EFFECTS.bodyHeight, area.pos.z, view.color, STORM_EFFECTS.crackleLight);
    if (hits > 0) kit.trauma(area.skill.shake);
  };

  const onLash = (event: Extract<WorldEvent, { type: 'damage' }>): void => {
    const water: VfxWater | null = event.skill.vfx.water;
    if (water !== null && (areaOf(event.skill) !== null || event.skill.vfx.wave !== null)) splash(kit, event.pos, kit.colorOf(water.foam), event.skill.spent);
    const shadow: VfxShadow | null = event.skill.vfx.shadow;
    if (shadow !== null && areaOf(event.skill) !== null) kit.spray(event.pos.x, STORM_EFFECTS.bodyHeight, event.pos.z, kit.colorOf(event.skill.vfx.color), STORM_EFFECTS.biteMotes, { speed: { min: 0.3, max: 1.4 }, lift: { min: 0.6, max: 2 }, life: { min: 0.5, max: 0.9 }, size: { min: 0.45, max: 0.8 }, gravity: -0.6, drag: 1, jitter: 0.3 });
    const lightning = event.skill.vfx.lightning;
    if (lightning === null || areaOf(event.skill)?.anchor !== 'caster') return;
    const view: AreaView | undefined = [...areas.values()].find((shown: AreaView): boolean => shown.ownerId === event.sourceId && shown.skillId === event.skill.id);
    if (view === undefined) return;
    const delay: number = view.lashes * STORM_EFFECTS.lashStagger;
    view.lashes += 1;
    kit.kit.strike(placed(START, view.center, STORM_EFFECTS.bodyHeight), placed(END, event.pos, STORM_EFFECTS.bodyHeight), view.color, lightning, delay);
    const impact: VfxImpact | null = event.skill.vfx.impact;
    if (impact !== null) kit.kit.impact(event.pos.x, event.pos.z, view.color, impact, event.skill.vfx.light, delay + STRAND.lead);
  };

  const dropArea = (id: number): void => {
    const view: AreaView | undefined = areas.get(id);
    if (view === undefined) return;
    view.light.show(0);
    fading.push(view.light);
    if (view.pool !== null) {
      view.pool.show(0);
      fading.push(view.pool);
    }
    areas.delete(id);
  };

  const onBrand = (event: Extract<WorldEvent, { type: 'brand' }>): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    if (!event.burst) {
      kit.spray(event.pos.x, STORM_EFFECTS.bodyHeight, event.pos.z, color, 10, { speed: { min: 0.5, max: 2 }, lift: { min: 0.5, max: 2 }, life: { min: 0.3, max: 0.6 }, gravity: -1 });
      return;
    }
    const delivery = event.skill.delivery;
    kit.burst(event.pos.x, event.pos.z, delivery.type === 'nova' ? delivery.radius : 2, event.skill);
    kit.trauma(event.skill.shake);
  };

  const onArea = (event: Extract<WorldEvent, { type: 'area' }>): void => {
    if (event.area.skill.vfx.burn !== null) return;
    if (event.stage === 'start') startArea(event.area);
    else if (event.stage === 'pulse') pulseArea(event.area, event.hits);
    else dropArea(event.area.id);
  };

  const onRelease = (event: Extract<WorldEvent, { type: 'skill_impact' }>): void => {
    const delivery = event.skill.delivery;
    if (event.skill.press?.type !== 'charge' || delivery.type !== 'arc') return;
    const x: number = event.origin.x + event.direction.x * 1.2;
    const z: number = event.origin.z + event.direction.z * 1.2;
    kit.burst(x, z, delivery.reach * STORM_EFFECTS.releaseWave, event.skill);
    const lightning = event.skill.vfx.lightning;
    if (lightning !== null) kit.kit.skyStrike(x, z, kit.colorOf(event.skill.vfx.color), lightning, delivery.reach * STORM_EFFECTS.releaseWave, event.skill.vfx.impact, event.skill.vfx.light, 0);
  };

  const motes = (view: AreaView, area: AreaState, dt: number): void => {
    const { delivery, color } = view;
    if (view.cover !== null) return;
    view.moteTimer -= dt;
    if (view.moteTimer > 0) return;
    if (view.fire) {
      view.moteTimer = FIRE_LOOK.lickEvery;
      lick(kit, area.pos, delivery.radius, delivery.pull, color, view.heat, Math.random);
      return;
    }
    if (view.foam !== null) {
      view.moteTimer = delivery.pull > 0 ? WATER_LOOK.swirlEvery : WATER_LOOK.lapEvery;
      if (delivery.pull > 0) whirl(kit, area.pos, delivery.radius, delivery.pull, view.foam, Math.random);
      else lap(kit, area.pos, delivery.radius, view.foam, Math.random);
      return;
    }
    view.moteTimer = 0.05;
    if (delivery.pull > 0) {
      for (let index: number = 0; index < STORM_EFFECTS.windMotes; index += 1) {
        const angle: number = Math.random() * Math.PI * 2;
        const x: number = area.pos.x + Math.sin(angle) * delivery.radius;
        const z: number = area.pos.z + Math.cos(angle) * delivery.radius;
        const swirl: number = angle + Math.PI + STORM_EFFECTS.windSpin * 0.3;
        kit.spray(x, 0.3 + Math.random() * 1.4, z, color, 1, { dirX: Math.sin(swirl), dirZ: Math.cos(swirl), spread: 0.3, speed: { min: delivery.pull * 0.8, max: delivery.pull * 1.3 }, lift: { min: -0.2, max: 0.6 }, life: { min: 0.35, max: 0.6 }, size: { min: 0.35, max: 0.9 }, gravity: 0, drag: 0.5 });
      }
      for (let index: number = 0; index < STORM_EFFECTS.windDust; index += 1) {
        const angle: number = Math.random() * Math.PI * 2;
        const reach: number = delivery.radius * STORM_EFFECTS.windReach;
        const swirl: number = angle + Math.PI + STORM_EFFECTS.windSpin * 0.2;
        kit.spray(area.pos.x + Math.sin(angle) * reach, 0.15, area.pos.z + Math.cos(angle) * reach, WIND_DUST, 1, { dirX: Math.sin(swirl), dirZ: Math.cos(swirl), spread: 0.4, speed: { min: delivery.pull * 0.5, max: delivery.pull * 0.8 }, lift: { min: 0.2, max: 1 }, life: { min: 0.5, max: 0.8 }, size: { min: 1.2, max: 2.4 }, gravity: 0.3, drag: 1.2, jitter: 0.4 });
      }
      return;
    }
    if (delivery.pulse > 0) {
      for (let index: number = 0; index < STORM_EFFECTS.stormMotes; index += 1) {
        const angle: number = Math.random() * Math.PI * 2;
        const reach: number = Math.sqrt(Math.random()) * delivery.radius;
        kit.spray(area.pos.x + Math.sin(angle) * reach, 4.5, area.pos.z + Math.cos(angle) * reach, color, 1, { speed: { min: 0, max: 0.4 }, lift: { min: -9, max: -6 }, life: { min: 0.4, max: 0.6 }, size: { min: 0.12, max: 0.22 }, gravity: 6, drag: 0 });
      }
      return;
    }
    for (let index: number = 0; index < STORM_EFFECTS.gapMotes; index += 1) {
      const angle: number = Math.random() * Math.PI * 2;
      const reach: number = Math.sqrt(Math.random()) * delivery.radius;
      kit.spray(area.pos.x + Math.sin(angle) * reach, 0.4 + Math.random() * 2, area.pos.z + Math.cos(angle) * reach, color, 1, { speed: { min: 0, max: 0.1 }, lift: { min: 0, max: 0.15 }, life: { min: 1.2, max: 2 }, size: { min: 0.15, max: 0.3 }, gravity: 0, drag: 0, jitter: 0 });
    }
  };

  const updateAreas = (dt: number, world: World): void => {
    for (const area of world.areas) {
      const view: AreaView | undefined = areas.get(area.id);
      if (view === undefined) continue;
      view.age += dt;
      view.center.x = area.pos.x;
      view.center.z = area.pos.z;
      view.light.show(area.timeLeft > STORM_EFFECTS.areaFadeOut ? heatGlow(view.glow, view.heat) : 0);
      view.light.mesh.position.set(area.pos.x, floorUp(area.pos.x, GROUND_LIGHT.height, area.pos.z), area.pos.z);
      view.light.step(dt, world.time);
      if (view.pool !== null) {
        view.pool.show(area.timeLeft > STORM_EFFECTS.areaFadeOut ? view.depth : 0);
        view.pool.mesh.position.copy(view.light.mesh.position);
        view.pool.step(dt, world.time);
      }
      motes(view, area, dt);
    }
    for (const id of areas.keys()) if (!world.areas.some((area: AreaState): boolean => area.id === id)) dropArea(id);
    for (const light of fading) light.step(dt, world.time);
    for (const light of fading.filter((faded: GroundLight): boolean => faded.strength < STORM_EFFECTS.areaGoneBelow)) {
      light.dispose();
      fading.splice(fading.indexOf(light), 1);
    }
  };

  const drip = (dt: number, world: World): void => {
    for (const [id, left] of wet) {
      const target: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.id === id && monster.alive);
      if (target === undefined || left <= dt) {
        wet.delete(id);
        continue;
      }
      wet.set(id, left - dt);
      for (let drop: number = dripsDue(SOAK_LOOK.dripRate, dt, Math.random()); drop > 0; drop -= 1) {
        const angle: number = Math.random() * Math.PI * 2;
        const reach: number = Math.random() * SOAK_LOOK.dripSpread;
        const height: number = SOAK_LOOK.dripLow + Math.random() * (SOAK_LOOK.dripHigh - SOAK_LOOK.dripLow);
        kit.spray(target.pos.x + Math.sin(angle) * reach, height, target.pos.z + Math.cos(angle) * reach, SOAK_COLOR, 1, { speed: { min: 0, max: 0.2 }, lift: { min: -SOAK_LOOK.dripFall, max: 0 }, life: { min: SOAK_LOOK.dripLifeMin, max: SOAK_LOOK.dripLifeMax }, size: { min: SOAK_LOOK.dripSizeMin, max: SOAK_LOOK.dripSizeMax }, gravity: SOAK_LOOK.dripGravity, drag: 0, jitter: 0 });
      }
    }
  };

  const burning = (dt: number, world: World): void => {
    for (const actor of [world.player, ...world.monsters]) {
      if (!actor.alive || actor.burn === null || actor.burn.skill.vfx.burn !== null) continue;
      burnTongues(kit, actor.pos, kit.colorOf(actor.burn.skill.vfx.color), dripsDue(FIRE_LOOK.burnRate, dt, Math.random()), Math.random);
    }
  };

  const readVeil = (world: World): void => {
    const held: EmpowerState | undefined = world.player.powers.empowers.find((entry: EmpowerState): boolean => entry.look !== null);
    veil.heroId = world.player.id;
    veil.skills.clear();
    veil.color = held?.look === undefined || held.look === null ? null : kit.colorOf(held.look.color);
    if (veil.color === null) return;
    veil.spark.copy(veil.color).lerp(white, STORM_EFFECTS.veilLift);
    veil.wake.copy(veil.color).multiplyScalar(STORM_EFFECTS.veilWake);
    veil.core.copy(veil.color).lerp(white, STORM_EFFECTS.veilCore);
    for (const skill of world.player.skills) if (skill !== null && heldLook(world, skill.id) !== null) veil.skills.add(skill.id);
  };

  const onShot = (projectile: ProjectileState): void => {
    if (veil.color === null || projectile.ownerId !== veil.heroId || !veil.skills.has(projectile.skill.id)) return;
    veiledShots.set(projectile.id, { core: veil.core.clone(), glow: veil.wake.clone() });
  };

  const onShotEnd = (event: Extract<WorldEvent, { type: 'projectile_end' }>): void => {
    const tint: ShotTint | undefined = veiledShots.get(event.id);
    if (tint === undefined) return;
    veiledShots.delete(event.id);
    kit.spray(event.pos.x, STORM_EFFECTS.wakeHeight, event.pos.z, tint.glow, STORM_EFFECTS.veilBurst, { speed: { min: 1, max: 5 }, lift: { min: 0.5, max: 3 }, life: { min: 0.3, max: 0.7 }, size: { min: 0.3, max: 0.6 } });
    if (event.hit) kit.flashLight(event.pos.x, STORM_EFFECTS.wakeHeight, event.pos.z, tint.glow, STORM_EFFECTS.veilLight);
  };

  const updateVeil = (dt: number, world: World): void => {
    readVeil(world);
    for (const [id, tint] of veiledShots) {
      const shot: ProjectileState | undefined = world.projectiles.find((projectile: ProjectileState): boolean => projectile.id === id);
      if (shot === undefined) {
        veiledShots.delete(id);
        continue;
      }
      kit.spray(shot.pos.x, STORM_EFFECTS.wakeHeight, shot.pos.z, tint.glow, STORM_EFFECTS.wakeMotes, { speed: { min: 0, max: 0.4 }, lift: { min: 0, max: 0.6 }, life: { min: 0.35, max: 0.7 }, size: { min: 0.35, max: 0.7 }, gravity: 0, drag: 1 });
    }
    if (veil.color === null) return;
    const hero = world.player;
    for (let mote: number = dripsDue(STORM_EFFECTS.veilMoteRate, dt, Math.random()); mote > 0; mote -= 1) {
      const angle: number = Math.random() * Math.PI * 2;
      kit.spray(hero.pos.x + Math.sin(angle) * hero.radius, STORM_EFFECTS.bodyHeight * Math.random(), hero.pos.z + Math.cos(angle) * hero.radius, veil.spark, 1, { speed: { min: 0, max: 0.2 }, lift: { min: 0.4, max: 1 }, life: { min: 0.5, max: 0.9 }, size: { min: 0.12, max: 0.25 }, gravity: -0.3, drag: 0.5, jitter: 0.1 });
    }
  };

  const updateBrands = (dt: number, world: World): void => {
    const marked: readonly Actor[] = [world.player, ...world.monsters];
    for (const actor of marked) {
      const brand = actor.alive ? actor.brand : null;
      const view: BrandView | undefined = brands.get(actor.id);
      if (brand === null) {
        if (view !== undefined) {
          view.mark.dispose();
          brands.delete(actor.id);
        }
        continue;
      }
      const reach: number = actor.radius + STORM_EFFECTS.brandSize;
      const shown: BrandView = view ?? { mark: createGroundLight(kit.colorOf(brand.burst.vfx.color), { kind: 'round', radius: reach, inner: 0, arc: Math.PI * 2 }, { fill: STORM_EFFECTS.brandFill, band: 1, width: reach * STORM_EFFECTS.brandWidth, wobble: reach * STORM_EFFECTS.areaWobble }) };
      if (view === undefined) {
        kit.addObject(shown.mark.mesh);
        brands.set(actor.id, shown);
      }
      shown.mark.mesh.position.set(actor.pos.x, floorUp(actor.pos.x, STORM_EFFECTS.brandHeight, actor.pos.z), actor.pos.z);
      shown.mark.show(brand.timeLeft < 1 ? STORM_EFFECTS.brandGlow * brand.timeLeft : STORM_EFFECTS.brandGlow * (1 + STORM_EFFECTS.brandPulse * Math.sin(world.time * STORM_EFFECTS.brandRate)));
      shown.mark.step(dt, world.time);
    }
    for (const id of brands.keys()) {
      if (marked.some((actor: Actor): boolean => actor.id === id)) continue;
      const view: BrandView | undefined = brands.get(id);
      if (view !== undefined) view.mark.dispose();
      brands.delete(id);
    }
  };

  const updateCharge = (world: World): void => {
    const action = world.player.action;
    if (action === null || action.phase !== 'windup' || action.skill.press?.type !== 'charge') {
      chargeGlow.intensity = 0;
      return;
    }
    const charge: number = chargeOf(action);
    const color: Color = kit.colorOf(action.skill.vfx.color);
    const pos = world.player.pos;
    at.set(pos.x + action.direction.x * 0.3, STORM_EFFECTS.handHeight + 0.6, pos.z + action.direction.z * 0.3);
    for (let index: number = 0; index < STORM_EFFECTS.chargeMotes; index += 1) {
      const angle: number = Math.random() * Math.PI * 2;
      const reach: number = STORM_EFFECTS.chargeReach * (1.2 - charge * 0.5);
      kit.spray(at.x + Math.sin(angle) * reach, at.y + (Math.random() - 0.3) * reach, at.z + Math.cos(angle) * reach, color, 1, { dirX: -Math.sin(angle), dirZ: -Math.cos(angle), spread: 0.2, speed: { min: reach * 3, max: reach * 4 }, lift: { min: -0.5, max: 0.5 }, life: { min: 0.18, max: 0.26 }, size: { min: 0.15 + charge * 0.2, max: 0.3 + charge * 0.35 }, gravity: 0, drag: 0 });
    }
    chargeGlow.color.copy(color);
    chargeGlow.position.set(at.x, floorUp(at.x, at.y, at.z), at.z);
    chargeGlow.intensity = STORM_EFFECTS.chargeLight * charge;
  };

  return {
    handle(event: WorldEvent): void {
      if (event.type === 'chain') onChain(event);
      else if (event.type === 'beam') onBeam(event);
      else if (event.type === 'blink') onBlink(event);
      else if (event.type === 'brand') onBrand(event);
      else if (event.type === 'area') onArea(event);
      else if (event.type === 'skill_impact') onRelease(event);
      else if (event.type === 'damage') onLash(event);
      else if (event.type === 'projectile_spawn') onShot(event.projectile);
      else if (event.type === 'projectile_end') onShotEnd(event);
      else if (event.type === 'stun') stuns.landed(event);
      else if (event.type === 'soak') wet.set(event.targetId, Math.max(wet.get(event.targetId) ?? 0, event.duration));
    },
    update(dt: number, world: World): void {
      updateAreas(dt, world);
      updateBrands(dt, world);
      stuns.update(dt, world);
      drip(dt, world);
      burning(dt, world);
      updateVeil(dt, world);
      updateCharge(world);
    },
    tintOf(projectileId: number): ShotTint | null {
      return veiledShots.get(projectileId) ?? null;
    },
    clear(): void {
      for (const view of areas.values()) {
        view.light.dispose();
        view.pool?.dispose();
      }
      areas.clear();
      for (const light of fading.splice(0, fading.length)) light.dispose();
      for (const view of brands.values()) view.mark.dispose();
      brands.clear();
      stuns.clear();
      wet.clear();
      veiledShots.clear();
      chargeGlow.intensity = 0;
    },
  };
}
