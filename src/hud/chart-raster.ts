export const CHART_RASTER = {
  growth: 1.2,
  shrink: 2.4,
  restGrowth: 1.03,
  releaseFrames: 2,
} as const;

export type RasterState = { readonly phase: 'held'; readonly scale: number } | { readonly phase: 'released'; readonly frames: number };

export interface RasterStep {
  readonly state: RasterState;
  readonly hold: boolean;
}

export const FRESH_RASTER: RasterState = { phase: 'released', frames: 0 };

export function stepRaster(state: RasterState, scale: number, resting: boolean): RasterStep {
  if (state.phase === 'held') {
    const soft: boolean = scale > state.scale * (resting ? CHART_RASTER.restGrowth : CHART_RASTER.growth);
    const wasteful: boolean = resting && scale * CHART_RASTER.shrink < state.scale;
    return soft || wasteful ? { state: { phase: 'released', frames: 0 }, hold: false } : { state, hold: true };
  }
  const frames: number = state.frames + 1;
  return frames >= CHART_RASTER.releaseFrames ? { state: { phase: 'held', scale }, hold: true } : { state: { phase: 'released', frames }, hold: false };
}
