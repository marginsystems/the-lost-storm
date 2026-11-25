import type { GroundLightForm, GroundLightLook } from './ground-light.ts';

export const AURA_LIGHT = {
  fill: 0.6,
  reach: 0.55,
  soft: 0.3,
  wobble: 0.06,
  glow: 0.2,
} as const;

export function auraLook(radius: number): GroundLightLook {
  return { fill: AURA_LIGHT.fill, band: 0, width: radius * AURA_LIGHT.soft, wobble: radius * AURA_LIGHT.wobble };
}

export function auraForm(radius: number): GroundLightForm {
  return { kind: 'round', radius: radius * AURA_LIGHT.reach, inner: 0, arc: Math.PI * 2 };
}
