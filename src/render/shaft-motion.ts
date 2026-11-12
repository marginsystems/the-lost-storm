export const SHAFT_MOTION = {
  stiffness: 90,
  substep: 1 / 120,
  crowdRadius: 3.5,
  crowdDim: 1,
  rest: 0.002,
} as const;

export interface Presence {
  readonly value: number;
  readonly velocity: number;
}

export interface FloorPoint {
  readonly x: number;
  readonly z: number;
}

export const HIDDEN: Presence = { value: 0, velocity: 0 };

export function settle(presence: Presence, target: number, dt: number): Presence {
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
  if (Math.abs(target - value) < SHAFT_MOTION.rest && Math.abs(velocity) < SHAFT_MOTION.rest) return { value: target, velocity: 0 };
  return { value: Math.min(1, Math.max(0, value)), velocity };
}

export function crowdShares(points: readonly FloorPoint[]): number[] {
  const reach: number = SHAFT_MOTION.crowdRadius * SHAFT_MOTION.crowdRadius;
  return points.map((point: FloorPoint, index: number): number => {
    let near: number = 0;
    points.forEach((other: FloorPoint, otherIndex: number): void => {
      if (otherIndex === index) return;
      const dx: number = other.x - point.x;
      const dz: number = other.z - point.z;
      if (dx * dx + dz * dz < reach) near += 1;
    });
    return 1 / Math.sqrt(1 + SHAFT_MOTION.crowdDim * near);
  });
}
