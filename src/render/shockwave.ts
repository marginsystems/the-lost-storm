import type { Color, Group, Mesh } from 'three';
import type { SkillDef } from '../../sim/content/types.ts';
import type { EffectKit } from './effect-kit.ts';
import { glow, groundArcs, scorchMesh, skyBolt } from './effect-shapes.ts';
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
  skyBoltDim: 0.55,
  boltTime: 0.22,
  arcTime: 0.26,
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
  const flickerSky = (x: number, z: number, radius: number, color: Color, light: number): void => {
    const bolt = skyBolt(color.clone().multiplyScalar(SHOCKWAVE.skyBoltDim * Math.min(1, light + 0.3)));
    bolt.position.set(x, 0, z);
    deps.add(
      bolt,
      SHOCKWAVE.boltTime,
      (t: number): void => {
        bolt.visible = t < 0.4 || (t > 0.55 && t < 0.8);
      },
      null,
    );
    const arcs = groundArcs(color, radius);
    arcs.position.set(x, 0.16, z);
    deps.add(
      arcs,
      SHOCKWAVE.arcTime,
      (t: number): void => {
        arcs.visible = t < 0.3 || (t > 0.45 && t < 0.7) || t > 0.85;
        arcs.material.opacity = 1 - t * t;
      },
      null,
    );
  };

  return (x: number, z: number, radius: number, color: Color, skill: SkillDef): void => {
    const light: number = skill.vfx.light;
    deps.shade(x, z, radius * SHOCKWAVE.shadeGrow);
    const wave: GroundLight = createGroundLight(glow(color, SHOCKWAVE.waveGlow), { kind: 'round', radius, inner: 0, arc: Math.PI * 2 }, { fill: SHOCKWAVE.waveFill, band: 1, width: radius * SHOCKWAVE.waveWidth, wobble: radius * SHOCKWAVE.waveWobble });
    wave.mesh.position.set(x, GROUND_LIGHT.height + 0.05, z);
    deps.add(
      wave.mesh,
      SHOCKWAVE.waveTime,
      (t: number): void => {
        wave.front(spread(t));
        wave.pose(SHOCKWAVE.waveStrength * flare(t), t * SHOCKWAVE.waveTime);
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
    if (lightning === null) flickerSky(x, z, radius, color, light);
    else deps.kit.skyStrike(x, z, color, lightning, radius * SHOCKWAVE.strikeReach, skill.vfx.impact, light, 0);
    for (let step: number = 0; step < SHOCKWAVE.sprayRays; step += 1) {
      const angle: number = (step / SHOCKWAVE.sprayRays) * Math.PI * 2 + Math.random() * 0.3;
      const dirX: number = Math.sin(angle);
      const dirZ: number = Math.cos(angle);
      deps.spray(x + dirX * 0.7, 0.25, z + dirZ * 0.7, color, 2, { dirX, dirZ, spread: 0.35, speed: { min: radius * 2.4, max: radius * 4.2 }, lift: { min: 0.3, max: 2.6 }, life: { min: 0.22, max: 0.5 }, size: { min: 0.22, max: 0.5 }, drag: 4.5 });
      deps.spray(x + dirX * 1.1, 0.2, z + dirZ * 1.1, deps.dust, 2, { dirX, dirZ, spread: 0.6, speed: { min: radius * 0.9, max: radius * 1.7 }, lift: { min: 0.2, max: 1.4 }, life: { min: 0.35, max: 0.7 }, size: { min: 1.6, max: 3.2 }, gravity: 0.4, drag: 2.6, jitter: 0.6 });
    }
    deps.spray(x, 0.4, z, color, 20, { speed: { min: 1, max: 5 }, lift: { min: 4, max: 12 }, life: { min: 0.25, max: 0.6 }, size: { min: 0.16, max: 0.36 } });
    deps.flashLight(x, 3, z, color, SHOCKWAVE.waveLight * light);
  };
}
