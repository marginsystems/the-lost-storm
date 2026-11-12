export const LIGHTNING = {
  soundSpeed: 343,
  deepHold: 0.024,
  shallowKeep: 0.82,
  leaderRise: 0.006,
  strokeRise: 0.004,
  strokeGapMin: 0.04,
  strokeGapMax: 0.12,
  strokeRatioMin: 0.55,
  strokeRatioMax: 1.05,
  shallowRatioMax: 0.95,
  deepPerSecond: 3,
  afterglowShare: 0.32,
  afterglowFade: 0.18,
  afterglowLag: 0.05,
  dipRise: 0.15,
  dipFade: 0.8,
  softPeak: 0.45,
  softRise: 0.14,
  softHold: 0.22,
  rollingChance: 0.15,
  forkArc: 1.1,
  forkFacing: -2.356,
} as const;

export type StrikeKind = 'sheet' | 'near' | 'fork' | 'moment' | 'pulse';

interface KindShape {
  readonly peakMin: number;
  readonly peakMax: number;
  readonly leaderRise: number;
  readonly leaderHold: number;
  readonly strokesMin: number;
  readonly strokesMax: number;
  readonly sheet: number;
  readonly distanceMin: number;
  readonly distanceMax: number;
}

export const STRIKE_KINDS: Readonly<Record<StrikeKind, KindShape>> = {
  sheet: { peakMin: 0.3, peakMax: 0.48, leaderRise: 0.16, leaderHold: 0.3, strokesMin: 0, strokesMax: 1, sheet: 1, distanceMin: 2500, distanceMax: 6000 },
  near: { peakMin: 0.68, peakMax: 0.85, leaderRise: LIGHTNING.leaderRise, leaderHold: LIGHTNING.deepHold, strokesMin: 1, strokesMax: 4, sheet: 0, distanceMin: 700, distanceMax: 1800 },
  fork: { peakMin: 0.5, peakMax: 0.68, leaderRise: LIGHTNING.leaderRise, leaderHold: LIGHTNING.deepHold, strokesMin: 0, strokesMax: 2, sheet: 0.45, distanceMin: 2000, distanceMax: 5000 },
  pulse: { peakMin: 1, peakMax: 1, leaderRise: 0.02, leaderHold: 0.12, strokesMin: 0, strokesMax: 0, sheet: 1, distanceMin: 0, distanceMax: 0 },
  moment: { peakMin: 1, peakMax: 1, leaderRise: LIGHTNING.leaderRise, leaderHold: LIGHTNING.deepHold, strokesMin: 1, strokesMax: 3, sheet: 0, distanceMin: 120, distanceMax: 300 },
};

export interface Pulse {
  readonly at: number;
  readonly from: number;
  readonly peak: number;
  readonly rise: number;
  readonly hold: number;
}

export interface StrikePlan {
  readonly kind: StrikeKind;
  readonly pulses: readonly Pulse[];
  readonly glowAt: number;
  readonly glow: number;
  readonly end: number;
  readonly angle: number;
  readonly sheet: number;
  readonly distance: number;
  readonly thunderDelay: number;
  readonly deepTimes: readonly number[];
}

export interface StrikeSample {
  readonly light: number;
  readonly stroke: number;
  readonly dip: number;
}

function between(random: () => number, low: number, high: number): number {
  return low + random() * (high - low);
}

function pulseAt(pulse: Pulse, time: number): number {
  const since: number = time - pulse.at;
  if (since < 0) return 0;
  if (since < pulse.rise) return pulse.from + (pulse.peak - pulse.from) * (since / pulse.rise);
  return pulse.peak * Math.exp(-(since - pulse.rise) / pulse.hold);
}

interface Draft {
  readonly at: number;
  readonly peak: number;
  readonly rise: number;
  hold: number;
}

function chain(drafts: readonly Draft[]): Pulse[] {
  const pulses: Pulse[] = [];
  for (const draft of drafts) {
    const previous: Pulse | undefined = pulses[pulses.length - 1];
    pulses.push({ ...draft, from: previous === undefined ? 0 : pulseAt(previous, draft.at) });
  }
  return pulses;
}

