export const PACED_WORK = {
  frameBudgetMs: 6,
} as const;

export interface FramePacer {
  now(): number;
  next(): Promise<void>;
}

export function browserPacer(): FramePacer {
  return {
    now(): number {
      return performance.now();
    },
    next(): Promise<void> {
      return new Promise<void>((resolve: () => void): void => {
        requestAnimationFrame((): void => {
          resolve();
        });
      });
    },
  };
}

export function workPaced<T>(items: readonly T[], work: (item: T) => void, pacer: FramePacer, budgetMs: number = PACED_WORK.frameBudgetMs): Promise<void> {
  const run = async (from: number): Promise<void> => {
    const started: number = pacer.now();
    let index: number = from;
    while (index < items.length && (index === from || pacer.now() - started < budgetMs)) {
      const item: T | undefined = items[index];
      if (item !== undefined) work(item);
      index += 1;
    }
    if (index >= items.length) return;
    await pacer.next();
    await run(index);
  };
  return run(0);
}
