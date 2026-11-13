import type { Group } from 'three';
import { Color, PointLight, Vector3 } from 'three';
import type { BufferGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three';
import type { AreaDelivery } from '../../sim/content/shape-types.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { areaOf } from '../../sim/world/areas.ts';
import { chargeOf } from '../../sim/world/skills.ts';
import type { AreaState, MonsterState, World, WorldEvent } from '../../sim/world/types.ts';
import { glow, groundArcs, lightningLine, skyBolt } from './effect-shapes.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';
import { STRAND } from './strand-shape.ts';
import type { BurstOptions } from './particles.ts';
import type { EffectKit } from './effect-kit.ts';

export const STORM_EFFECTS = {
  handHeight: 1.35,
  bodyHeight: 1.1,
  linkTime: 0.24,
  linkJitter: 0.55,
  linkWidth: 0.13,
  beamJitter: 0.35,
  beamWidth: 0.18,
  beamHold: 0.24,
  blinkTime: 0.3,
  areaGlow: 0.34,
  areaFill: 0.2,
  gapFill: 0.14,
  areaBandWidth: 0.1,
  areaWobble: 0.07,
  areaFadeOut: 0.3,
  areaGoneBelow: 0.004,
  windSpin: 2.6,
  windMotes: 3,
  stormMotes: 1,
  gapMotes: 2,
  brandSize: 0.55,
  brandHeight: 0.08,
  brandGlow: 0.5,
  brandFill: 0.5,
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
  clear(): void;
}

interface AreaView {
  readonly light: GroundLight;
  readonly color: Color;
  readonly delivery: AreaDelivery;
  readonly duration: number;
  age: number;
  moteTimer: number;
}

interface BrandView {
  readonly mark: GroundLight;
}

const MIST: Color = new Color(0xc9d6e2);

export function createStormEffects(kit: StormKit): StormEffects {
  const areas: Map<number, AreaView> = new Map<number, AreaView>();
  const fading: GroundLight[] = [];
  const brands: Map<number, BrandView> = new Map<number, BrandView>();
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

  const onChain = (event: Extract<WorldEvent, { type: 'chain' }>): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    const lightning = event.skill.vfx.lightning;
    if (lightning !== null) {
      const impact = event.skill.vfx.impact;
      event.points.forEach((point: Vec2, index: number): void => {
        const next: Vec2 | undefined = event.points[index + 1];
        if (next === undefined) return;
        const delay: number = index * STORM_EFFECTS.hop;
        kit.kit.strike({ x: point.x, y: index === 0 ? STORM_EFFECTS.handHeight : STORM_EFFECTS.bodyHeight, z: point.z }, { x: next.x, y: STORM_EFFECTS.bodyHeight, z: next.z }, color, lightning, delay);
        if (impact !== null) kit.kit.impact(next.x, next.z, color, impact, event.skill.vfx.light, delay + STRAND.lead);
      });
      return;
    }
    event.points.forEach((point: Vec2, index: number): void => {
      const next: Vec2 | undefined = event.points[index + 1];
      if (next === undefined) return;
      const from: Vector3 = new Vector3(point.x, index === 0 ? STORM_EFFECTS.handHeight : STORM_EFFECTS.bodyHeight, point.z);
      const to: Vector3 = new Vector3(next.x, STORM_EFFECTS.bodyHeight, next.z);
      flicker(lightningLine(from, to, color, STORM_EFFECTS.linkJitter, STORM_EFFECTS.linkWidth), STORM_EFFECTS.linkTime + index * 0.03);
      kit.spray(next.x, STORM_EFFECTS.bodyHeight, next.z, color, 12, { speed: { min: 2, max: 8 }, lift: { min: 0.5, max: 4 }, life: { min: 0.12, max: 0.32 }, size: { min: 0.2, max: 0.45 } });
      if (index < 3) kit.flashLight(next.x, 1.6, next.z, color, 45);
    });
  };

  const onBeam = (event: Extract<WorldEvent, { type: 'beam' }>): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    const from: Vector3 = new Vector3(event.from.x, STORM_EFFECTS.handHeight, event.from.z);
    const to: Vector3 = new Vector3(event.to.x, STORM_EFFECTS.bodyHeight, event.to.z);
    flicker(lightningLine(from, to, color, STORM_EFFECTS.beamJitter, STORM_EFFECTS.beamWidth), STORM_EFFECTS.beamHold);
    flicker(lightningLine(from, to, glow(color, 0.6), STORM_EFFECTS.beamJitter * 2, STORM_EFFECTS.beamWidth * 0.5), STORM_EFFECTS.beamHold * 0.7);
    kit.spray(event.to.x, STORM_EFFECTS.bodyHeight, event.to.z, color, event.hits > 0 ? 8 : 4, { speed: { min: 1, max: 6 }, lift: { min: 0.3, max: 3 }, life: { min: 0.1, max: 0.25 }, size: { min: 0.2, max: 0.4 } });
    kit.flashLight(event.from.x, 1.5, event.from.z, color, 18);
  };

  const onBlink = (event: Extract<WorldEvent, { type: 'blink' }>): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    for (const spot of [event.from, event.to]) {
      kit.spray(spot.x, 0.9, spot.z, MIST, 26, { speed: { min: 0.4, max: 2.4 }, lift: { min: 0.2, max: 1.6 }, life: { min: 0.4, max: 0.9 }, size: { min: 0.8, max: 1.7 }, gravity: -0.6, drag: 2.4, jitter: 0.6 });
    }
    const streak = lightningLine(new Vector3(event.from.x, 1, event.from.z), new Vector3(event.to.x, 1, event.to.z), glow(color, 0.5), 0.15, 0.5);
    kit.add(
      streak,
      STORM_EFFECTS.blinkTime,
      (t: number): void => {
        streak.material.opacity = (1 - t) * 0.5;
      },
      null,
    );
    const delivery = event.skill.delivery;
    if (delivery.type === 'blink' && delivery.radius > 0) kit.ring(event.to.x, event.to.z, delivery.radius, color, 0.35);
  };

  const areaColor = (area: AreaState): Color => kit.colorOf(area.skill.vfx.color);

  const startArea = (area: AreaState): void => {
    const delivery: AreaDelivery | null = areaOf(area.skill);
    if (delivery === null) return;
    const color: Color = areaColor(area);
    const gap: boolean = delivery.pulse === 0 && delivery.pull === 0;
    const light: GroundLight = createGroundLight(color, { kind: 'round', radius: delivery.radius, inner: 0, arc: Math.PI * 2 }, { fill: gap ? STORM_EFFECTS.gapFill : STORM_EFFECTS.areaFill, band: 1, width: delivery.radius * STORM_EFFECTS.areaBandWidth, wobble: delivery.radius * STORM_EFFECTS.areaWobble });
    light.mesh.position.set(area.pos.x, GROUND_LIGHT.height, area.pos.z);
    light.show(STORM_EFFECTS.areaGlow);
    kit.addObject(light.mesh);
    areas.set(area.id, { light, color, delivery, duration: delivery.duration, age: 0, moteTimer: 0 });
    if (delivery.slow < 1 && delivery.pulse === 0) {
      kit.ring(area.pos.x, area.pos.z, delivery.radius, color, 0.6);
      kit.flashLight(area.pos.x, 3, area.pos.z, color, 60);
    }
  };

  const pulseArea = (area: AreaState, hits: number): void => {
    const view: AreaView | undefined = areas.get(area.id);
    if (view === undefined) return;
    const { delivery, color } = view;
    if (delivery.pull > 0) {
      kit.burst(area.pos.x, area.pos.z, delivery.radius * 0.55, area.skill);
      kit.spray(area.pos.x, 0.3, area.pos.z, color, 30, { speed: { min: 3, max: 9 }, lift: { min: 0.2, max: 1.4 }, life: { min: 0.3, max: 0.7 }, size: { min: 0.8, max: 1.8 }, drag: 3 });
      if (hits > 0) kit.trauma(area.skill.shake);
      return;
    }
    const angle: number = Math.random() * Math.PI * 2;
    const reach: number = Math.random() * delivery.radius * 0.7;
    const x: number = area.pos.x + Math.sin(angle) * reach;
    const z: number = area.pos.z + Math.cos(angle) * reach;
    const bolt = skyBolt(color);
    bolt.position.set(x, 0, z);
    flicker(bolt, STORM_EFFECTS.arcTime);
    const arcs = groundArcs(color, delivery.radius * 0.8);
    arcs.position.set(area.pos.x, 0.15, area.pos.z);
    flicker(arcs, STORM_EFFECTS.arcTime);
    kit.flashLight(x, 3, z, color, hits > 0 ? 70 : 40);
    kit.spray(x, 0.3, z, color, 10, { speed: { min: 1, max: 5 }, lift: { min: 1, max: 6 }, life: { min: 0.2, max: 0.5 } });
    if (hits > 0) kit.trauma(area.skill.shake);
  };

  const dropArea = (id: number): void => {
    const view: AreaView | undefined = areas.get(id);
    if (view === undefined) return;
    view.light.show(0);
    fading.push(view.light);
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
    if (event.stage === 'start') startArea(event.area);
    else if (event.stage === 'pulse') pulseArea(event.area, event.hits);
    else dropArea(event.area.id);
  };

  const onRelease = (event: Extract<WorldEvent, { type: 'skill_impact' }>): void => {
    const delivery = event.skill.delivery;
    if (event.skill.press?.type === 'charge' && delivery.type === 'arc') kit.burst(event.origin.x + event.direction.x * 1.2, event.origin.z + event.direction.z * 1.2, delivery.reach * STORM_EFFECTS.releaseWave, event.skill);
  };

  const motes = (view: AreaView, area: AreaState, dt: number): void => {
    const { delivery, color } = view;
    view.moteTimer -= dt;
    if (view.moteTimer > 0) return;
    view.moteTimer = 0.05;
    if (delivery.pull > 0) {
      for (let index: number = 0; index < STORM_EFFECTS.windMotes; index += 1) {
        const angle: number = Math.random() * Math.PI * 2;
        const x: number = area.pos.x + Math.sin(angle) * delivery.radius;
        const z: number = area.pos.z + Math.cos(angle) * delivery.radius;
        const swirl: number = angle + Math.PI + STORM_EFFECTS.windSpin * 0.3;
        kit.spray(x, 0.5, z, color, 1, { dirX: Math.sin(swirl), dirZ: Math.cos(swirl), spread: 0.3, speed: { min: delivery.pull * 0.8, max: delivery.pull * 1.2 }, lift: { min: 0, max: 0.6 }, life: { min: 0.35, max: 0.55 }, size: { min: 0.5, max: 1.1 }, gravity: 0, drag: 0.5 });
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
      view.light.show(area.timeLeft > STORM_EFFECTS.areaFadeOut ? STORM_EFFECTS.areaGlow : 0);
      view.light.mesh.position.set(area.pos.x, GROUND_LIGHT.height, area.pos.z);
      view.light.step(dt, world.time);
      motes(view, area, dt);
    }
    for (const id of areas.keys()) if (!world.areas.some((area: AreaState): boolean => area.id === id)) dropArea(id);
    for (const light of fading) light.step(dt, world.time);
    for (const light of fading.filter((faded: GroundLight): boolean => faded.strength < STORM_EFFECTS.areaGoneBelow)) {
      light.dispose();
      fading.splice(fading.indexOf(light), 1);
    }
  };

  const updateBrands = (dt: number, world: World): void => {
    for (const monster of world.monsters) {
      const brand = monster.alive ? monster.brand : null;
      const view: BrandView | undefined = brands.get(monster.id);
      if (brand === null) {
        if (view !== undefined) {
          view.mark.dispose();
          brands.delete(monster.id);
        }
        continue;
      }
      const reach: number = monster.radius + STORM_EFFECTS.brandSize;
      const shown: BrandView = view ?? { mark: createGroundLight(kit.colorOf(brand.burst.vfx.color), { kind: 'round', radius: reach, inner: 0, arc: Math.PI * 2 }, { fill: STORM_EFFECTS.brandFill, band: 1, width: reach * STORM_EFFECTS.brandWidth, wobble: reach * STORM_EFFECTS.areaWobble }) };
      if (view === undefined) {
        kit.addObject(shown.mark.mesh);
        brands.set(monster.id, shown);
      }
      shown.mark.mesh.position.set(monster.pos.x, STORM_EFFECTS.brandHeight, monster.pos.z);
      shown.mark.show(brand.timeLeft < 1 ? STORM_EFFECTS.brandGlow * brand.timeLeft : STORM_EFFECTS.brandGlow * (1 + STORM_EFFECTS.brandPulse * Math.sin(world.time * STORM_EFFECTS.brandRate)));
      shown.mark.step(dt, world.time);
    }
    for (const id of brands.keys()) {
      if (world.monsters.some((monster: MonsterState): boolean => monster.id === id)) continue;
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
    chargeGlow.position.copy(at);
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
    },
    update(dt: number, world: World): void {
      updateAreas(dt, world);
      updateBrands(dt, world);
      updateCharge(world);
    },
    clear(): void {
      for (const view of areas.values()) view.light.dispose();
      areas.clear();
      for (const light of fading.splice(0, fading.length)) light.dispose();
      for (const view of brands.values()) view.mark.dispose();
      brands.clear();
      chargeGlow.intensity = 0;
    },
  };
}
