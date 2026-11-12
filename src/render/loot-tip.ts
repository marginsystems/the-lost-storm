export interface TipCheck {
  readonly present: boolean;
  readonly leaving: boolean;
  readonly sameZone: boolean;
  readonly underPointer: boolean;
}

export interface LootTip {
  owner(): number | null;
  enter(id: number, leaving: boolean, show: () => void): void;
  leave(id: number): void;
  check(look: (id: number) => TipCheck): void;
  drop(): void;
}

export function keepsTip(check: TipCheck): boolean {
  return check.present && !check.leaving && check.sameZone && check.underPointer;
}

export function createLootTip(hide: () => void): LootTip {
  let owner: number | null = null;
  const release = (): void => {
    if (owner === null) return;
    owner = null;
    hide();
  };
  return {
    owner(): number | null {
      return owner;
    },
    enter(id: number, leaving: boolean, show: () => void): void {
      if (leaving) return;
      owner = id;
      show();
    },
    leave(id: number): void {
      if (owner === id) release();
    },
    check(look: (id: number) => TipCheck): void {
      if (owner !== null && !keepsTip(look(owner))) release();
    },
    drop(): void {
      release();
    },
  };
}
