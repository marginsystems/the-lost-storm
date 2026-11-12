import type { WakeStage } from '../../sim/world/wake.ts';

export const WAKE_POSE = {
  stir: { reach: 0.07, rest: 0.035, pulses: 2, curl: 0.9 },
  rise: [
    { at: 0, share: 0 },
    { at: 0.36, share: 0.44 },
    { at: 0.6, share: 0.5 },
    { at: 1, share: 1 },
  ],
  look: [
    { at: 0, turn: 0 },
    { at: 0.12, turn: 0 },
    { at: 0.38, turn: 1 },
    { at: 0.72, turn: -1 },
    { at: 0.92, turn: 0 },
    { at: 1, turn: 0 },
  ],
  turnDegrees: 34,
  neckShare: 0.4,
  dip: 0.18,
  dipShare: 0.4,
  breath: { amount: 0.06, period: 3.6 },
  contacts: [
    { bone: 'DEF-hips', radius: 0.12 },
    { bone: 'DEF-spine.003', radius: 0.12 },
    { bone: 'DEF-head', radius: 0.11 },
    { bone: 'DEF-foot.L', radius: 0.07 },
    { bone: 'DEF-foot.R', radius: 0.07 },
    { bone: 'DEF-hand.L', radius: 0.03 },
    { bone: 'DEF-hand.R', radius: 0.03 },
  ],
  restUntil: { from: 0.7, to: 1 },
} as const;

export interface Contact {
  readonly y: number;
  readonly radius: number;
}

export interface WakePose {
  readonly share: number;
  readonly standing: boolean;
  readonly turn: number;
  readonly curl: number;
  readonly dip: number;
  readonly breath: number;
}

interface Knot {
  readonly at: number;
  readonly value: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function ease(value: number): number {
  const t: number = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function throughKnots(knots: readonly Knot[], at: number): number {
  const first: Knot | undefined = knots[0];
  if (first === undefined) return 0;
  let before: Knot = first;
  for (const knot of knots) {
    if (at <= knot.at) return knot.at === before.at ? knot.value : before.value + (knot.value - before.value) * ease((at - before.at) / (knot.at - before.at));
    before = knot;
  }
  return before.value;
}

const RISE: readonly Knot[] = WAKE_POSE.rise.map((knot): Knot => ({ at: knot.at, value: knot.share }));
const LOOK: readonly Knot[] = WAKE_POSE.look.map((knot): Knot => ({ at: knot.at, value: knot.turn }));

export function stirShare(stir: number): number {
  const { reach, rest, pulses } = WAKE_POSE.stir;
  if (stir <= 0) return 0;
  const swell: number = Math.sin(clamp01(stir) * Math.PI * pulses - Math.PI / 2) * 0.5 + 0.5;
  return rest * ease(stir) + (reach - rest) * swell * (1 - ease(stir)) * ease(stir * pulses);
}

export function wakePose(stage: WakeStage, elapsed: number): WakePose {
  const lifted: number = stirShare(stage.stir);
  const share: number = stage.rise > 0 ? lifted + (1 - lifted) * throughKnots(RISE, stage.rise) : lifted;
  const curl: number = WAKE_POSE.stir.curl * Math.sin(clamp01(stage.stir) * Math.PI) * (1 - stage.rise);
  return { share, standing: stage.rise >= 1, turn: throughKnots(LOOK, stage.settle), curl, dip: WAKE_POSE.dip * Math.sin(Math.PI * clamp01(stage.settle / WAKE_POSE.dipShare)), breath: WAKE_POSE.breath.amount * Math.sin((elapsed / WAKE_POSE.breath.period) * Math.PI * 2) * (1 - ease(stage.rise * 2)) };
}

export function restOffset(contacts: readonly Contact[], floor: number): number {
  if (contacts.length === 0) return 0;
  let lowest: number = Number.POSITIVE_INFINITY;
  for (const contact of contacts) lowest = Math.min(lowest, contact.y - contact.radius);
  return floor - lowest;
}

export function restWeight(share: number): number {
  return 1 - ease((share - WAKE_POSE.restUntil.from) / (WAKE_POSE.restUntil.to - WAKE_POSE.restUntil.from));
}
