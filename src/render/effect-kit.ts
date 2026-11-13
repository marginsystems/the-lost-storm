import type { Object3D } from 'three';
import { Color } from 'three';
import type { VfxImpact, VfxLightning } from '../../sim/content/types.ts';
import type { QualityName } from '../mobile/quality.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, flare, GROUND_LIGHT, spread } from './ground-light.ts';
import type { BurstOptions, ParticleSystem } from './particles.ts';
import type { Dice, StrandEnds } from './strand-shape.ts';
import { createDice } from './strand-shape.ts';
import type { StrandHandle, Strands } from './strands.ts';
import { createStrands } from './strands.ts';

export const KIT = {
  flashRise: 0.03,
  impactRise: 0.035,
  impactLight: 34,
  impactHeight: 1.5,
  impactMiss: 0.4,
  sparkSpeedMin: 3,
  sparkSpeedMax: 8,
  sparkLiftMin: 1,
  sparkLiftMax: 4.5,
  sparkLifeMin: 0.18,
  sparkLifeMax: 0.42,
  sparkSizeMin: 0.12,
  sparkSizeMax: 0.26,
  sparkGravity: 10,
  sparkDrag: 2.5,
  popMotes: 2,
  popLifeMin: 0.12,
  popLifeMax: 0.2,
  popSizeMin: 1.1,
  popSizeMax: 1.5,
  groundTime: 0.38,
  groundGlow: 0.45,
  groundFill: 0.35,
  groundWidth: 0.35,
  groundWobble: 0.14,
  groundFrom: 0.55,
  bodyLength: 2.2,
  bodyStart: 0.35,
  bodyLead: 0.06,
  bodyStrength: 0.9,
  bodyReshape: 1 / 30,
  trailLifeMin: 0.25,
  trailLifeMax: 0.45,
  trailSizeMin: 0.1,
  trailSizeMax: 0.2,
  trailLift: 0.5,
  trailJitter: 0.18,
  trailPerFrame: 6,
  reducedSparks: 0.5,
} as const;

export interface KitBudget {
  readonly strands: number;
  readonly groundFlashes: number;
  readonly pending: number;
  readonly sparkScale: number;
  readonly trailScale: number;
  readonly restrike: boolean;
}

export const KIT_BUDGETS: Readonly<Record<QualityName, KitBudget>> = {
  desktop: { strands: 10, groundFlashes: 6, pending: 16, sparkScale: 1, trailScale: 1, restrike: true },
  mobile: { strands: 4, groundFlashes: 3, pending: 8, sparkScale: 0.5, trailScale: 0.4, restrike: true },
};

export function kitBudget(tier: QualityName, reducedMotion: boolean): KitBudget {
  const base: KitBudget = KIT_BUDGETS[tier];
  if (!reducedMotion) return base;
  return { ...base, sparkScale: base.sparkScale * KIT.reducedSparks, trailScale: 0, restrike: false };
}

