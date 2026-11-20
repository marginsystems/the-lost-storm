export const RENDER_SCALE = {
  budgetMs: 1000 / 60,
  missedAfter: 1.5,
  gpuWorkShare: 0.6,
  gpuBacklog: 2,
  ignoreOverMs: 250,
  window: 30,
  dropShare: 0.12,
  raiseShare: 0.03,
  raiseAfter: 240,
  raiseMost: 3600,
  backoff: 2,
  undoneWithin: 180,
  settle: 15,
  floorRatio: 1,
  steps: [1, 0.875, 0.75, 0.6875],
} as const;

export interface FrameSample {
  readonly intervalMs: number;
  readonly workMs: number;
  readonly gpuQueued: number;
}

export interface RenderScale {
  readonly scale: number;
  fit(pixelRatio: number): boolean;
  observe(sample: FrameSample): boolean;
}

export function scaleSteps(pixelRatio: number): readonly number[] {
  return RENDER_SCALE.steps.filter((step: number): boolean => step === 1 || pixelRatio * step >= RENDER_SCALE.floorRatio);
}

export function createRenderScale(pixelRatio: number): RenderScale {
  let base: number = pixelRatio;
  let steps: readonly number[] = scaleSteps(base);
  let level: number = 0;
  let frame: number = 0;
  let settle: number = 0;
  let windowFrames: number = 0;
  let windowMisses: number = 0;
  let calmFrames: number = 0;
  let calmMisses: number = 0;
  let raiseNeed: number = RENDER_SCALE.raiseAfter;
  let raisedAt: number = Number.NEGATIVE_INFINITY;

  const restart = (): void => {
    settle = RENDER_SCALE.settle;
    windowFrames = 0;
    windowMisses = 0;
    calmFrames = 0;
    calmMisses = 0;
  };

  return {
    get scale(): number {
      return steps[level] ?? 1;
    },
    fit(next: number): boolean {
      if (next === base) return false;
      const before: number = steps[level] ?? 1;
      base = next;
      steps = scaleSteps(base);
      level = 0;
      raiseNeed = RENDER_SCALE.raiseAfter;
      restart();
      return before !== 1;
    },
    observe(sample: FrameSample): boolean {
      if (!(sample.intervalMs > 0) || sample.intervalMs > RENDER_SCALE.ignoreOverMs) return false;
      frame += 1;
      if (settle > 0) {
        settle -= 1;
        return false;
      }
      const missed: boolean = sample.intervalMs > RENDER_SCALE.budgetMs * RENDER_SCALE.missedAfter;
      const onGpu: boolean = missed && (sample.workMs < RENDER_SCALE.budgetMs * RENDER_SCALE.gpuWorkShare || sample.gpuQueued >= RENDER_SCALE.gpuBacklog);
      windowFrames += 1;
      if (onGpu) windowMisses += 1;
      calmFrames += 1;
      if (missed) calmMisses += 1;
      if (windowFrames >= RENDER_SCALE.window) {
        const dropping: boolean = windowMisses / windowFrames >= RENDER_SCALE.dropShare && level < steps.length - 1;
        windowFrames = 0;
        windowMisses = 0;
        if (dropping) {
          if (frame - raisedAt <= RENDER_SCALE.undoneWithin) raiseNeed = Math.min(RENDER_SCALE.raiseMost, raiseNeed * RENDER_SCALE.backoff);
          level += 1;
          restart();
          return true;
        }
      }
      if (calmFrames >= raiseNeed) {
        const raising: boolean = calmMisses / calmFrames <= RENDER_SCALE.raiseShare && level > 0;
        calmFrames = 0;
        calmMisses = 0;
        if (raising) {
          level -= 1;
          raisedAt = frame;
          restart();
          return true;
        }
      }
      return false;
    },
  };
}
