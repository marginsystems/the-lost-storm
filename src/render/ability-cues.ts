import type { Group, Mesh } from 'three';
import { Color } from 'three';
import type { SkillDef, VfxCue, VfxStyle } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import type { GroundLight, GroundLightForm } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';
import type { BurstOptions } from './particles.ts';
import { floorUp } from './terrain-lift.ts';

export const CUES = {
  handHeight: 1.45,
  handReach: 0.45,
  handMotes: 18,
  handRadius: 1.25,
  handLight: 14,
  groundFrom: 1.9,
  groundTo: 0.55,
  groundGlow: 0.85,
  groundMotes: 16,
  bladeSparks: 12,
  bladeBack: 0.5,
  shadeHeight: 0.055,
  shadeDepth: 0.38,
  shadeTime: 0.32,
  shadeGrow: 1.15,
  whirlTime: 0.22,
  whirlSparks: 24,
  whirlHeight: 1.05,
  whirlFrom: 0.35,
  whirlGlow: 0.4,
  gustMotes: 26,
  releaseLight: 12,
  shadeSoft: 0.35,
  shadeWobble: 0.1,
  groundBand: 0.3,
  groundUnder: 1.1,
  whirlWidth: 0.12,
  whirlWobble: 0.08,
  whirlFill: 0.03,
  whirlSparkMin: 0.14,
  whirlSparkMax: 0.28,
  galeSparks: 7,
  galeMotes: 2,
  blazeSparks: 12,
  blazeEmbers: 6,
  blazeSparkMin: 0.18,
  blazeSparkMax: 0.36,
  blazeLight: 3.2,
  blazeLightHeight: 1.1,
} as const;

function round(radius: number): GroundLightForm {
  return { kind: 'round', radius, inner: 0, arc: Math.PI * 2 };
}

export type NovaLook = 'shockwave' | 'whirl' | 'gust' | 'ring' | 'gale' | 'blaze' | 'mend';

const NOVA_LOOK: Readonly<Record<VfxStyle, NovaLook>> = {
  slash: 'whirl',
  claw: 'whirl',
  heave: 'whirl',
  shockwave: 'shockwave',
  storm: 'shockwave',
  brand: 'shockwave',
  wind: 'gust',
  mist: 'gust',
  bolt: 'ring',
  orb: 'ring',
  roll: 'ring',
  fork: 'ring',
  beam: 'ring',
  gap: 'ring',
  mend: 'mend',
  gale: 'gale',
  blaze: 'blaze',
  wave: 'gust',
  fire: 'shockwave',
  firebird: 'gust',
};

export function novaLook(style: VfxStyle): NovaLook {
  return NOVA_LOOK[style];
}

export function gatherScale(t: number): number {
  const eased: number = t * t;
  return CUES.groundFrom + (CUES.groundTo - CUES.groundFrom) * eased;
}

export function shadeOpacity(t: number): number {
  const rise: number = Math.min(1, t * 6);
  return CUES.shadeDepth * rise * (1 - t) * (1 - t);
}

export interface CueKit {
  readonly add: (object: Mesh | Group, duration: number, tick: (t: number) => void, owner: number | null) => void;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
  readonly gather: (x: number, y: number, z: number, color: Color, intensity: number, rise: number) => void;
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
}

export interface AbilityCues {
  windup(owner: number, pos: Vec2, direction: Vec2, skill: SkillDef, duration: number, color: Color): void;
  shade(x: number, z: number, radius: number): void;
  whirl(x: number, z: number, radius: number, color: Color): void;
  gust(x: number, z: number, radius: number, color: Color, light: number): void;
  gale(x: number, z: number, radius: number, color: Color): void;
  blaze(x: number, z: number, radius: number, color: Color): void;
}

const SHADE: Color = new Color(0x05070b);
const MIST: Color = new Color(0xdfe8f0);
const EMBER: Color = new Color(0xffc266);

