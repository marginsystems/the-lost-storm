import type { Group } from 'three';
import { Color, PointLight, Vector3 } from 'three';
import type { BufferGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three';
import type { FieldDelivery } from '../../sim/content/shape-types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { fieldOf } from '../../sim/world/fields.ts';
import { chargeOf } from '../../sim/world/skills.ts';
import type { FieldState, MonsterState, World, WorldEvent } from '../../sim/world/types.ts';
import { disposeObject, discMesh, glow, groundArcs, lightningLine, skyBolt } from './effect-shapes.ts';
import type { BurstOptions } from './particles.ts';

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
  fieldFill: 0.12,
  fieldEdge: 0.3,
  fieldFadeIn: 0.12,
  fieldFadeOut: 0.25,
  fieldEdgeWidth: 0.06,
  gapFill: 0.07,
  windSpin: 2.6,
  windMotes: 3,
  stormMotes: 1,
  gapMotes: 2,
  brandSize: 0.55,
  brandHeight: 0.08,
  brandSpin: 3.2,
  chargeMotes: 4,
  chargeReach: 1.6,
  chargeLight: 50,
  chargeLightRange: 10,
  chargeLightDecay: 1.6,
  arcTime: 0.22,
  releaseWave: 0.8,
} as const;

export interface StormKit {
  readonly add: (object: Mesh | Group, duration: number, tick: (t: number) => void, owner: number | null) => void;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
  readonly shockwave: (x: number, z: number, radius: number, color: Color) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
  readonly colorOf: (hex: string) => Color;
  readonly addObject: (object: Object3D) => void;
  readonly trauma: (amount: number) => void;
}

export interface StormEffects {
  handle(event: WorldEvent): void;
  update(dt: number, world: World): void;
  clear(): void;
}

interface FieldView {
  readonly disc: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly edge: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly color: Color;
  readonly delivery: FieldDelivery;
  readonly duration: number;
  age: number;
  moteTimer: number;
}

interface BrandView {
  readonly mark: Mesh<BufferGeometry, MeshBasicMaterial>;
}

const MIST: Color = new Color(0xc9d6e2);

