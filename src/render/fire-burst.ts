import type { Object3D } from 'three';
import { Color, PointLight } from 'three';
import type { AreaDelivery } from '../../sim/content/shape-types.ts';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { VfxBurn, VfxFlare, VfxImpact } from '../../sim/content/vfx-types.ts';
import { areaOf } from '../../sim/world/areas.ts';
import type { Actor, AreaState, World, WorldEvent } from '../../sim/world/types.ts';
import type { EffectKit } from './effect-kit.ts';
import type { GroundLight, GroundLightLook } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';
import type { BurstOptions } from './particles.ts';
import { dustHeadings } from './punch.ts';
import { floorUp } from './terrain-lift.ts';

export const FIRE = {
  flash: 0xfff1c2,
  flame: 0xffb347,
  ember: 0x9a2410,
  soot: 0x3a2e26,
  flareFade: 0.09,
  fadeFrom: 0.55,
  blastFade: 0.12,
  blastGlow: 1.5,
  burnGlow: 0.3,
  flareGlow: 0.75,
  groundFill: 0.35,
  groundBand: 0.7,
  groundWidth: 0.3,
  groundWobble: 0.35,
  groundGrain: 0.65,
  blastLight: 80,
  blastFlames: 46,
  shoveLife: 0.55,
  shoveSize: 0.9,
  lights: 1,
  lightRange: 11,
  lightDecay: 1.6,
  lightHeight: 1.4,
  lightFlare: 0.7,
  flameRate: 70,
  flareFlames: 14,
  flameCap: 10,
  actorRate: 26,
  actorFlare: 6,
  actorHeight: 1.1,
  actorSpread: 0.35,
  tickEmbers: 5,
  hotShare: 0.6,
  flameFloor: 0.15,
  flameDrift: 0.6,
  flameLifeMin: 0.25,
  flameLifeMax: 0.55,
  flameSizeMin: 0.45,
  flameSizeMax: 1,
  flameRise: -1.5,
  flameDrag: 1.5,
  flameJitter: 0.35,
  emberLifeMin: 0.5,
  emberLifeMax: 1.1,
  emberSizeMin: 0.08,
  emberSizeMax: 0.18,
  blastSpread: 0.6,
  blastLift: 5,
  burnLift: 2.5,
  flareLift: 4,
  flareSpread: 0.8,
  flareEmbers: 0.3,
  flareEmberHeight: 0.4,
  idleFlames: 0.4,
  actorLift: 2.2,
  actorFlareLift: 3.5,
  laneRun: 0.22,
  laneSpread: 0.75,
} as const;

export interface FireBed {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly toward: ReadonlyVec2;
  readonly reach: number;
}

export function bedPoint(bed: FireBed, spread: number, along: number, across: number, angle: number): ReadonlyVec2 {
  if (bed.reach <= 0) {
    const reach: number = Math.sqrt(along) * bed.radius * spread;
    return { x: bed.x + Math.sin(angle) * reach, z: bed.z + Math.cos(angle) * reach };
  }
  const forward: number = along * bed.reach;
  const side: number = (across * 2 - 1) * bed.radius * spread;
  return { x: bed.x + bed.toward.x * forward + bed.toward.z * side, z: bed.z + bed.toward.z * forward - bed.toward.x * side };
}

function spot(x: number, z: number, radius: number): FireBed {
  return { x, z, radius, toward: { x: 0, z: 1 }, reach: 0 };
}

export function laneFront(age: number): number {
  return Math.min(1, Math.max(0, age / FIRE.laneRun));
}

export function flareLevel(flares: readonly VfxFlare[], since: number): number {
  let level: number = 0;
  for (const flare of flares) {
    if (flare.at > since) break;
    level += flare.strength * Math.exp(-(since - flare.at) / FIRE.flareFade);
  }
  return Math.min(1, level);
}

export function flaresCrossed(flares: readonly VfxFlare[], from: number, to: number): VfxFlare[] {
  return flares.filter((flare: VfxFlare): boolean => flare.at > from && flare.at <= to);
}

