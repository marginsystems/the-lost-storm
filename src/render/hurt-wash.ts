export const HURT_WASH = {
  begin: 0.34,
  full: 0.12,
  peak: 1,
  hitNudge: 0.25,
  hitDecay: 1.6,
  stiffness: 28,
  damping: 10,
  rest: 0.002,
  maxStep: 1 / 30,
} as const;

export interface HurtWash {
  readonly level: number;
  readonly speed: number;
  readonly nudge: number;
}

export const CALM_WASH: HurtWash = { level: 0, speed: 0, nudge: 0 };

export function lowness(share: number): number {
  const span: number = HURT_WASH.begin - HURT_WASH.full;
  const t: number = Math.min(1, Math.max(0, (HURT_WASH.begin - share) / span));
  return t * t * (3 - 2 * t);
}

export function washHit(wash: HurtWash): HurtWash {
  return { ...wash, nudge: HURT_WASH.hitNudge };
}

export function stepWash(wash: HurtWash, share: number, dt: number): HurtWash {
  const low: number = lowness(share);
  const nudge: number = Math.max(0, wash.nudge - HURT_WASH.hitDecay * dt);
  const goal: number = low * Math.min(HURT_WASH.peak, HURT_WASH.peak * (1 - HURT_WASH.hitNudge) + nudge);
  const step: number = Math.min(dt, HURT_WASH.maxStep);
  const speed: number = wash.speed + ((goal - wash.level) * HURT_WASH.stiffness - wash.speed * HURT_WASH.damping) * step;
  const level: number = Math.min(1, Math.max(0, wash.level + speed * step));
  if (goal === 0 && level < HURT_WASH.rest && Math.abs(speed) < HURT_WASH.rest) return { level: 0, speed: 0, nudge };
  return { level, speed, nudge };
}
