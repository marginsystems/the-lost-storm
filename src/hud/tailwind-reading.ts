import type { TailwindDef } from '../../sim/content/tailwind-types.ts';
import type { TailwindState } from '../../sim/world/tailwind-types.ts';
import type { Spring } from './character-spring.ts';
import { springTo, stepSpring } from './character-spring.ts';
import { clamp01 } from './dom.ts';

export const TAILWIND_METER = {
  endHold: 2.8,
  endFade: 0.9,
  longestFrame: 0.1,
  hidden: 0.002,
} as const;

export type TailwindPhase = 'calm' | 'live' | 'ended';

export interface TailwindSpent {
  readonly best: number;
  readonly points: number;
  readonly xp: number;
  readonly gold: number;
  left: number;
}

export interface TailwindMeterState {
  readonly shown: Spring;
  readonly fuse: Spring;
  readonly over: Spring;
  readonly heat: Spring;
  tier: number;
  spent: TailwindSpent | null;
}

export interface TailwindReading {
  readonly phase: TailwindPhase;
  readonly shown: number;
  readonly fuse: number;
  readonly over: number;
  readonly heat: number;
  readonly tier: number;
  readonly name: string;
  readonly count: string;
  readonly windfall: string;
  readonly rose: boolean;
}

function still(): Spring {
  return { value: 0, velocity: 0, target: 0 };
}

export function createTailwindMeter(): TailwindMeterState {
  return { shown: still(), fuse: still(), over: still(), heat: still(), tier: 0, spent: null };
}

export function windfallText(xp: number, gold: number): string {
  const parts: string[] = [];
  if (gold > 0) parts.push(`+${gold} gold`);
  if (xp > 0) parts.push(`+${xp} experience`);
  return parts.join('  ');
}

export function spendTailwind(state: TailwindMeterState, best: number, points: number, xp: number, gold: number): void {
  state.spent = best > 0 ? { best, points, xp, gold, left: TAILWIND_METER.endHold } : null;
}

function tierName(def: TailwindDef, tier: number): string {
  return def.tiers[tier - 1]?.name ?? '';
}

export function readTailwind(state: TailwindMeterState, live: TailwindState, def: TailwindDef, dt: number): TailwindReading {
  const top: number = Math.max(1, def.tiers.length);
  const burning: boolean = live.tier > 0;
  if (burning) state.spent = null;
  const spent: TailwindSpent | null = burning ? null : state.spent;
  if (spent !== null) spent.left -= dt;
  const ending: boolean = spent !== null && spent.left > 0;
  const phase: TailwindPhase = burning ? 'live' : ending ? 'ended' : 'calm';
  const rose: boolean = burning && live.tier > state.tier;
  state.tier = burning ? live.tier : 0;
  const full: number = Math.max(live.full, Number.EPSILON);
  const most: number = Math.max(def.burst.most - 1, Number.EPSILON);
  springTo(state.shown, phase === 'live' || (spent !== null && spent.left > TAILWIND_METER.endFade) ? 1 : 0);
  springTo(state.fuse, burning ? clamp01(live.fuse / full) : 0);
  springTo(state.over, burning ? clamp01((live.fuse - full) / (full * most)) : 0);
  springTo(state.heat, burning ? live.tier / top : spent !== null ? spent.best / top : 0);
  for (const spring of [state.shown, state.fuse, state.over, state.heat]) stepSpring(spring, dt);
  if (spent !== null && spent.left <= 0) state.spent = null;
  const tier: number = burning ? live.tier : (spent?.best ?? 0);
  return {
    phase,
    shown: clamp01(state.shown.value),
    fuse: clamp01(state.fuse.value),
    over: clamp01(state.over.value),
    heat: clamp01(state.heat.value),
    tier,
    name: tierName(def, tier),
    count: burning ? String(live.points) : spent === null ? '' : String(spent.points),
    windfall: spent === null ? '' : windfallText(spent.xp, spent.gold),
    rose,
  };
}
