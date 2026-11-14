import type { Color, Group, Mesh } from 'three';
import type { SkillDef } from '../../sim/content/types.ts';
import type { EffectKit } from './effect-kit.ts';
import { glow, scorchMesh } from './effect-shapes.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, flare, GROUND_LIGHT, spread } from './ground-light.ts';
import type { BurstOptions } from './particles.ts';

export const SHOCKWAVE = {
  waveTime: 0.42,
  waveStrength: 1.1,
  waveFill: 0.3,
  waveWidth: 0.2,
  waveWobble: 0.1,
  waveGlow: 0.95,
  waveLight: 46,
  scorchTime: 0.9,
  scorchSize: 0.8,
  slamPuffs: 10,
  slamOut: 0.45,
  waveFloor: 0.2,
  dustFloor: 0.4,
  shadeGrow: 1.1,
  sprayRays: 20,
  strikeReach: 0.8,
} as const;

export interface ShockwaveKit {
  readonly add: (object: Mesh | Group, duration: number, tick: (t: number) => void, owner: number | null) => void;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
  readonly shade: (x: number, z: number, radius: number) => void;
  readonly kit: EffectKit;
  readonly dust: Color;
}

export type Shockwave = (x: number, z: number, radius: number, color: Color, skill: SkillDef) => void;

export function createShockwave(deps: ShockwaveKit): Shockwave {
  const dustSlam = (x: number, z: number, radius: number): void => {
    for (let step: number = 0; step < SHOCKWAVE.slamPuffs; step += 1) {
      const angle: number = (step / SHOCKWAVE.slamPuffs) * Math.PI * 2 + Math.random() * 0.4;
      const dirX: number = Math.sin(angle);
      const dirZ: number = Math.cos(angle);
      const out: number = radius * SHOCKWAVE.slamOut;
      deps.spray(x + dirX * out, 0.15, z + dirZ * out, deps.dust, 1, { dirX, dirZ, spread: 0.5, speed: { min: radius * 0.4, max: radius * 0.9 }, lift: { min: 0.6, max: 1.8 }, life: { min: 0.3, max: 0.55 }, size: { min: 0.6, max: 1.2 }, gravity: 0.6, drag: 3, jitter: 0.4 });
    }
  };

  return (x: number, z: number, radius: number, color: Color, skill: SkillDef): void => {
    const light: number = skill.vfx.light;
    const heft: number = SHOCKWAVE.dustFloor + (1 - SHOCKWAVE.dustFloor) * Math.min(1, light);
    const dustCount: number = light < 1 ? 1 : 2;
    const strength: number = SHOCKWAVE.waveStrength * (SHOCKWAVE.waveFloor + (1 - SHOCKWAVE.waveFloor) * Math.min(1, light));
    deps.shade(x, z, radius * SHOCKWAVE.shadeGrow);
    const wave: GroundLight = createGroundLight(glow(color, SHOCKWAVE.waveGlow), { kind: 'round', radius, inner: 0, arc: Math.PI * 2 }, { fill: SHOCKWAVE.waveFill, band: 1, width: radius * SHOCKWAVE.waveWidth, wobble: radius * SHOCKWAVE.waveWobble });
    wave.mesh.position.set(x, GROUND_LIGHT.height + 0.05, z);
    deps.add(
      wave.mesh,
      SHOCKWAVE.waveTime,
      (t: number): void => {
        wave.front(spread(t));
        wave.pose(strength * flare(t), t * SHOCKWAVE.waveTime);
      },
      null,
    );
    const scorch = scorchMesh(color);
    scorch.mesh.position.set(x, 0.1, z);
    scorch.mesh.scale.setScalar(radius * SHOCKWAVE.scorchSize);
    deps.add(
      scorch.mesh,
      SHOCKWAVE.scorchTime,
      (t: number): void => {
        scorch.material.uniforms['uFade'] = { value: 1 - t * t };
      },
      null,
    );
    const lightning = skill.vfx.lightning;
    if (lightning === null) dustSlam(x, z, radius);
    else deps.kit.skyStrike(x, z, color, lightning, radius * SHOCKWAVE.strikeReach, skill.vfx.impact, light, 0);
    for (let step: number = 0; step < SHOCKWAVE.sprayRays; step += 1) {
      const angle: number = (step / SHOCKWAVE.sprayRays) * Math.PI * 2 + Math.random() * 0.3;
      const dirX: number = Math.sin(angle);
      const dirZ: number = Math.cos(angle);
      deps.spray(x + dirX * 0.7, 0.25, z + dirZ * 0.7, color, 2, { dirX, dirZ, spread: 0.35, speed: { min: radius * 2.4, max: radius * 4.2 }, lift: { min: 0.3, max: 2.6 }, life: { min: 0.22, max: 0.5 }, size: { min: 0.22, max: 0.5 }, drag: 4.5 });
      deps.spray(x + dirX * 1.1, 0.2, z + dirZ * 1.1, deps.dust, dustCount, { dirX, dirZ, spread: 0.6, speed: { min: radius * 0.9, max: radius * 1.7 }, lift: { min: 0.2, max: 1.4 }, life: { min: 0.35, max: 0.7 * heft }, size: { min: 1.6 * heft, max: 3.2 * heft }, gravity: 0.4, drag: 2.6, jitter: 0.6 });
    }
    deps.spray(x, 0.4, z, color, 20, { speed: { min: 1, max: 5 }, lift: { min: 4, max: 12 }, life: { min: 0.25, max: 0.6 }, size: { min: 0.16, max: 0.36 } });
    deps.flashLight(x, 3, z, color, SHOCKWAVE.waveLight * light);
  };
}
