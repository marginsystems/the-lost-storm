import { Color } from 'three';
import type { Object3D } from 'three';
import { stunned } from '../../sim/world/stun.ts';
import type { MonsterState, World, WorldEvent } from '../../sim/world/types.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';
import type { BurstOptions } from './particles.ts';
import { floorUp } from './terrain-lift.ts';

export const STUN_MARKS = {
  size: 0.55,
  height: 0.08,
  glow: 0.3,
  fill: 0.4,
  width: 0.4,
  wobble: 0.14,
  hollow: 1,
  grain: 0.6,
  pulse: 0.2,
  rate: 4.2,
  gone: 0.01,
  motes: 9,
  moteHeight: 1.65,
  moteSpeedMin: 0.6,
  moteSpeedMax: 1.6,
  moteLiftMin: 0.2,
  moteLiftMax: 0.9,
  moteLife: 0.35,
  moteFall: -0.4,
  color: 0xb8d4f2,
} as const;

export interface StunKit {
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly addObject: (object: Object3D) => void;
}

export interface StunMarks {
  landed(event: Extract<WorldEvent, { type: 'stun' }>): void;
  update(dt: number, world: World): void;
  clear(): void;
}

export function stunGlow(on: boolean, time: number): number {
  return on ? STUN_MARKS.glow * (1 + STUN_MARKS.pulse * Math.sin(time * STUN_MARKS.rate)) : 0;
}

export function createStunMarks(kit: StunKit): StunMarks {
  const color: Color = new Color(STUN_MARKS.color);
  const marks: Map<number, GroundLight> = new Map<number, GroundLight>();

  const markFor = (monster: MonsterState): GroundLight => {
    const held: GroundLight | undefined = marks.get(monster.id);
    if (held !== undefined) return held;
    const reach: number = monster.radius + STUN_MARKS.size;
    const mark: GroundLight = createGroundLight(color, { kind: 'round', radius: reach, inner: 0, arc: Math.PI * 2 }, { fill: STUN_MARKS.fill, band: 1, width: reach * STUN_MARKS.width, wobble: reach * STUN_MARKS.wobble, hollow: STUN_MARKS.hollow, grain: STUN_MARKS.grain });
    kit.addObject(mark.mesh);
    marks.set(monster.id, mark);
    return mark;
  };

  const drop = (id: number): void => {
    marks.get(id)?.dispose();
    marks.delete(id);
  };

  return {
    landed(event: Extract<WorldEvent, { type: 'stun' }>): void {
      const life: number = Math.max(STUN_MARKS.moteLife, event.duration);
      kit.spray(event.pos.x, STUN_MARKS.moteHeight, event.pos.z, color, STUN_MARKS.motes, { speed: { min: STUN_MARKS.moteSpeedMin, max: STUN_MARKS.moteSpeedMax }, lift: { min: STUN_MARKS.moteLiftMin, max: STUN_MARKS.moteLiftMax }, life: { min: STUN_MARKS.moteLife, max: life }, gravity: STUN_MARKS.moteFall });
    },
    update(dt: number, world: World): void {
      for (const monster of world.monsters) {
        const on: boolean = stunned(monster);
        if (!on && !marks.has(monster.id)) continue;
        const mark: GroundLight = markFor(monster);
        mark.mesh.position.set(monster.pos.x, floorUp(monster.pos.x, STUN_MARKS.height, monster.pos.z), monster.pos.z);
        mark.show(stunGlow(on, world.time));
        mark.step(dt, world.time);
        if (!on && mark.strength < STUN_MARKS.gone) drop(monster.id);
      }
      for (const id of marks.keys()) if (!world.monsters.some((monster: MonsterState): boolean => monster.id === id)) drop(id);
    },
    clear(): void {
      for (const id of marks.keys()) drop(id);
    },
  };
}
