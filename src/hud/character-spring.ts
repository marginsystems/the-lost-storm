const SPRING = {
  stiffness: 240,
  damping: 19,
  restDistance: 0.004,
  restSpeed: 0.02,
  maxStep: 0.05,
} as const;

export interface Spring {
  value: number;
  velocity: number;
  target: number;
}

export function springTo(spring: Spring, target: number): void {
  spring.target = target;
}

export function stepSpring(spring: Spring, dt: number): boolean {
  const step: number = Math.min(dt, SPRING.maxStep);
  const offset: number = spring.target - spring.value;
  if (Math.abs(offset) < SPRING.restDistance * Math.max(1, Math.abs(spring.target)) && Math.abs(spring.velocity) < SPRING.restSpeed) {
    const moved: boolean = spring.value !== spring.target;
    spring.value = spring.target;
    spring.velocity = 0;
    return moved;
  }
  spring.velocity += (offset * SPRING.stiffness - spring.velocity * SPRING.damping) * step;
  spring.value += spring.velocity * step;
  return true;
}