function smooth(t: number): number {
  const clamped: number = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function flashLevel(age: number, rise: number, decay: number): number {
  if (!(age > 0)) return 0;
  return smooth(age / Math.max(1e-4, rise)) * Math.exp(-decay * Math.max(0, age - rise));
}

export function sparkCount(sparks: number, scale: number): number {
  return Math.max(0, Math.round(sparks * scale));
}

export type FlashLight = (x: number, y: number, z: number, color: Color, intensity: number, rise: number) => void;

export interface EffectKit {
  impact(x: number, z: number, color: Color, impact: VfxImpact, light: number, delay: number): void;
  strike(from: StrandEnds, to: StrandEnds, color: Color, look: VfxLightning, delay: number): void;
  carry(id: number, x: number, y: number, z: number, dirX: number, dirZ: number, color: Color, look: VfxLightning, trail: number, dt: number): void;
  drop(id: number): void;
  update(dt: number): void;
  clear(): void;
  readonly strands: Strands;
  readonly pending: number;
}

interface MutableRange {
  min: number;
  max: number;
}

interface Burst {
  x: number;
  y: number;
  z: number;
  count: number;
  color: Color;
  speed: MutableRange;
  lift: MutableRange;
  life: MutableRange;
  size: MutableRange;
  gravity: number;
  drag: number;
  dirX: number;
  dirZ: number;
  spread: number;
  jitter: number;
}

interface GroundFlash {
  readonly light: GroundLight;
  readonly scale: number;
  age: number;
  duration: number;
  live: boolean;
}

interface Body {
  readonly handle: StrandHandle | null;
  readonly dice: Dice;
  readonly startX: number;
  readonly startZ: number;
  lastX: number;
  lastZ: number;
  owed: number;
  age: number;
  reshape: number;
  seed: number;
}

interface Pending {
  readonly color: Color;
  x: number;
  z: number;
  due: number;
  sparks: number;
  flash: number;
  light: number;
  live: boolean;
}

function burstOf(): Burst {
  return { x: 0, y: 0, z: 0, count: 0, color: new Color(), speed: { min: 0, max: 0 }, lift: { min: 0, max: 0 }, life: { min: 0, max: 0 }, size: { min: 0, max: 0 }, gravity: 0, drag: 0, dirX: 0, dirZ: 1, spread: Math.PI * 2, jitter: 0 };
}

function aim(burst: Burst, x: number, y: number, z: number, count: number, color: Color): BurstOptions {
  burst.x = x;
  burst.y = y;
  burst.z = z;
  burst.count = count;
  burst.color.copy(color);
  return burst;
}

function range(target: MutableRange, min: number, max: number): void {
  target.min = min;
  target.max = max;
}

export function createEffectKit(parent: Object3D, particles: ParticleSystem, flash: FlashLight, budget: () => KitBudget, random: () => number = Math.random): EffectKit {
  const start: KitBudget = budget();
  const strands: Strands = createStrands(parent, start.strands, random);
  const sparks: Burst = burstOf();
  range(sparks.speed, KIT.sparkSpeedMin, KIT.sparkSpeedMax);
  range(sparks.lift, KIT.sparkLiftMin, KIT.sparkLiftMax);
  range(sparks.life, KIT.sparkLifeMin, KIT.sparkLifeMax);
  range(sparks.size, KIT.sparkSizeMin, KIT.sparkSizeMax);
  sparks.gravity = KIT.sparkGravity;
  sparks.drag = KIT.sparkDrag;
  const pop: Burst = burstOf();
  range(pop.life, KIT.popLifeMin, KIT.popLifeMax);
  range(pop.size, KIT.popSizeMin, KIT.popSizeMax);
  pop.jitter = 0.1;
  const motes: Burst = burstOf();
  range(motes.lift, 0, KIT.trailLift);
  range(motes.life, KIT.trailLifeMin, KIT.trailLifeMax);
  range(motes.size, KIT.trailSizeMin, KIT.trailSizeMax);
  range(motes.speed, 0, KIT.trailLift);
  motes.jitter = KIT.trailJitter;
  const ground: GroundFlash[] = [];
  for (let index: number = 0; index < start.groundFlashes; index += 1) {
    const light: GroundLight = createGroundLight(new Color(), { kind: 'round', radius: 1, inner: 0, arc: Math.PI * 2 }, { fill: KIT.groundFill, band: 1, width: KIT.groundWidth, wobble: KIT.groundWobble });
    light.mesh.visible = false;
    light.mesh.position.y = GROUND_LIGHT.height + 0.045;
    parent.add(light.mesh);
    ground.push({ light, scale: light.mesh.scale.x, age: 0, duration: KIT.groundTime, live: false });
  }
  const pending: Pending[] = [];
  for (let index: number = 0; index < start.pending; index += 1) pending.push({ color: new Color(), x: 0, z: 0, due: 0, sparks: 0, flash: 0, light: 0, live: false });
  const bodies: Map<number, Body> = new Map<number, Body>();
  const tail: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  const head: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  let clock: number = 0;

  const groundFlash = (x: number, z: number, radius: number, color: Color): void => {
    if (radius <= 0 || ground.length === 0) return;
    let chosen: GroundFlash | undefined;
    for (const slot of ground) {
      if (!slot.live) {
        chosen = slot;
        break;
      }
      if (chosen === undefined || slot.age > chosen.age) chosen = slot;
    }
    if (chosen === undefined) return;
    chosen.live = true;
    chosen.age = 0;
    chosen.light.mesh.visible = true;
    chosen.light.mesh.position.x = x;
    chosen.light.mesh.position.z = z;
    chosen.light.mesh.scale.setScalar(chosen.scale * radius);
    const tint: unknown = chosen.light.mesh.material.uniforms['uColor']?.value;
    if (tint instanceof Color) tint.copy(color);
    chosen.light.pose(0, 0);
  };

  const fire = (x: number, z: number, color: Color, sparksWanted: number, radius: number, light: number): void => {
    const count: number = sparkCount(sparksWanted, budget().sparkScale);
    if (count > 0) particles.burst(aim(sparks, x, KIT.impactHeight, z, count, color));
    particles.burst(aim(pop, x, KIT.impactHeight, z, KIT.popMotes, color));
    flash(x, KIT.impactHeight, z, color, KIT.impactLight * light, KIT.impactRise);
    groundFlash(x, z, radius, color);
  };

  const drop = (id: number): void => {
    const body: Body | undefined = bodies.get(id);
    if (body === undefined) return;
    body.handle?.fade();
    bodies.delete(id);
  };

  return {
    strands,
    get pending(): number {
      let count: number = 0;
      for (const entry of pending) if (entry.live) count += 1;
      return count;
    },
    impact(x: number, z: number, color: Color, impact: VfxImpact, light: number, delay: number): void {
      if (delay <= 0) {
        fire(x, z, color, impact.sparks, impact.flash, light);
        return;
      }
      const slot: Pending | undefined = pending.find((entry: Pending): boolean => !entry.live);
      if (slot === undefined) {
        fire(x, z, color, impact.sparks, impact.flash, light);
        return;
      }
      slot.live = true;
      slot.color.copy(color);
      slot.x = x;
      slot.z = z;
      slot.due = clock + delay;
      slot.sparks = impact.sparks;
      slot.flash = impact.flash;
      slot.light = light;
    },
    strike(from: StrandEnds, to: StrandEnds, color: Color, look: VfxLightning, delay: number): void {
      strands.strike(from, to, color, look, delay, budget().restrike);
    },
    carry(id: number, x: number, y: number, z: number, dirX: number, dirZ: number, color: Color, look: VfxLightning, trail: number, dt: number): void {
      let body: Body | undefined = bodies.get(id);
      if (body === undefined) {
        body = { handle: strands.hold(color, look), dice: createDice(), startX: x, startZ: z, lastX: x, lastZ: z, owed: 0, age: 0, reshape: 0, seed: random() };
        bodies.set(id, body);
      }
      body.age += dt;
      body.reshape -= dt;
      if (body.reshape <= 0) {
        body.reshape = KIT.bodyReshape;
        body.seed = random();
      }
      const travelled: number = Math.hypot(x - body.startX, z - body.startZ);
      const length: number = Math.min(KIT.bodyLength, travelled + KIT.bodyStart);
      tail.x = x - dirX * length;
      tail.y = y;
      tail.z = z - dirZ * length;
      head.x = x;
      head.y = y;
      head.z = z;
      if (body.handle !== null) {
        body.dice.reset(body.seed);
        body.handle.shape(tail, head, body.dice.next);
        body.handle.light(KIT.bodyStrength * smooth(body.age / KIT.bodyLead));
      }
      const moved: number = Math.hypot(x - body.lastX, z - body.lastZ);
      body.owed += moved * trail * budget().trailScale;
      let emitted: number = 0;
      while (body.owed >= 1 && emitted < KIT.trailPerFrame) {
        const share: number = random();
        particles.burst(aim(motes, body.lastX + (x - body.lastX) * share, y, body.lastZ + (z - body.lastZ) * share, 1, color));
        body.owed -= 1;
        emitted += 1;
      }
      body.owed = Math.min(body.owed, 1);
      body.lastX = x;
      body.lastZ = z;
    },
    drop,
    update(dt: number): void {
      clock += dt;
      strands.update(dt);
      for (const entry of pending) {
        if (!entry.live || entry.due > clock) continue;
        entry.live = false;
        fire(entry.x, entry.z, entry.color, entry.sparks, entry.flash, entry.light);
      }
      for (const slot of ground) {
        if (!slot.live) continue;
        slot.age += dt;
        const t: number = slot.age / slot.duration;
        if (t >= 1) {
          slot.live = false;
          slot.light.pose(0, 0);
          slot.light.mesh.visible = false;
          continue;
        }
        slot.light.front(KIT.groundFrom + (1 - KIT.groundFrom) * spread(t));
        slot.light.pose(KIT.groundGlow * flare(t), clock);
      }
    },
    clear(): void {
      for (const id of bodies.keys()) drop(id);
      strands.clear();
      for (const entry of pending) entry.live = false;
      for (const slot of ground) {
        slot.live = false;
        slot.light.pose(0, 0);
        slot.light.mesh.visible = false;
      }
    },
  };
}

export interface MotionWatch {
  readonly reduced: boolean;
}

export const REDUCED_MOTION: string = '(prefers-reduced-motion: reduce)';

export function watchMotion(): MotionWatch {
  const query: MediaQueryList | null = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null;
  const state: { reduced: boolean } = { reduced: query?.matches ?? false };
  query?.addEventListener('change', (event: MediaQueryListEvent): void => {
    state.reduced = event.matches;
  });
  return state;
}
