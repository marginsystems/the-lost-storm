export const SHAFT_MOTION = {
  stiffness: 90,
  substep: 1 / 120,
  crowdRadius: 3.5,
  crowdDim: 1,
  rest: 0.002,
} as const;

export interface Presence {
  value: number;
  velocity: number;
}

export function hidden(): Presence {
  return { value: 0, velocity: 0 };
}

export function settle(presence: Presence, target: number, dt: number): void {
  const damping: number = 2 * Math.sqrt(SHAFT_MOTION.stiffness);
  let value: number = presence.value;
  let velocity: number = presence.velocity;
  let left: number = Math.max(0, dt);
  while (left > 0) {
    const step: number = Math.min(SHAFT_MOTION.substep, left);
    velocity += (SHAFT_MOTION.stiffness * (target - value) - damping * velocity) * step;
    value += velocity * step;
    left -= step;
  }
  if (Math.abs(target - value) < SHAFT_MOTION.rest && Math.abs(velocity) < SHAFT_MOTION.rest) {
    presence.value = target;
    presence.velocity = 0;
    return;
  }
  presence.value = Math.min(1, Math.max(0, value));
  presence.velocity = velocity;
}

export function crowdShare(xs: ArrayLike<number>, zs: ArrayLike<number>, count: number, index: number): number {
  const reach: number = SHAFT_MOTION.crowdRadius * SHAFT_MOTION.crowdRadius;
  const x: number = xs[index] ?? 0;
  const z: number = zs[index] ?? 0;
  let near: number = 0;
  for (let other: number = 0; other < count; other += 1) {
    if (other === index) continue;
    const dx: number = (xs[other] ?? 0) - x;
    const dz: number = (zs[other] ?? 0) - z;
    if (dx * dx + dz * dz < reach) near += 1;
  }
  return 1 / Math.sqrt(1 + SHAFT_MOTION.crowdDim * near);
}
