export const PLAY = {
  idLength: 32,
} as const;

export interface PlayStamp {
  readonly id: string;
  readonly claim: boolean;
}

export interface Play {
  readonly id: string;
  renew(next: string): void;
  stamp(): PlayStamp;
  claimed(): void;
  replaced(): boolean;
  replace(): void;
  onReplaced(listener: () => void): void;
}

export function playId(random: () => number): string {
  const digits: string[] = [];
  for (let index: number = 0; index < PLAY.idLength; index += 1) digits.push(Math.floor(Math.min(0.999_999, Math.max(0, random())) * 16).toString(16));
  return digits.join('');
}

export function createPlay(first: string): Play {
  let id: string = first;
  let claimed: boolean = false;
  let replaced: boolean = false;
  const listeners: (() => void)[] = [];
  return {
    get id(): string {
      return id;
    },
    renew(next: string): void {
      id = next;
      claimed = false;
    },
    stamp: (): PlayStamp => ({ id, claim: !claimed }),
    claimed(): void {
      claimed = true;
    },
    replaced: (): boolean => replaced,
    replace(): void {
      if (replaced) return;
      replaced = true;
      for (const listener of listeners.splice(0, listeners.length)) listener();
    },
    onReplaced(listener: () => void): void {
      if (replaced) listener();
      else listeners.push(listener);
    },
  };
}
