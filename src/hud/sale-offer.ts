export interface SaleOffer {
  uids(): readonly number[];
  toggle(uid: number): void;
  clear(): void;
  watch(listener: () => void): void;
}

export function createSaleOffer(): SaleOffer {
  const listeners: (() => void)[] = [];
  let selected: number[] = [];
  return {
    uids(): readonly number[] {
      return selected;
    },
    toggle(uid: number): void {
      if (selected.includes(uid)) selected = selected.filter((id: number): boolean => id !== uid);
      else selected.push(uid);
      for (const listener of listeners) listener();
    },
    clear(): void {
      if (selected.length === 0) return;
      selected = [];
      for (const listener of listeners) listener();
    },
    watch(listener: () => void): void {
      listeners.push(listener);
    },
  };
}
