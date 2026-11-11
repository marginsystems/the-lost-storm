export interface VoiceLimiter {
  tryStart(id: string, maxVoices: number, cooldown: number): boolean;
  end(id: string): void;
  active(id: string): number;
}

export function createVoiceLimiter(now: () => number): VoiceLimiter {
  const counts: Map<string, number> = new Map<string, number>();
  const started: Map<string, number> = new Map<string, number>();
  return {
    tryStart(id: string, maxVoices: number, cooldown: number): boolean {
      const time: number = now();
      const last: number | undefined = started.get(id);
      if (last !== undefined && time - last < cooldown) return false;
      const count: number = counts.get(id) ?? 0;
      if (count >= maxVoices) return false;
      counts.set(id, count + 1);
      started.set(id, time);
      return true;
    },
    end(id: string): void {
      const count: number = counts.get(id) ?? 0;
      if (count > 0) counts.set(id, count - 1);
    },
    active(id: string): number {
      return counts.get(id) ?? 0;
    },
  };
}
