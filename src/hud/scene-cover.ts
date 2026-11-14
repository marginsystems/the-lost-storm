import type { OverlayState } from './overlay-core.ts';

export function sceneCovered(state: OverlayState): boolean {
  return state.phase.chart === 'open';
}
