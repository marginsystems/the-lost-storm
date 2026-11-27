import { Color } from 'three';
import type { Object3D } from 'three';
import type { SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { facingOf } from '../../sim/math.ts';
import type { EchoState, HazardState, MonsterState, World } from '../../sim/world/types.ts';
import type { Telegraph } from './effect-shapes.ts';
import { disposeObject, telegraphFor } from './effect-shapes.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';
import { floorUp } from './terrain-lift.ts';

export const TELEGRAPHS = {
  height: 0.09,
  easeIn: 0.14,
  easeShare: 0.3,
  faint: 0.09,
  peak: 0.2,
  hazardFloor: 0.25,
  flare: 0.08,
  flareTime: 0.1,
  grainFrom: 0.45,
  grainTo: 0.85,
  breathe: 0.1,
  breatheRate: 6,
  settle: 0.14,
  rateBlend: 0.3,
  fieldGlow: 0.16,
  fieldWidth: 0.2,
  fieldWobble: 0.16,
  fieldHollow: 0.35,
  fieldGrain: 0.75,
  fieldBreathe: 0.22,
  fieldBreatheRate: 1.4,
  fieldSettle: 0.5,
  order: 11,
  seamThread: { fill: 0, band: 2.7, width: 0.14, wobble: 0.08 },
} as const;

export type TelegraphSource = 'actor' | 'hazard' | 'echo';

export interface Telegraphs {
  start(owner: number, source: TelegraphSource, at: Vec2, direction: Vec2, skill: SkillDef, windup: number, color: Color, path: number): void;
  field(owner: number, at: Vec2, radius: number, color: Color): void;
  cancel(owner: number): void;
  update(dt: number, world: World): void;
  clear(): void;
  readonly active: number;
}

interface Shown {
  readonly owner: number;
  readonly source: TelegraphSource;
  readonly skillId: string;
  readonly echo: EchoState | null;
  readonly shape: Telegraph;
  readonly windup: number;
  age: number;
  progress: number;
  rate: number;
  settling: number;
}

interface Field {
  readonly owner: number;
  readonly light: GroundLight;
  settling: number;
  age: number;
}

function smooth(t: number): number {
  const clamped: number = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function telegraphEase(age: number, windup: number): number {
  return smooth(age / Math.max(1e-3, Math.min(TELEGRAPHS.easeIn, windup * TELEGRAPHS.easeShare)));
}

export function telegraphFlare(remaining: number): number {
  return smooth(1 - remaining / TELEGRAPHS.flareTime);
}

export function telegraphGlow(progress: number, remaining: number, age: number): number {
  const breath: number = 1 - TELEGRAPHS.breathe * (0.5 + 0.5 * Math.cos(age * TELEGRAPHS.breatheRate));
  return (TELEGRAPHS.faint + (TELEGRAPHS.peak - TELEGRAPHS.faint) * progress * progress) * breath + TELEGRAPHS.flare * telegraphFlare(remaining);
}

export function hazardGlow(glow: number): number {
  return Math.max(glow, TELEGRAPHS.hazardFloor);
}

export function telegraphGrain(progress: number): number {
  return TELEGRAPHS.grainFrom + (TELEGRAPHS.grainTo - TELEGRAPHS.grainFrom) * progress;
}

export function settleLevel(settling: number, span: number = TELEGRAPHS.settle): number {
  return settling < 0 ? 1 : 1 - smooth(settling / span);
}

export function fieldGlow(age: number): number {
  return TELEGRAPHS.fieldGlow * (1 - TELEGRAPHS.fieldBreathe * (0.5 + 0.5 * Math.sin(age * TELEGRAPHS.fieldBreatheRate)));
}

export function echoProgress(echo: EchoState): number {
  return echo.skill.echo > 0 ? Math.min(1, Math.max(0, 1 - echo.timeLeft / echo.skill.echo)) : 1;
}

export function echoesToShow(world: World, seen: WeakSet<EchoState>): EchoState[] {
  const fresh: EchoState[] = world.echoes.filter((echo: EchoState): boolean => echo.team === 'monster' && !seen.has(echo));
  for (const echo of fresh) seen.add(echo);
  return fresh;
}

function windupOf(world: World, shown: Shown): number | null {
  if (shown.source === 'echo') return shown.echo !== null && world.echoes.includes(shown.echo) ? echoProgress(shown.echo) : null;
  if (shown.source === 'hazard') {
    for (const hazard of world.hazards) if (hazard.id === shown.owner) return hazardProgress(hazard);
    return null;
  }
  for (const monster of world.monsters) if (monster.id === shown.owner) return actionProgress(monster, shown.skillId);
  return null;
}

function hazardProgress(hazard: HazardState): number {
  return hazard.delay > 0 ? 1 - hazard.timeLeft / hazard.delay : 1;
}

function actionProgress(monster: MonsterState, skillId: string): number | null {
  const action = monster.action;
  if (!monster.alive || action === null || action.phase !== 'windup' || action.skill.id !== skillId) return null;
  return action.windup > 0 ? 1 - action.timeLeft / action.windup : 1;
}

function castShape(skill: SkillDef, color: Color, path: number): Telegraph {
  const shape: Telegraph = telegraphFor(skill.delivery, color, path);
  if (!skill.vfx.rim || skill.delivery.type !== 'area') return shape;
  const thread: GroundLight = createGroundLight(new Color(skill.vfx.color), { kind: 'round', radius: skill.delivery.radius, inner: 0, arc: Math.PI * 2 }, TELEGRAPHS.seamThread);
  shape.object.add(thread.mesh);
  return { object: shape.object, lights: [...shape.lights, thread] };
}

function place(shape: Telegraph, at: Vec2, direction: Vec2, parent: Object3D): void {
  for (const light of shape.lights) overOwnEffects(light);
  shape.object.position.set(at.x, floorUp(at.x, TELEGRAPHS.height, at.z), at.z);
  shape.object.rotation.y = facingOf(direction);
  parent.add(shape.object);
}

function overOwnEffects(light: GroundLight): void {
  light.mesh.renderOrder = TELEGRAPHS.order;
}

function setGrain(light: GroundLight, grain: number): void {
  const uniform = light.mesh.material.uniforms['uGrain'];
  if (uniform !== undefined) uniform.value = grain;
}

export function createTelegraphs(parent: Object3D, echoColor: Color | null = null): Telegraphs {
  const shown: Shown[] = [];
  const fields: Field[] = [];
  const seenEchoes: WeakSet<EchoState> = new WeakSet<EchoState>();

  const settle = (entry: Shown): void => {
    if (entry.settling < 0) entry.settling = 0;
  };

  const advance = (entry: Shown, dt: number, world: World): void => {
    if (entry.settling >= 0) return;
    const progress: number | null = windupOf(world, entry);
    if (progress === null) {
      settle(entry);
      return;
    }
    const next: number = Math.max(entry.progress, Math.min(1, progress));
    if (dt > 0 && next > entry.progress) entry.rate += (((next - entry.progress) / dt) - entry.rate) * TELEGRAPHS.rateBlend;
    entry.progress = next;
  };

  return {
    get active(): number {
      return shown.length + fields.length;
    },
    start(owner: number, source: TelegraphSource, at: Vec2, direction: Vec2, skill: SkillDef, windup: number, color: Color, path: number): void {
      for (const entry of shown) if (entry.owner === owner && entry.source !== 'echo') settle(entry);
      const shape: Telegraph = castShape(skill, color, path);
      place(shape, at, direction, parent);
      shown.push({ owner, source, skillId: skill.id, echo: null, shape, windup, age: 0, progress: 0, rate: windup > 0 ? 1 / windup : 1, settling: -1 });
    },
    field(owner: number, at: Vec2, radius: number, color: Color): void {
      const light: GroundLight = createGroundLight(color, { kind: 'round', radius, inner: 0, arc: Math.PI * 2 }, { fill: 1, band: 0, width: radius * TELEGRAPHS.fieldWidth, wobble: radius * TELEGRAPHS.fieldWobble, hollow: TELEGRAPHS.fieldHollow, grain: TELEGRAPHS.fieldGrain });
      light.mesh.position.set(at.x, floorUp(at.x, GROUND_LIGHT.height + 0.02, at.z), at.z);
      overOwnEffects(light);
      parent.add(light.mesh);
      fields.push({ owner, light, settling: -1, age: 0 });
    },
    cancel(owner: number): void {
      for (const entry of shown) if (entry.owner === owner && entry.source !== 'echo') settle(entry);
    },
    update(dt: number, world: World): void {
      if (echoColor !== null) {
        for (const echo of echoesToShow(world, seenEchoes)) {
          const shape: Telegraph = castShape(echo.skill, echoColor, 0);
          place(shape, echo.origin, echo.direction, parent);
          shown.push({ owner: echo.ownerId, source: 'echo', skillId: echo.skill.id, echo, shape, windup: echo.timeLeft, age: 0, progress: echoProgress(echo), rate: echo.timeLeft > 0 ? 1 / echo.timeLeft : 1, settling: -1 });
        }
      }
      for (let index: number = shown.length - 1; index >= 0; index -= 1) {
        const entry: Shown | undefined = shown[index];
        if (entry === undefined) continue;
        entry.age += dt;
        advance(entry, dt, world);
        if (entry.settling >= 0) entry.settling += dt;
        const remaining: number = (1 - entry.progress) / Math.max(1e-3, entry.rate);
        const level: number = telegraphEase(entry.age, entry.windup) * settleLevel(entry.settling);
        const glow: number = telegraphGlow(entry.progress, remaining, entry.age);
        for (const light of entry.shape.lights) {
          light.pose((entry.source === 'hazard' ? hazardGlow(glow) : glow) * level, entry.age);
          setGrain(light, telegraphGrain(entry.progress));
        }
        if (entry.settling >= TELEGRAPHS.settle) {
          disposeObject(entry.shape.object);
          shown.splice(index, 1);
        }
      }
      for (let index: number = fields.length - 1; index >= 0; index -= 1) {
        const field: Field | undefined = fields[index];
        if (field === undefined) continue;
        field.age += dt;
        if (field.settling < 0) {
          let alive: boolean = false;
          for (const hazard of world.hazards) if (hazard.id === field.owner) alive = true;
          if (!alive) field.settling = 0;
        } else field.settling += dt;
        field.light.pose(fieldGlow(field.age) * telegraphEase(field.age, 1) * settleLevel(field.settling, TELEGRAPHS.fieldSettle), world.time);
        if (field.settling >= TELEGRAPHS.fieldSettle) {
          field.light.dispose();
          fields.splice(index, 1);
        }
      }
    },
    clear(): void {
      for (const entry of shown) disposeObject(entry.shape.object);
      shown.length = 0;
      for (const field of fields) field.light.dispose();
      fields.length = 0;
    },
  };
}
