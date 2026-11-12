import type { BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { Color, Mesh as ThreeMesh } from 'three';
import type { SkillDef, VfxCue, VfxStyle } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { additive, flat, sectorGeometry } from './effect-shapes.ts';
import type { BurstOptions } from './particles.ts';

export const CUES = {
  handHeight: 1.45,
  handReach: 0.45,
  handMotes: 18,
  handRadius: 1.25,
  handLight: 14,
  groundFrom: 1.9,
  groundTo: 0.55,
  groundWidth: 0.16,
  groundGlow: 0.85,
  groundMotes: 16,
  bladeSparks: 12,
  bladeBack: 0.5,
  shadeHeight: 0.055,
  shadeDepth: 0.38,
  shadeTime: 0.32,
  shadeGrow: 1.15,
  whirlTime: 0.22,
  whirlSparks: 36,
  whirlHeight: 1.05,
  whirlBand: 0.14,
  whirlFrom: 0.35,
  whirlGlow: 0.9,
  gustMotes: 26,
  releaseLight: 26,
} as const;

export type NovaLook = 'shockwave' | 'whirl' | 'gust' | 'ring';

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
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
}

export interface AbilityCues {
  windup(owner: number, pos: Vec2, direction: Vec2, skill: SkillDef, duration: number, color: Color): void;
  shade(x: number, z: number, radius: number): void;
  whirl(x: number, z: number, radius: number, color: Color): void;
  gust(x: number, z: number, radius: number, color: Color, light: number): void;
}

const SHADE: Color = new Color(0x05070b);
const MIST: Color = new Color(0xdfe8f0);

export function createAbilityCues(kit: CueKit): AbilityCues {
  const shade = (x: number, z: number, radius: number): void => {
    const disc: Mesh<BufferGeometry, MeshBasicMaterial> = new ThreeMesh(sectorGeometry(Math.PI * 2, 0, radius), flat(SHADE, 0));
    disc.position.set(x, CUES.shadeHeight, z);
    disc.renderOrder = 3;
    kit.add(
      disc,
      CUES.shadeTime,
      (t: number): void => {
        disc.material.opacity = shadeOpacity(t);
        disc.scale.setScalar(1 + (CUES.shadeGrow - 1) * t);
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
    kit.flashLight(x, CUES.handHeight, z, color, CUES.handLight);
  };

  const ground = (owner: number, pos: Vec2, duration: number, color: Color): void => {
    const band: Mesh<BufferGeometry, MeshBasicMaterial> = new ThreeMesh(sectorGeometry(Math.PI * 2, 1 - CUES.groundWidth, 1), additive(color, 0));
    band.position.set(pos.x, CUES.shadeHeight + 0.02, pos.z);
    band.renderOrder = 5;
    const under: Mesh<BufferGeometry, MeshBasicMaterial> = new ThreeMesh(sectorGeometry(Math.PI * 2, 0, 1), flat(SHADE, 0));
    under.position.set(pos.x, CUES.shadeHeight, pos.z);
    under.renderOrder = 3;
    kit.add(
      band,
      duration,
      (t: number): void => {
        band.scale.setScalar(gatherScale(t));
        band.material.opacity = CUES.groundGlow * Math.min(1, t * 4);
      },
      owner,
    );
    kit.add(
      under,
      duration,
      (t: number): void => {
        under.scale.setScalar(gatherScale(t) * 1.1);
        under.material.opacity = CUES.shadeDepth * 0.6 * t;
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
      const band: Mesh<BufferGeometry, MeshBasicMaterial> = new ThreeMesh(sectorGeometry(Math.PI * 2, 1 - CUES.whirlBand, 1), additive(color, 0));
      band.position.set(x, CUES.shadeHeight + 0.03, z);
      band.renderOrder = 5;
      kit.add(
        band,
        CUES.whirlTime,
        (t: number): void => {
          const opened: number = 1 - (1 - t) * (1 - t);
          band.scale.setScalar(radius * (CUES.whirlFrom + (1 - CUES.whirlFrom) * opened));
          band.material.opacity = CUES.whirlGlow * (1 - t * t);
        },
        null,
      );
      for (let index: number = 0; index < CUES.whirlSparks; index += 1) {
        const angle: number = (index / CUES.whirlSparks) * Math.PI * 2;
        const reach: number = radius * (0.55 + Math.random() * 0.4);
        kit.spray(x + Math.sin(angle) * reach, CUES.whirlHeight, z + Math.cos(angle) * reach, color, 1, { dirX: Math.cos(angle), dirZ: -Math.sin(angle), spread: 0.2, speed: { min: radius * 2.5, max: radius * 4 }, lift: { min: -0.3, max: 0.6 }, life: { min: 0.14, max: CUES.whirlTime + 0.06 }, size: { min: 0.35, max: 0.6 }, gravity: 0, drag: 3, jitter: 0 });
      }
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
