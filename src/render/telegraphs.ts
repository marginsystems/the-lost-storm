import type { Color, Object3D } from 'three';
import type { SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { facingOf } from '../../sim/math.ts';
import type { HazardState, MonsterState, World } from '../../sim/world/types.ts';
import type { Telegraph } from './effect-shapes.ts';
import { disposeObject, telegraphFor } from './effect-shapes.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';

export const TELEGRAPHS = {
  height: 0.09,
  easeIn: 0.14,
  easeShare: 0.3,
  edge: 0.5,
  faint: 0.55,
  strong: 0.45,
  sweep: 0.42,
  breathe: 0.12,
  breatheRate: 6,
  settle: 0.14,
  fieldGlow: 0.32,
  fieldFill: 0.14,
  fieldWidth: 0.1,
  fieldWobble: 0.07,
} as const;

export type TelegraphSource = 'actor' | 'hazard';

export interface Telegraphs {
  start(owner: number, source: TelegraphSource, at: Vec2, direction: Vec2, skill: SkillDef, windup: number, color: Color): void;
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
  readonly edge: Telegraph;
  readonly sweep: Telegraph;
  readonly windup: number;
  age: number;
  progress: number;
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

export function telegraphEdge(progress: number, age: number): number {
  const breath: number = 1 - TELEGRAPHS.breathe * (0.5 + 0.5 * Math.cos(age * TELEGRAPHS.breatheRate));
  return TELEGRAPHS.edge * (TELEGRAPHS.faint + TELEGRAPHS.strong * progress * progress) * breath;
}

export function settleLevel(settling: number): number {
  return settling < 0 ? 1 : 1 - smooth(settling / TELEGRAPHS.settle);
}

function windupOf(world: World, shown: Shown): number | null {
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

function place(object: Object3D, at: Vec2, direction: Vec2, parent: Object3D): void {
  object.position.set(at.x, TELEGRAPHS.height, at.z);
  object.rotation.y = facingOf(direction);
  parent.add(object);
}

export function createTelegraphs(parent: Object3D): Telegraphs {
  const shown: Shown[] = [];
  const fields: Field[] = [];

  const settle = (entry: Shown): void => {
    if (entry.settling < 0) entry.settling = 0;
  };

  return {
    get active(): number {
      return shown.length + fields.length;
    },
    start(owner: number, source: TelegraphSource, at: Vec2, direction: Vec2, skill: SkillDef, windup: number, color: Color): void {
      for (const entry of shown) if (entry.owner === owner) settle(entry);
      const edge: Telegraph = telegraphFor(skill.delivery, color, 'edge');
      const sweep: Telegraph = telegraphFor(skill.delivery, color, 'sweep');
      place(edge.object, at, direction, parent);
      place(sweep.object, at, direction, parent);
      for (const light of sweep.lights) light.front(0);
      shown.push({ owner, source, skillId: skill.id, edge, sweep, windup, age: 0, progress: 0, settling: -1 });
    },
    field(owner: number, at: Vec2, radius: number, color: Color): void {
      const light: GroundLight = createGroundLight(color, { kind: 'round', radius, inner: 0, arc: Math.PI * 2 }, { fill: TELEGRAPHS.fieldFill, band: 1, width: radius * TELEGRAPHS.fieldWidth, wobble: radius * TELEGRAPHS.fieldWobble });
      light.mesh.position.set(at.x, GROUND_LIGHT.height + 0.02, at.z);
      parent.add(light.mesh);
      fields.push({ owner, light, settling: -1, age: 0 });
    },
    cancel(owner: number): void {
      for (const entry of shown) if (entry.owner === owner) settle(entry);
    },
    update(dt: number, world: World): void {
      for (let index: number = shown.length - 1; index >= 0; index -= 1) {
        const entry: Shown | undefined = shown[index];
        if (entry === undefined) continue;
        entry.age += dt;
        if (entry.settling < 0) {
          const progress: number | null = windupOf(world, entry);
          if (progress === null) settle(entry);
          else entry.progress = Math.max(entry.progress, Math.min(1, progress));
        }
        if (entry.settling >= 0) entry.settling += dt;
        const level: number = telegraphEase(entry.age, entry.windup) * settleLevel(entry.settling);
        for (const light of entry.edge.lights) light.pose(telegraphEdge(entry.progress, entry.age) * level, entry.age);
        for (const light of entry.sweep.lights) {
          light.front(entry.progress);
          light.pose(TELEGRAPHS.sweep * level, entry.age);
        }
        if (entry.settling >= TELEGRAPHS.settle) {
          disposeObject(entry.edge.object);
          disposeObject(entry.sweep.object);
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
        field.light.pose(TELEGRAPHS.fieldGlow * telegraphEase(field.age, 1) * (field.settling < 0 ? 1 : 1 - smooth(field.settling / (TELEGRAPHS.settle * 2))), world.time);
        if (field.settling >= TELEGRAPHS.settle * 2) {
          field.light.dispose();
          fields.splice(index, 1);
        }
      }
    },
    clear(): void {
      for (const entry of shown) {
        disposeObject(entry.edge.object);
        disposeObject(entry.sweep.object);
      }
      shown.length = 0;
      for (const field of fields) field.light.dispose();
      fields.length = 0;
    },
  };
}
