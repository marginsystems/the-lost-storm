import type { ZoneWake } from '../../sim/content/story-types.ts';
import { wakeLength } from '../../sim/world/wake.ts';
import type { CameraShot, ShotPose } from '../render/iso-camera.ts';

export const WAKE_SHOT = {
  start: { distance: 8.8, pitchDegrees: 23, yawDegrees: 82, lookHeight: 0.3, fitWidth: 3.6 },
  push: 0.7,
  pullAt: 0.25,
  pullPower: 1.6,
  sway: { amount: 0.045, lift: 0.025, rates: [0.21, 0.34, 0.57], phases: [0.4, 2.1, 4.3], liftPhase: 1.05 },
  soft: 1,
} as const;

export interface WakeFrame {
  readonly shot: CameraShot;
  readonly soft: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function smootherstep(value: number): number {
  const t: number = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function sway(elapsed: number, offset: number): number {
  const { rates, phases } = WAKE_SHOT.sway;
  let total: number = 0;
  rates.forEach((rate: number, index: number): void => {
    total += Math.sin(elapsed * rate * Math.PI * 2 + (phases[index] ?? 0) + offset) / (index + 1);
  });
  return total / rates.length;
}

export function pullStart(plan: ZoneWake): number {
  return plan.still + plan.stir + plan.rise * WAKE_SHOT.pullAt;
}

export function wakeFrame(plan: ZoneWake, elapsed: number): WakeFrame {
  const from: number = pullStart(plan);
  const end: number = wakeLength(plan);
  const blend: number = smootherstep((elapsed - from) / (end - from)) ** WAKE_SHOT.pullPower;
  const pushed: number = from > 0 ? smootherstep(elapsed / from) : 1;
  const start = WAKE_SHOT.start;
  const pose: ShotPose = { distance: start.distance - WAKE_SHOT.push * pushed, pitchDegrees: start.pitchDegrees, yawDegrees: start.yawDegrees, lookHeight: start.lookHeight, fitWidth: start.fitWidth };
  const still: number = 1 - blend;
  return {
    shot: { pose, blend, swayX: sway(elapsed, 0) * WAKE_SHOT.sway.amount * still, swayY: sway(elapsed, WAKE_SHOT.sway.liftPhase) * WAKE_SHOT.sway.lift * still },
    soft: WAKE_SHOT.soft * still,
  };
}
