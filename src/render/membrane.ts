import type { Vec2 } from '../../sim/math.ts';

export const MEMBRANE = {
  from: 0.72,
  to: 0.97,
  stiffness: 90,
  damping: 13,
  maxStep: 1 / 30,
  glow: 0.32,
  width: 0.5,
  rest: 1e-4,
} as const;

export interface Press {
  readonly level: number;
  readonly speed: number;
}

export const SLACK: Press = { level: 0, speed: 0 };

export function pressTarget(reach: number, radius: number): number {
  if (radius <= 0 || reach >= radius || reach <= radius * MEMBRANE.from) return 0;
  const t: number = Math.min(1, Math.max(0, (reach / radius - MEMBRANE.from) / (MEMBRANE.to - MEMBRANE.from)));
  return t * t * (3 - 2 * t);
}

export function stepPress(press: Press, target: number, dt: number): Press {
  const step: number = Math.min(dt, MEMBRANE.maxStep);
  const speed: number = press.speed + ((target - press.level) * MEMBRANE.stiffness - press.speed * MEMBRANE.damping) * step;
  const level: number = Math.max(0, press.level + speed * step);
  if (target === 0 && level < MEMBRANE.rest && Math.abs(speed) < MEMBRANE.rest) return SLACK;
  return { level, speed };
}

export function pressAngle(hero: Vec2, centre: Vec2): number {
  return Math.atan2(hero.z - centre.z, hero.x - centre.x);
}