export function createAbilityCues(kit: CueKit): AbilityCues {
  const shade = (x: number, z: number, radius: number): void => {
    const pool: GroundLight = createGroundLight(SHADE, round(radius), { fill: 1, band: 0, width: radius * CUES.shadeSoft, wobble: radius * CUES.shadeWobble }, 'shade');
    pool.mesh.position.set(x, floorUp(x, CUES.shadeHeight, z), z);
    kit.add(
      pool.mesh,
      CUES.shadeTime,
      (t: number): void => {
        pool.front(1 + (CUES.shadeGrow - 1) * t);
        pool.pose(shadeOpacity(t), t * CUES.shadeTime);
      },
      null,
    );
  };

  const hand = (pos: Vec2, direction: Vec2, duration: number, color: Color): void => {
    const x: number = pos.x + direction.x * CUES.handReach;
    const z: number = pos.z + direction.z * CUES.handReach;
    for (let index: number = 0; index < CUES.handMotes; index += 1) {
      const angle: number = (index / CUES.handMotes) * Math.PI * 2 + Math.random() * 0.4;
      const dirX: number = Math.sin(angle);
      const dirZ: number = Math.cos(angle);
      const rise: number = (Math.random() - 0.4) * CUES.handRadius;
      kit.spray(x + dirX * CUES.handRadius, CUES.handHeight + rise, z + dirZ * CUES.handRadius, color, 1, { dirX: -dirX, dirZ: -dirZ, spread: 0.1, speed: { min: CUES.handRadius / duration, max: (CUES.handRadius / duration) * 1.15 }, lift: { min: -rise / duration, max: -rise / duration }, life: { min: duration * 0.85, max: duration }, size: { min: 0.14, max: 0.28 }, gravity: 0, drag: 0, jitter: 0 });
    }
    kit.gather(x, CUES.handHeight, z, color, CUES.handLight, duration);
  };

  const ground = (owner: number, pos: Vec2, duration: number, color: Color): void => {
    const band: GroundLight = createGroundLight(color, round(CUES.groundFrom), { fill: 0, band: 1, width: CUES.groundBand, wobble: CUES.groundBand * 0.5 });
    band.mesh.position.set(pos.x, floorUp(pos.x, CUES.shadeHeight + 0.02, pos.z), pos.z);
    const under: GroundLight = createGroundLight(SHADE, round(CUES.groundFrom * CUES.groundUnder), { fill: 1, band: 0, width: CUES.groundFrom * CUES.shadeSoft, wobble: CUES.groundBand }, 'shade');
    under.mesh.position.set(pos.x, floorUp(pos.x, CUES.shadeHeight, pos.z), pos.z);
    kit.add(
      band.mesh,
      duration,
      (t: number): void => {
        band.front(gatherScale(t) / CUES.groundFrom);
        band.pose(CUES.groundGlow * Math.min(1, t * 4), t * duration);
      },
      owner,
    );
    kit.add(
      under.mesh,
      duration,
      (t: number): void => {
        under.front(gatherScale(t) / CUES.groundFrom);
        under.pose(CUES.shadeDepth * 0.6 * t, t * duration);
      },
      owner,
    );
    for (let index: number = 0; index < CUES.groundMotes; index += 1) {
      const angle: number = (index / CUES.groundMotes) * Math.PI * 2;
      const dirX: number = Math.sin(angle);
      const dirZ: number = Math.cos(angle);
      kit.spray(pos.x + dirX * CUES.groundFrom, 0.2, pos.z + dirZ * CUES.groundFrom, color, 1, { dirX: -dirX, dirZ: -dirZ, spread: 0.15, speed: { min: (CUES.groundFrom - CUES.groundTo) / duration, max: CUES.groundFrom / duration }, lift: { min: 0, max: 0.5 }, life: { min: duration * 0.8, max: duration }, size: { min: 0.2, max: 0.4 }, gravity: 0, drag: 0, jitter: 0 });
    }
  };

  const blade = (pos: Vec2, direction: Vec2, duration: number, color: Color): void => {
    const x: number = pos.x - direction.z * CUES.bladeBack;
    const z: number = pos.z + direction.x * CUES.bladeBack;
    kit.spray(x, CUES.handHeight, z, color, CUES.bladeSparks, { dirX: -direction.x, dirZ: -direction.z, spread: 0.6, speed: { min: 0.4, max: 1.4 }, lift: { min: 0.2, max: 1.2 }, life: { min: duration * 0.6, max: duration }, size: { min: 0.22, max: 0.4 }, gravity: 0, drag: 1.5, jitter: 0.1 });
  };

  return {
    windup(owner: number, pos: Vec2, direction: Vec2, skill: SkillDef, duration: number, color: Color): void {
      if (duration <= 0) return;
      const cue: VfxCue = skill.vfx.cue;
      if (cue === 'hand') hand(pos, direction, duration, color);
      else if (cue === 'ground') ground(owner, pos, duration, color);
      else if (cue === 'blade') blade(pos, direction, duration, color);
    },
    shade,
    whirl(x: number, z: number, radius: number, color: Color): void {
      shade(x, z, radius * 1.05);
      const band: GroundLight = createGroundLight(color, round(radius), { fill: CUES.whirlFill, band: 1, width: radius * CUES.whirlWidth, wobble: radius * CUES.whirlWobble });
      band.mesh.position.set(x, floorUp(x, CUES.shadeHeight + 0.03, z), z);
      kit.add(
        band.mesh,
        CUES.whirlTime,
        (t: number): void => {
          const opened: number = 1 - (1 - t) * (1 - t);
          band.front(CUES.whirlFrom + (1 - CUES.whirlFrom) * opened);
          band.pose(CUES.whirlGlow * (1 - t * t) * Math.min(1, t * 8), t * CUES.whirlTime);
        },
        null,
      );
      for (let index: number = 0; index < CUES.whirlSparks; index += 1) {
        const angle: number = (index / CUES.whirlSparks) * Math.PI * 2;
        const reach: number = radius * (0.55 + Math.random() * 0.4);
        kit.spray(x + Math.sin(angle) * reach, CUES.whirlHeight, z + Math.cos(angle) * reach, color, 1, { dirX: Math.cos(angle), dirZ: -Math.sin(angle), spread: 0.2, speed: { min: radius * 2.5, max: radius * 4 }, lift: { min: -0.3, max: 0.6 }, life: { min: 0.14, max: CUES.whirlTime + 0.06 }, size: { min: CUES.whirlSparkMin, max: CUES.whirlSparkMax }, gravity: 0, drag: 3, jitter: 0 });
      }
    },
    gale(x: number, z: number, radius: number, color: Color): void {
      const turn: number = Math.random() * Math.PI * 2;
      for (let index: number = 0; index < CUES.galeSparks; index += 1) {
        const angle: number = turn + (index / CUES.galeSparks) * Math.PI * 2;
        const reach: number = radius * (0.7 + Math.random() * 0.3);
        kit.spray(x + Math.sin(angle) * reach, CUES.whirlHeight, z + Math.cos(angle) * reach, color, 1, { dirX: Math.cos(angle), dirZ: -Math.sin(angle), spread: 0.25, speed: { min: radius * 2, max: radius * 3.2 }, lift: { min: -0.2, max: 0.5 }, life: { min: 0.12, max: CUES.whirlTime }, size: { min: CUES.whirlSparkMin, max: CUES.whirlSparkMax }, gravity: 0, drag: 3, jitter: 0 });
      }
      for (let index: number = 0; index < CUES.galeMotes; index += 1) {
        const angle: number = turn + (index / CUES.galeMotes) * Math.PI * 2;
        kit.spray(x + Math.sin(angle) * radius * 0.5, 0.35, z + Math.cos(angle) * radius * 0.5, MIST, 1, { dirX: Math.sin(angle), dirZ: Math.cos(angle), spread: 0.5, speed: { min: radius, max: radius * 1.8 }, lift: { min: 0.3, max: 1.4 }, life: { min: 0.25, max: 0.45 }, size: { min: 0.25, max: 0.5 }, gravity: -0.4, drag: 2.6 });
      }
    },
    blaze(x: number, z: number, radius: number, color: Color): void {
      const turn: number = Math.random() * Math.PI * 2;
      for (let index: number = 0; index < CUES.blazeSparks; index += 1) {
        const angle: number = turn + (index / CUES.blazeSparks) * Math.PI * 2;
        const reach: number = radius * (0.6 + Math.random() * 0.4);
        kit.spray(x + Math.sin(angle) * reach, CUES.whirlHeight, z + Math.cos(angle) * reach, color, 1, { dirX: Math.cos(angle), dirZ: -Math.sin(angle), spread: 0.3, speed: { min: radius * 2.2, max: radius * 3.6 }, lift: { min: 0, max: 1.2 }, life: { min: 0.16, max: CUES.whirlTime + 0.12 }, size: { min: CUES.blazeSparkMin, max: CUES.blazeSparkMax }, gravity: -0.6, drag: 3, jitter: 0 });
      }
      for (let index: number = 0; index < CUES.blazeEmbers; index += 1) {
        const angle: number = turn + (index / CUES.blazeEmbers) * Math.PI * 2;
        const reach: number = radius * (0.35 + Math.random() * 0.5);
        kit.spray(x + Math.sin(angle) * reach, 0.3, z + Math.cos(angle) * reach, EMBER, 1, { dirX: Math.cos(angle), dirZ: -Math.sin(angle), spread: 0.6, speed: { min: 0.4, max: 1.4 }, lift: { min: 1.4, max: 3.2 }, life: { min: 0.45, max: 0.85 }, size: { min: 0.08, max: 0.16 }, gravity: -0.8, drag: 1.6, jitter: 0.6 });
      }
      kit.flashLight(x, CUES.blazeLightHeight, z, color, CUES.blazeLight);
    },
    gust(x: number, z: number, radius: number, color: Color, light: number): void {
      shade(x, z, radius);
      kit.ring(x, z, radius, color, CUES.shadeTime);
      for (let index: number = 0; index < CUES.gustMotes; index += 1) {
        const angle: number = (index / CUES.gustMotes) * Math.PI * 2;
        const dirX: number = Math.sin(angle);
        const dirZ: number = Math.cos(angle);
        kit.spray(x + dirX * 0.6, 0.3, z + dirZ * 0.6, MIST, 1, { dirX, dirZ, spread: 0.3, speed: { min: radius * 2.2, max: radius * 3.4 }, lift: { min: 2, max: 7 }, life: { min: 0.22, max: 0.45 }, size: { min: 0.5, max: 1.1 }, gravity: 3, drag: 3.5 });
      }
      kit.flashLight(x, 2.4, z, color, CUES.releaseLight * light);
    },
  };
}
