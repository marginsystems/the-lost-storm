export async function within<T>(milliseconds: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller: AbortController = new AbortController();
  const expired: Promise<never> = new Promise<never>((_resolve: (value: never) => void, reject: (reason: Error) => void): void => {
    controller.signal.addEventListener('abort', (): void => reject(new Error('timed out')), { once: true });
  });
  const timer: ReturnType<typeof setTimeout> = setTimeout((): void => controller.abort(), milliseconds);
  try {
    return await Promise.race([work(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}
