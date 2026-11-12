export interface LoadHealth {
  readonly failing: boolean;
  note(ok: boolean): void;
  subscribe(listener: (failing: boolean) => void): void;
}

export function createLoadHealth(): LoadHealth {
  const listeners: ((failing: boolean) => void)[] = [];
  let failing: boolean = false;
  return {
    get failing(): boolean {
      return failing;
    },
    note(ok: boolean): void {
      if (failing === !ok) return;
      failing = !ok;
      for (const listener of listeners) listener(failing);
    },
    subscribe(listener: (failing: boolean) => void): void {
      listeners.push(listener);
    },
  };
}
