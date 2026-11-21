export type Work<T = void> = Generator<void, T>;

export function drained<T>(work: Work<T>): T {
  for (;;) {
    const step: IteratorResult<void, T> = work.next();
    if (step.done === true) return step.value;
  }
}
