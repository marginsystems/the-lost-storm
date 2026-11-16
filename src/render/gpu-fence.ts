export interface FenceContext {
  readonly SYNC_GPU_COMMANDS_COMPLETE: number;
  readonly SYNC_STATUS: number;
  readonly SIGNALED: number;
  fenceSync(condition: number, flags: number): WebGLSync | null;
  getSyncParameter(sync: WebGLSync, pname: number): unknown;
  deleteSync(sync: WebGLSync | null): void;
  flush(): void;
}

export interface GpuQueue {
  mark(): void;
  waiting(): number;
}

export function createGpuQueue(context: FenceContext | null): GpuQueue {
  const open: WebGLSync[] = [];
  return {
    mark(): void {
      if (context === null) return;
      const sync: WebGLSync | null = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (sync === null) return;
      open.push(sync);
      context.flush();
    },
    waiting(): number {
      if (context === null) return 0;
      while (open.length > 0) {
        const oldest: WebGLSync | undefined = open[0];
        if (oldest === undefined || context.getSyncParameter(oldest, context.SYNC_STATUS) !== context.SIGNALED) break;
        context.deleteSync(oldest);
        open.shift();
      }
      return open.length;
    },
  };
}