export function burnFade(since: number, duration: number): number {
  if (duration <= 0) return 0;
  const share: number = since / duration;
  const t: number = Math.min(1, Math.max(0, (share - FIRE.fadeFrom) / (1 - FIRE.fadeFrom)));
  return since < 0 ? 0 : 1 - t * t * (3 - 2 * t);
}

export function rekindle(held: BurnClock | null, skill: string, duration: number): BurnClock {
  if (held === null || held.skill !== skill) return { skill, duration, age: 0 };
  return { skill, duration: held.age + duration, age: held.age };
}

export function blastLevel(age: number): number {
  return age < 0 ? 0 : Math.exp(-age / FIRE.blastFade);
}

export interface FireKit {
  readonly parent: Object3D;
  readonly kit: EffectKit;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
  readonly colorOf: (hex: string) => Color;
  readonly trauma: (amount: number) => void;
}

export interface FireBursts {
  blast(area: AreaState): void;
  ignite(targetId: number, skill: SkillDef, duration: number): void;
  tick(x: number, z: number): void;
  take(event: WorldEvent): void;
  update(dt: number, world: World): void;
  clear(): void;
}

interface Patch {
  readonly areaId: number;
  readonly ground: GroundLight;
  light: PointLight | null;
  readonly look: VfxBurn;
  readonly color: Color;
  readonly bed: FireBed;
  readonly forward: boolean;
  readonly duration: number;
  age: number;
  owed: number;
}

export interface BurnClock {
  readonly skill: string;
  readonly duration: number;
  readonly age: number;
}

interface Burning {
  readonly skill: string;
  readonly look: VfxBurn;
  readonly color: Color;
  readonly duration: number;
  age: number;
  owed: number;
}

const FLASH: Color = new Color(FIRE.flash);
const FLAME: Color = new Color(FIRE.flame);
const EMBER: Color = new Color(FIRE.ember);
const SOOT: Color = new Color(FIRE.soot);

function actorOf(world: World, id: number): Actor | null {
  if (world.player.id === id) return world.player;
  return world.monsters.find((monster: Actor): boolean => monster.id === id) ?? null;
}

