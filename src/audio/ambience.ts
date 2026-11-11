export interface AmbienceBatch<L> {
  readonly generation: number;
  readonly loops: readonly L[];
}

export interface AmbienceTracker<L> {
  start(loops: readonly L[]): void;
  stop(): void;
  current(generation: number): boolean;
  take(): AmbienceBatch<L> | null;
  settle(batch: AmbienceBatch<L>, retry: readonly L[]): void;
}

export function createAmbienceTracker<L>(): AmbienceTracker<L> {
  let generation: number = 0;
  let wanted: L[] = [];
  let inFlight: boolean = false;
  return {
    start(loops: readonly L[]): void {
      generation += 1;
      wanted = [...loops];
      inFlight = false;
    },
    stop(): void {
      generation += 1;
      wanted = [];
      inFlight = false;
    },
    current(candidate: number): boolean {
      return candidate === generation;
    },
    take(): AmbienceBatch<L> | null {
      if (inFlight || wanted.length === 0) return null;
      inFlight = true;
      const loops: readonly L[] = wanted;
      wanted = [];
      return { generation, loops };
    },
    settle(batch: AmbienceBatch<L>, retry: readonly L[]): void {
      if (batch.generation !== generation) return;
      wanted.push(...retry);
      inFlight = false;
    },
  };
}
