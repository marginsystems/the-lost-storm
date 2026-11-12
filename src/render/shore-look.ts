import { Color } from 'three';
import type { ZoneAmbience } from '../../sim/content/types.ts';

function mixColor(from: string, to: string, t: number): string {
  return `#${new Color(from).lerp(new Color(to), t).getHexString()}`;
}

function mixNumber(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function shoreEase(depth: number): number {
  const t: number = Math.min(1, Math.max(0, depth));
  return t * t * (3 - 2 * t);
}

export function blendAmbience(from: ZoneAmbience, to: ZoneAmbience, t: number): ZoneAmbience {
  return {
    background: mixColor(from.background, to.background, t),
    abyss: mixColor(from.abyss, to.abyss, t),
    fogNear: mixNumber(from.fogNear, to.fogNear, t),
    fogFar: mixNumber(from.fogFar, to.fogFar, t),
    skyColor: mixColor(from.skyColor, to.skyColor, t),
    groundColor: mixColor(from.groundColor, to.groundColor, t),
    skyIntensity: mixNumber(from.skyIntensity, to.skyIntensity, t),
    keyColor: mixColor(from.keyColor, to.keyColor, t),
    keyIntensity: mixNumber(from.keyIntensity, to.keyIntensity, t),
  };
}
