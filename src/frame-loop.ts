export interface FrameScheduler {
  request(callback: (now: number) => void): void;
}

export function runFrames(step: (now: number) => void, fault: (error: unknown) => void, scheduler: FrameScheduler): void {
  let faulted: boolean = false;
  const tick = (now: number): void => {
    scheduler.request(tick);
    try {
      step(now);
    } catch (error: unknown) {
      if (faulted) return;
      faulted = true;
      fault(error);
    }
  };
  scheduler.request(tick);
}
