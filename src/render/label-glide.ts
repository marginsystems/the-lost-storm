export const LABEL_GLIDE = {
  frequency: 16,
  rest: 0.05,
} as const;

export interface LabelGlide {
  x: number;
  y: number;
  vx: number;
  vy: number;
  started: boolean;
}

export function createGlide(): LabelGlide {
  return { x: 0, y: 0, vx: 0, vy: 0, started: false };
}

function settle(position: number, velocity: number, target: number, dt: number): readonly [number, number] {
  const omega: number = LABEL_GLIDE.frequency;
  const offset: number = position - target;
  const decay: number = Math.exp(-omega * dt);
  const slope: number = velocity + omega * offset;
  return [target + (offset + slope * dt) * decay, (velocity - omega * slope * dt) * decay];
}

export function glideToward(glide: LabelGlide, targetX: number, targetY: number, dt: number): void {
  if (!glide.started) {
    glide.x = targetX;
    glide.y = targetY;
    glide.started = true;
    return;
  }
  if (dt <= 0) return;
  const [x, vx] = settle(glide.x, glide.vx, targetX, dt);
  const [y, vy] = settle(glide.y, glide.vy, targetY, dt);
  glide.x = x;
  glide.y = y;
  glide.vx = vx;
  glide.vy = vy;
  if (Math.abs(glide.x - targetX) < LABEL_GLIDE.rest && Math.abs(glide.vx) < LABEL_GLIDE.rest) {
    glide.x = targetX;
    glide.vx = 0;
  }
  if (Math.abs(glide.y - targetY) < LABEL_GLIDE.rest && Math.abs(glide.vy) < LABEL_GLIDE.rest) {
    glide.y = targetY;
    glide.vy = 0;
  }
}