function softPlan(kind: StrikeKind, shape: KindShape, power: number, angle: number, distance: number): StrikePlan {
  const peak: number = Math.min(shape.peakMax, LIGHTNING.softPeak) * power;
  const pulses: Pulse[] = [{ at: 0, from: 0, peak, rise: LIGHTNING.softRise, hold: LIGHTNING.softHold }];
  const glowAt: number = LIGHTNING.softRise;
  return { kind, pulses, glowAt, glow: 0, end: glowAt + LIGHTNING.softHold * 6, angle, sheet: shape.sheet, distance, thunderDelay: distance / LIGHTNING.soundSpeed, deepTimes: [0] };
}

export interface PlanOptions {
  readonly soft: boolean;
  readonly power: number;
  readonly budget: number;
}

export function strikeAngle(kind: StrikeKind, random: () => number): number {
  if (kind === 'fork') return LIGHTNING.forkFacing + (random() - 0.5) * LIGHTNING.forkArc;
  return random() * Math.PI * 2;
}

export function planStrike(kind: StrikeKind, random: () => number, options: PlanOptions): StrikePlan {
  const shape: KindShape = STRIKE_KINDS[kind];
  const angle: number = strikeAngle(kind, random);
  const distance: number = between(random, shape.distanceMin, shape.distanceMax);
  if (options.soft) return softPlan(kind, shape, options.power, angle, distance);
  const leaderPeak: number = between(random, shape.peakMin, shape.peakMax) * options.power;
  const drafts: Draft[] = [{ at: 0, peak: leaderPeak, rise: shape.leaderRise, hold: shape.leaderHold }];
  const deepTimes: number[] = [0];
  const rolling: boolean = kind !== 'sheet' && kind !== 'pulse' && random() < LIGHTNING.rollingChance;
  const strokes: number = rolling ? shape.strokesMax : Math.floor(between(random, shape.strokesMin, shape.strokesMax + 0.999));
  let deep: number = 1;
  let at: number = 0;
  let level: number = leaderPeak;
  for (let index: number = 0; index < strokes; index += 1) {
    const previous: Draft | undefined = drafts[drafts.length - 1];
    if (previous === undefined) break;
    const gap: number = between(random, LIGHTNING.strokeGapMin, LIGHTNING.strokeGapMax) * (rolling ? 1.6 : 1);
    const canDeep: boolean = deep < Math.min(LIGHTNING.deepPerSecond, options.budget) && kind !== 'sheet';
    const ratio: number = between(random, LIGHTNING.strokeRatioMin, canDeep ? LIGHTNING.strokeRatioMax : LIGHTNING.shallowRatioMax);
    previous.hold = canDeep ? LIGHTNING.deepHold : (gap - previous.rise) / -Math.log(LIGHTNING.shallowKeep);
    at += gap;
    level = Math.min(options.power, level * ratio);
    drafts.push({ at, peak: level, rise: LIGHTNING.strokeRise, hold: LIGHTNING.deepHold });
    if (canDeep) {
      deep += 1;
      deepTimes.push(at);
    }
  }
  const pulses: Pulse[] = chain(drafts);
  const last: Pulse | undefined = pulses[pulses.length - 1];
  const glowAt: number = (last?.at ?? 0) + (last?.rise ?? 0) + LIGHTNING.afterglowLag;
  const glow: number = leaderPeak * LIGHTNING.afterglowShare;
  return { kind, pulses, glowAt, glow, end: glowAt + LIGHTNING.dipRise + LIGHTNING.dipFade * 3, angle, sheet: shape.sheet, distance, thunderDelay: distance / LIGHTNING.soundSpeed, deepTimes };
}

export function sampleStrike(plan: StrikePlan, time: number): StrikeSample {
  let current: Pulse | undefined;
  for (const pulse of plan.pulses) if (pulse.at <= time) current = pulse;
  const stroke: number = current === undefined ? 0 : pulseAt(current, time);
  const sinceGlow: number = time - plan.glowAt;
  const glow: number = sinceGlow < 0 ? 0 : plan.glow * Math.exp(-sinceGlow / LIGHTNING.afterglowFade);
  const dip: number = sinceGlow < 0 ? 0 : sinceGlow < LIGHTNING.dipRise ? sinceGlow / LIGHTNING.dipRise : Math.exp(-(sinceGlow - LIGHTNING.dipRise) / LIGHTNING.dipFade);
  return { light: Math.max(stroke, glow), stroke, dip: plan.glow > 0 ? dip : 0 };
}
