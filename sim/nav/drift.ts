import type { ZoneDrift } from '../content/road-types.ts';

function phaseOf(drift: ZoneDrift, time: number): number {
  const turn: number = (time + drift.offset) % drift.period;
  return turn < 0 ? turn + drift.period : turn;
}

export function driftOpen(drift: ZoneDrift, time: number): boolean {
  return phaseOf(drift, time) < drift.open * drift.period;
}

export function driftShown(drift: ZoneDrift, time: number): number {
  const phase: number = phaseOf(drift, time);
  const openFor: number = drift.open * drift.period;
  if (phase >= openFor) return 0;
  if (drift.fade <= 0) return 1;
  return Math.min(1, phase / drift.fade, (openFor - phase) / drift.fade);
}