export function createFireBursts(kit: FireKit): FireBursts {
  const patches: Patch[] = [];
  const burning: Map<number, Burning> = new Map<number, Burning>();
  const lights: PointLight[] = [];
  for (let index: number = 0; index < FIRE.lights; index += 1) {
    const light: PointLight = new PointLight(FIRE.flame, 0, FIRE.lightRange, FIRE.lightDecay);
    kit.parent.add(light);
    lights.push(light);
  }

  const freeLight = (): PointLight | null => lights.find((light: PointLight): boolean => !patches.some((patch: Patch): boolean => patch.light === light)) ?? null;

  const takeLight = (): PointLight | null => {
    const free: PointLight | null = freeLight();
    if (free !== null) return free;
    let ending: Patch | null = null;
    for (const patch of patches) if (patch.light !== null && (ending === null || patch.duration - patch.age < ending.duration - ending.age)) ending = patch;
    if (ending === null) return null;
    const taken: PointLight | null = ending.light;
    ending.light = null;
    return taken;
  };

  const flames = (bed: FireBed, spread: number, color: Color, count: number, lift: number): void => {
    for (let index: number = 0; index < count; index += 1) {
      const at: ReadonlyVec2 = bedPoint(bed, spread, Math.random(), Math.random(), Math.random() * Math.PI * 2);
      const hot: boolean = Math.random() < FIRE.hotShare;
      kit.spray(at.x, FIRE.flameFloor, at.z, hot ? FLAME : color, 1, { speed: { min: 0, max: FIRE.flameDrift }, lift: { min: lift * 0.5, max: lift }, life: { min: FIRE.flameLifeMin, max: FIRE.flameLifeMax }, size: { min: FIRE.flameSizeMin, max: FIRE.flameSizeMax }, gravity: FIRE.flameRise, drag: FIRE.flameDrag, jitter: FIRE.flameJitter });
    }
  };


  const embers = (x: number, y: number, z: number, count: number): void => {
    kit.spray(x, y, z, EMBER, count, { speed: { min: 0.2, max: 1.4 }, lift: { min: 1, max: 3 }, life: { min: FIRE.emberLifeMin, max: FIRE.emberLifeMax }, size: { min: FIRE.emberSizeMin, max: FIRE.emberSizeMax }, gravity: -0.6, drag: 0.8, jitter: 0.6 });
  };

  const dropPatch = (patch: Patch): void => {
    patch.ground.mesh.removeFromParent();
    patch.ground.dispose();
    if (patch.light !== null) patch.light.intensity = 0;
  };

  const bursts: FireBursts = {
    blast(area: AreaState): void {
      const look: VfxBurn | null = area.skill.vfx.burn;
      const delivery: AreaDelivery | null = areaOf(area.skill);
      if (look === null || delivery === null) return;
      const color: Color = kit.colorOf(area.skill.vfx.color);
      const { x, z } = area.pos;
      const bed: FireBed = { x, z, radius: delivery.radius, toward: { x: area.toward.x, z: area.toward.z }, reach: delivery.length > 0 ? area.reach : 0 };
      const middle: ReadonlyVec2 = bedPoint(bed, 0, 0.5, 0.5, 0);
      const impact: VfxImpact | null = area.skill.vfx.impact;
      if (impact !== null) kit.kit.impact(x, z, color, impact, area.skill.vfx.light, 0);
      if (impact !== null) {
        const contact: ReadonlyVec2 = delivery.pushForward ? area.pos : middle;
        kit.flashLight(contact.x, FIRE.lightHeight, contact.z, FLASH, FIRE.blastLight * area.skill.vfx.light);
        flames(delivery.pushForward ? spot(x, z, delivery.radius) : bed, bed.reach > 0 ? FIRE.laneSpread : FIRE.blastSpread, color, FIRE.blastFlames, FIRE.blastLift);
      }
      if (!delivery.pushForward) kit.trauma(area.skill.shake);
      const punch = area.skill.vfx.punch;
      if (punch !== null) {
        for (const heading of dustHeadings(punch.dust, Math.random() * Math.PI * 2)) {
          const from: ReadonlyVec2 = delivery.pushForward ? area.pos : bedPoint(bed, 0, Math.random(), 0.5, 0);
          kit.spray(from.x, 0.2, from.z, SOOT, 1, { dirX: heading.x, dirZ: heading.z, spread: 0.4, speed: { min: punch.kick * 0.6, max: punch.kick }, lift: { min: 0.2, max: 1.2 }, life: { min: FIRE.shoveLife * 0.6, max: FIRE.shoveLife }, size: { min: FIRE.shoveSize * 0.6, max: FIRE.shoveSize }, gravity: 0.4, drag: 3, jitter: 0.3 });
        }
      }
      const glow: GroundLightLook = { fill: FIRE.groundFill, band: FIRE.groundBand, width: delivery.radius * FIRE.groundWidth, wobble: delivery.radius * FIRE.groundWobble, grain: FIRE.groundGrain };
      const ground: GroundLight = bed.reach > 0 ? createGroundLight(color, { kind: 'lane', halfWidth: delivery.radius, start: 0, length: bed.reach }, glow) : createGroundLight(color, { kind: 'round', radius: delivery.radius, inner: 0, arc: Math.PI * 2 }, glow);
      ground.mesh.position.set(x, floorUp(x, GROUND_LIGHT.height, z), z);
      if (bed.reach > 0) {
        ground.mesh.rotation.z = Math.atan2(-bed.toward.x, -bed.toward.z);
        ground.front(0);
      }
      ground.setNow(0);
      kit.parent.add(ground.mesh);
      const light: PointLight | null = takeLight();
      if (light !== null) {
        light.color.copy(color);
        light.position.set(middle.x, floorUp(middle.x, FIRE.lightHeight, middle.z), middle.z);
      }
      patches.push({ areaId: area.id, ground, light, look, color, bed, forward: delivery.pushForward, duration: delivery.duration, age: 0, owed: 0 });
    },
    ignite(targetId: number, skill: SkillDef, duration: number): void {
      const look: VfxBurn | null = skill.vfx.burn;
      if (look === null) return;
      const held: Burning | null = burning.get(targetId) ?? null;
      const clock: BurnClock = rekindle(held, skill.id, duration);
      if (held !== null && held.skill === skill.id) {
        burning.set(targetId, { ...held, duration: clock.duration });
        return;
      }
      burning.set(targetId, { ...clock, look, color: kit.colorOf(skill.vfx.color), owed: 0 });
    },
    tick(x: number, z: number): void {
      embers(x, FIRE.actorHeight, z, FIRE.tickEmbers);
    },
    take(event: WorldEvent): void {
      if (event.type === 'damage' && event.burn) bursts.tick(event.pos.x, event.pos.z);
      else if (event.type === 'area' && event.stage === 'start') bursts.blast(event.area);
      else if (event.type === 'area' && event.stage === 'end' && event.area.skill.vfx.burn !== null) {
        const index: number = patches.findIndex((patch: Patch): boolean => patch.areaId === event.area.id);
        const ended: Patch | undefined = patches[index];
        if (ended !== undefined) {
          dropPatch(ended);
          patches.splice(index, 1);
        }
      } else if (event.type === 'burn') bursts.ignite(event.targetId, event.skill, event.duration);
    },
    update(dt: number, world: World): void {
      for (let index: number = patches.length - 1; index >= 0; index -= 1) {
        const patch: Patch | undefined = patches[index];
        if (patch === undefined) continue;
        const before: number = patch.age;
        patch.age += dt;
        const fade: number = burnFade(patch.age, patch.duration);
        const flare: number = flareLevel(patch.look.flares, patch.age);
        const level: number = blastLevel(patch.age) * FIRE.blastGlow + fade * (FIRE.burnGlow + flare * FIRE.flareGlow);
        patch.ground.pose(level, world.time);
        if (patch.bed.reach > 0) patch.ground.front(laneFront(patch.age));
        if (patch.light !== null) patch.light.intensity = patch.look.light * fade * (1 + flare * FIRE.lightFlare);
        patch.owed += FIRE.flameRate * fade * (FIRE.idleFlames + flare) * dt;
        const due: number = Math.min(FIRE.flameCap, Math.floor(patch.owed));
        patch.owed -= due;
        if (due > 0) flames(patch.bed, 1, patch.color, due, FIRE.burnLift);
        for (const crossed of flaresCrossed(patch.look.flares, before, patch.age)) {
          const front: ReadonlyVec2 = bedPoint(patch.bed, 0, laneFront(crossed.at), 0.5, 0);
          const flaring: FireBed = patch.forward ? spot(front.x, front.z, patch.bed.radius) : patch.bed;
          flames(flaring, FIRE.flareSpread, patch.color, Math.round(FIRE.flareFlames * crossed.strength), FIRE.flareLift);
          const ember: ReadonlyVec2 = bedPoint(flaring, FIRE.flareSpread, Math.random(), Math.random(), Math.random() * Math.PI * 2);
          embers(ember.x, FIRE.flareEmberHeight, ember.z, Math.round(patch.look.embers * crossed.strength * FIRE.flareEmbers));
        }
        if (patch.age >= patch.duration) {
          dropPatch(patch);
          patches.splice(index, 1);
        }
      }
      for (const [id, burn] of burning) {
        const actor: Actor | null = actorOf(world, id);
        const before: number = burn.age;
        burn.age += dt;
        if (actor === null || !actor.alive || burn.age >= burn.duration) {
          burning.delete(id);
          continue;
        }
        const fade: number = burnFade(burn.age, burn.duration);
        burn.owed += FIRE.actorRate * fade * dt;
        const due: number = Math.floor(burn.owed);
        burn.owed -= due;
        if (due > 0) flames(spot(actor.pos.x, actor.pos.z, FIRE.actorSpread), 1, burn.color, due, FIRE.actorLift);
        for (const crossed of flaresCrossed(burn.look.flares, before, burn.age)) flames(spot(actor.pos.x, actor.pos.z, FIRE.actorSpread), 1, burn.color, Math.round(FIRE.actorFlare * crossed.strength), FIRE.actorFlareLift);
      }
    },
    clear(): void {
      for (const patch of patches) dropPatch(patch);
      patches.length = 0;
      burning.clear();
    },
  };
  return bursts;
}