export function createStormEffects(kit: StormKit): StormEffects {
  const fields: Map<number, FieldView> = new Map<number, FieldView>();
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

  const fieldColor = (field: FieldState): Color => kit.colorOf(field.skill.vfx.color);

  const startField = (field: FieldState): void => {
    const delivery: FieldDelivery | null = fieldOf(field.skill);
    if (delivery === null) return;
    const color: Color = fieldColor(field);
    const disc = discMesh(color, delivery.radius, 0);
    const edge = discMesh(color, delivery.radius, 0);
    edge.scale.setScalar(1);
    disc.position.set(field.pos.x, 0.07, field.pos.z);
    edge.position.set(field.pos.x, 0.075, field.pos.z);
    kit.addObject(disc);
    kit.addObject(edge);
    fields.set(field.id, { disc, edge, color, delivery, duration: delivery.duration, age: 0, moteTimer: 0 });
    if (delivery.slow < 1 && delivery.pulse === 0) {
      kit.ring(field.pos.x, field.pos.z, delivery.radius, color, 0.6);
      kit.flashLight(field.pos.x, 3, field.pos.z, color, 60);
    }
  };

  const pulseField = (field: FieldState, hits: number): void => {
    const view: FieldView | undefined = fields.get(field.id);
    if (view === undefined) return;
    const { delivery, color } = view;
    if (delivery.pull > 0) {
      kit.shockwave(field.pos.x, field.pos.z, delivery.radius * 0.55, color);
      kit.spray(field.pos.x, 0.3, field.pos.z, color, 30, { speed: { min: 3, max: 9 }, lift: { min: 0.2, max: 1.4 }, life: { min: 0.3, max: 0.7 }, size: { min: 0.8, max: 1.8 }, drag: 3 });
      kit.trauma(field.skill.shake);
      return;
    }
    const angle: number = Math.random() * Math.PI * 2;
    const reach: number = Math.random() * delivery.radius * 0.7;
    const x: number = field.pos.x + Math.sin(angle) * reach;
    const z: number = field.pos.z + Math.cos(angle) * reach;
    const bolt = skyBolt(color);
    bolt.position.set(x, 0, z);
    flicker(bolt, STORM_EFFECTS.arcTime);
    const arcs = groundArcs(color, delivery.radius * 0.8);
    arcs.position.set(field.pos.x, 0.15, field.pos.z);
    flicker(arcs, STORM_EFFECTS.arcTime);
    kit.flashLight(x, 3, z, color, hits > 0 ? 70 : 40);
    kit.spray(x, 0.3, z, color, 10, { speed: { min: 1, max: 5 }, lift: { min: 1, max: 6 }, life: { min: 0.2, max: 0.5 } });
    if (hits > 0) kit.trauma(field.skill.shake);
  };

  const dropField = (id: number): void => {
    const view: FieldView | undefined = fields.get(id);
    if (view === undefined) return;
    disposeObject(view.disc);
    disposeObject(view.edge);
    fields.delete(id);
  };

  const onBrand = (event: Extract<WorldEvent, { type: 'brand' }>): void => {
    const color: Color = kit.colorOf(event.skill.vfx.color);
    if (!event.burst) {
      kit.spray(event.pos.x, STORM_EFFECTS.bodyHeight, event.pos.z, color, 10, { speed: { min: 0.5, max: 2 }, lift: { min: 0.5, max: 2 }, life: { min: 0.3, max: 0.6 }, gravity: -1 });
      return;
    }
    const delivery = event.skill.delivery;
    kit.shockwave(event.pos.x, event.pos.z, delivery.type === 'nova' ? delivery.radius : 2, color);
    kit.flashLight(event.pos.x, 2, event.pos.z, color, 90);
    kit.trauma(event.skill.shake);
  };

  const onField = (event: Extract<WorldEvent, { type: 'field' }>): void => {
    if (event.stage === 'start') startField(event.field);
    else if (event.stage === 'pulse') pulseField(event.field, event.hits);
    else dropField(event.field.id);
  };

  const onRelease = (event: Extract<WorldEvent, { type: 'skill_impact' }>): void => {
    const delivery = event.skill.delivery;
    if (event.skill.hold?.type === 'charge' && delivery.type === 'arc') kit.shockwave(event.origin.x + event.direction.x * 1.2, event.origin.z + event.direction.z * 1.2, delivery.reach * STORM_EFFECTS.releaseWave, kit.colorOf(event.skill.vfx.color));
  };

  const motes = (view: FieldView, field: FieldState, dt: number): void => {
    const { delivery, color } = view;
    view.moteTimer -= dt;
    if (view.moteTimer > 0) return;
    view.moteTimer = 0.05;
    if (delivery.pull > 0) {
      for (let index: number = 0; index < STORM_EFFECTS.windMotes; index += 1) {
        const angle: number = Math.random() * Math.PI * 2;
        const x: number = field.pos.x + Math.sin(angle) * delivery.radius;
        const z: number = field.pos.z + Math.cos(angle) * delivery.radius;
        const swirl: number = angle + Math.PI + STORM_EFFECTS.windSpin * 0.3;
        kit.spray(x, 0.5, z, color, 1, { dirX: Math.sin(swirl), dirZ: Math.cos(swirl), spread: 0.3, speed: { min: delivery.pull * 0.8, max: delivery.pull * 1.2 }, lift: { min: 0, max: 0.6 }, life: { min: 0.35, max: 0.55 }, size: { min: 0.5, max: 1.1 }, gravity: 0, drag: 0.5 });
      }
      return;
    }
    if (delivery.pulse > 0) {
      for (let index: number = 0; index < STORM_EFFECTS.stormMotes; index += 1) {
        const angle: number = Math.random() * Math.PI * 2;
        const reach: number = Math.sqrt(Math.random()) * delivery.radius;
        kit.spray(field.pos.x + Math.sin(angle) * reach, 4.5, field.pos.z + Math.cos(angle) * reach, color, 1, { speed: { min: 0, max: 0.4 }, lift: { min: -9, max: -6 }, life: { min: 0.4, max: 0.6 }, size: { min: 0.12, max: 0.22 }, gravity: 6, drag: 0 });
      }
      return;
    }
    for (let index: number = 0; index < STORM_EFFECTS.gapMotes; index += 1) {
      const angle: number = Math.random() * Math.PI * 2;
      const reach: number = Math.sqrt(Math.random()) * delivery.radius;
      kit.spray(field.pos.x + Math.sin(angle) * reach, 0.4 + Math.random() * 2, field.pos.z + Math.cos(angle) * reach, color, 1, { speed: { min: 0, max: 0.1 }, lift: { min: 0, max: 0.15 }, life: { min: 1.2, max: 2 }, size: { min: 0.15, max: 0.3 }, gravity: 0, drag: 0, jitter: 0 });
    }
  };

  const updateFields = (dt: number, world: World): void => {
    for (const field of world.fields) {
      const view: FieldView | undefined = fields.get(field.id);
      if (view === undefined) continue;
      view.age += dt;
      const fadeIn: number = Math.min(1, view.age / STORM_EFFECTS.fieldFadeIn);
      const fadeOut: number = Math.min(1, field.timeLeft / STORM_EFFECTS.fieldFadeOut);
      const strength: number = Math.max(0, Math.min(fadeIn, fadeOut));
      const fill: number = view.delivery.pulse === 0 && view.delivery.pull === 0 ? STORM_EFFECTS.gapFill : STORM_EFFECTS.fieldFill;
      view.disc.material.opacity = fill * strength;
      view.edge.material.opacity = STORM_EFFECTS.fieldEdge * strength;
      view.disc.position.set(field.pos.x, 0.07, field.pos.z);
      view.edge.position.set(field.pos.x, 0.075, field.pos.z);
      const breathe: number = view.delivery.pull > 0 ? 1 - Math.min(1, view.age / view.duration) * 0.55 : 1;
      view.disc.scale.setScalar(breathe);
      view.edge.scale.setScalar(breathe);
      view.edge.rotation.y += dt * STORM_EFFECTS.windSpin;
      motes(view, field, dt);
    }
    for (const id of fields.keys()) if (!world.fields.some((field: FieldState): boolean => field.id === id)) dropField(id);
  };

  const updateBrands = (dt: number, world: World): void => {
    for (const monster of world.monsters) {
      const brand = monster.alive ? monster.brand : null;
      const view: BrandView | undefined = brands.get(monster.id);
      if (brand === null) {
        if (view !== undefined) {
          disposeObject(view.mark);
          brands.delete(monster.id);
        }
        continue;
      }
      const shown: BrandView = view ?? { mark: discMesh(kit.colorOf(brand.burst.vfx.color), monster.radius + STORM_EFFECTS.brandSize, 0.35) };
      if (view === undefined) {
        kit.addObject(shown.mark);
        brands.set(monster.id, shown);
      }
      shown.mark.position.set(monster.pos.x, STORM_EFFECTS.brandHeight, monster.pos.z);
      shown.mark.rotation.y += dt * STORM_EFFECTS.brandSpin;
      shown.mark.material.opacity = 0.2 + 0.15 * Math.sin(world.time * 9) + (brand.timeLeft < 1 ? -0.15 * (1 - brand.timeLeft) : 0);
    }
    for (const id of brands.keys()) {
      if (world.monsters.some((monster: MonsterState): boolean => monster.id === id)) continue;
      const view: BrandView | undefined = brands.get(id);
      if (view !== undefined) disposeObject(view.mark);
      brands.delete(id);
    }
  };

  const updateCharge = (world: World): void => {
    const action = world.player.action;
    if (action === null || action.phase !== 'windup' || action.skill.hold?.type !== 'charge') {
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
      else if (event.type === 'field') onField(event);
      else if (event.type === 'skill_impact') onRelease(event);
    },
    update(dt: number, world: World): void {
      updateFields(dt, world);
      updateBrands(dt, world);
      updateCharge(world);
    },
    clear(): void {
      for (const id of fields.keys()) dropField(id);
      for (const view of brands.values()) disposeObject(view.mark);
      brands.clear();
      chargeGlow.intensity = 0;
    },
  };
}
